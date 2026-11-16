import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { v4 as uuidv4 } from "uuid";

export const TZAVTA_BUCKET = "giti-bug-attachments";

const UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;

export function isUploadTicketSecretConfigured(): boolean {
  const secret = process.env.UPLOAD_TICKET_SECRET?.trim();
  return Boolean(secret && secret.length >= MIN_SECRET_LENGTH);
}

function getUploadTicketSecret(): string {
  const secret = process.env.UPLOAD_TICKET_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error("UPLOAD_TICKET_SECRET not configured or too short");
  }
  return secret;
}

export type RecordingGrant = {
  typ: "grant";
  bugId: string;
  userId: string;
  mime: "video/webm" | "video/mp4";
  nonce: string;
  expiresAt: number;
};

export type ClaimGrantResult =
  | { ok: true }
  | { ok: false; error: "already_used" | "unavailable" };

type MinimalDbClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
  };
};

export async function claimGrantNonce(
  nonce: string,
  client: MinimalDbClient | null
): Promise<ClaimGrantResult> {
  if (!client) {
    return { ok: false, error: "unavailable" };
  }

  try {
    const { error } = await client.from("email_rate_limits").insert({
      bucket_key: `problem-report-grant:${nonce}`,
      window_start: new Date().toISOString(),
      hit_count: 1,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "already_used" };
      }
      console.error("[attachments] grant claim failed:", error.message);
      return { ok: false, error: "unavailable" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[attachments] grant claim error:", err);
    return { ok: false, error: "unavailable" };
  }
}

export function createRecordingGrant(params: {
  bugId: string;
  userId: string;
  mime: "video/webm" | "video/mp4";
}): string {
  const nonce = uuidv4();
  const grant: RecordingGrant = {
    typ: "grant",
    ...params,
    nonce,
    expiresAt: Date.now() + UPLOAD_TICKET_TTL_MS,
  };
  const payload = JSON.stringify(grant);
  const signature = createHmac("sha256", getUploadTicketSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyRecordingGrant(
  token: string,
  userId: string
): { ok: true; grant: RecordingGrant } | { ok: false; error: string } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return { ok: false, error: "invalid_format" };

    const payload = decoded.slice(0, lastDot);
    const providedSig = decoded.slice(lastDot + 1);

    const expectedSig = createHmac("sha256", getUploadTicketSecret())
      .update(payload)
      .digest("hex");

    const sigBuffer = Buffer.from(providedSig, "hex");
    const expectedBuffer = Buffer.from(expectedSig, "hex");
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return { ok: false, error: "invalid_signature" };
    }

    const grant = JSON.parse(payload) as RecordingGrant;

    if (grant.typ !== "grant") {
      return { ok: false, error: "invalid_type" };
    }

    if (grant.expiresAt < Date.now()) {
      return { ok: false, error: "expired" };
    }

    if (grant.userId !== userId) {
      return { ok: false, error: "user_mismatch" };
    }

    return { ok: true, grant };
  } catch {
    return { ok: false, error: "invalid_token" };
  }
}

export type UploadTicket = {
  typ: "ticket";
  bugId: string;
  storagePath: string;
  mime: string;
  userId: string;
  expiresAt: number;
};

export function createUploadTicket(params: {
  bugId: string;
  storagePath: string;
  mime: string;
  userId: string;
}): string {
  const ticket: UploadTicket = {
    typ: "ticket",
    ...params,
    expiresAt: Date.now() + UPLOAD_TICKET_TTL_MS,
  };
  const payload = JSON.stringify(ticket);
  const signature = createHmac("sha256", getUploadTicketSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyUploadTicket(
  token: string,
  userId: string
): { ok: true; ticket: UploadTicket } | { ok: false; error: string } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return { ok: false, error: "invalid_format" };

    const payload = decoded.slice(0, lastDot);
    const providedSig = decoded.slice(lastDot + 1);

    const expectedSig = createHmac("sha256", getUploadTicketSecret())
      .update(payload)
      .digest("hex");

    const sigBuffer = Buffer.from(providedSig, "hex");
    const expectedBuffer = Buffer.from(expectedSig, "hex");
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return { ok: false, error: "invalid_signature" };
    }

    const ticket = JSON.parse(payload) as UploadTicket;

    if (ticket.typ !== "ticket") {
      return { ok: false, error: "invalid_type" };
    }

    if (ticket.expiresAt < Date.now()) {
      return { ok: false, error: "expired" };
    }

    if (ticket.userId !== userId) {
      return { ok: false, error: "user_mismatch" };
    }

    return { ok: true, ticket };
  } catch {
    return { ok: false, error: "invalid_token" };
  }
}

export type AttachmentKind = "screenshot" | "recording" | "techlog";

export const ATTACHMENT_LIMITS = {
  screenshot: {
    maxBytes: 5 * 1024 * 1024,
    maxCount: 3,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
  },
  recording: {
    maxBytes: 20 * 1024 * 1024,
    maxCount: 1,
    mimeTypes: ["video/webm", "video/mp4"] as const,
  },
  techlog: {
    maxBytes: 200 * 1024,
    maxCount: 1,
    mimeTypes: ["application/json"] as const,
  },
} as const;

export type AttachmentMimeType =
  | (typeof ATTACHMENT_LIMITS.screenshot.mimeTypes)[number]
  | (typeof ATTACHMENT_LIMITS.recording.mimeTypes)[number]
  | (typeof ATTACHMENT_LIMITS.techlog.mimeTypes)[number];

const MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
  "video/webm": [0x1a, 0x45, 0xdf, 0xa3],
  "video/mp4": [0x00, 0x00, 0x00],
};

export function validateMagicBytes(
  data: Uint8Array,
  expectedMime: string
): boolean {
  const magic = MAGIC_BYTES[expectedMime];
  if (!magic) return true;

  if (expectedMime === "video/mp4") {
    if (data.length < 12) return false;
    const ftypOffset = 4;
    const ftyp = String.fromCharCode(...data.slice(ftypOffset, ftypOffset + 4));
    return ftyp === "ftyp";
  }

  if (expectedMime === "image/webp") {
    if (data.length < 12) return false;
    const riff = data.slice(0, 4);
    const webp = data.slice(8, 12);
    return (
      riff[0] === 0x52 &&
      riff[1] === 0x49 &&
      riff[2] === 0x46 &&
      riff[3] === 0x46 &&
      webp[0] === 0x57 &&
      webp[1] === 0x45 &&
      webp[2] === 0x42 &&
      webp[3] === 0x50
    );
  }

  for (let i = 0; i < magic.length; i++) {
    if (data[i] !== magic[i]) return false;
  }
  return true;
}

export function getExtensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/webm": "webm",
    "video/mp4": "mp4",
    "application/json": "json",
  };
  return map[mime] ?? "bin";
}

export function isValidAttachmentMime(
  kind: AttachmentKind,
  mime: string
): mime is AttachmentMimeType {
  const limits = ATTACHMENT_LIMITS[kind];
  return (limits.mimeTypes as readonly string[]).includes(mime);
}

export function validateAttachmentSize(
  kind: AttachmentKind,
  sizeBytes: number
): boolean {
  return sizeBytes <= ATTACHMENT_LIMITS[kind].maxBytes;
}

export type AttachmentInput = {
  kind: AttachmentKind;
  data: Uint8Array;
  mime: string;
};

export type AttachmentUploadResult =
  | { ok: true; storagePath: string; sizeBytes: number }
  | { ok: false; error: string };

export type SignedUploadUrlResult =
  | { ok: true; signedUrl: string; storagePath: string; uploadTicket: string }
  | { ok: false; error: string };

export function createTzavtaStorageClient(): SupabaseClient | null {
  const url = process.env.TZAVTA_SUPABASE_URL?.trim();
  const key = process.env.TZAVTA_SERVICE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function uploadAttachment(
  bugId: string,
  input: AttachmentInput,
  client: SupabaseClient | null = createTzavtaStorageClient()
): Promise<AttachmentUploadResult> {
  if (!client) {
    return { ok: false, error: "storage_not_configured" };
  }

  if (!isValidAttachmentMime(input.kind, input.mime)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  if (!validateAttachmentSize(input.kind, input.data.length)) {
    return { ok: false, error: "file_too_large" };
  }

  if (!validateMagicBytes(input.data, input.mime)) {
    return { ok: false, error: "invalid_file_content" };
  }

  const ext = getExtensionForMime(input.mime);
  const filename = `${uuidv4()}.${ext}`;
  const storagePath = `${bugId}/${filename}`;

  const { error } = await client.storage
    .from(TZAVTA_BUCKET)
    .upload(storagePath, input.data, {
      contentType: input.mime,
      upsert: false,
    });

  if (error) {
    console.error("[attachments] upload failed:", error.message);
    return { ok: false, error: "upload_failed" };
  }

  return { ok: true, storagePath, sizeBytes: input.data.length };
}

export async function createSignedUploadUrl(
  bugId: string,
  kind: AttachmentKind,
  mime: string,
  userId: string,
  client: SupabaseClient | null = createTzavtaStorageClient()
): Promise<SignedUploadUrlResult> {
  if (!client) {
    return { ok: false, error: "storage_not_configured" };
  }

  if (!isValidAttachmentMime(kind, mime)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  const ext = getExtensionForMime(mime);
  const filename = `${uuidv4()}.${ext}`;
  const storagePath = `${bugId}/${filename}`;

  const { data, error } = await client.storage
    .from(TZAVTA_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("[attachments] signed url failed:", error?.message);
    return { ok: false, error: "signed_url_failed" };
  }

  const uploadTicket = createUploadTicket({
    bugId,
    storagePath,
    mime,
    userId,
  });

  return {
    ok: true,
    signedUrl: data.signedUrl,
    storagePath,
    uploadTicket,
  };
}

export async function insertBugAttachment(
  bugId: string,
  kind: AttachmentKind,
  storagePath: string,
  mime: string,
  sizeBytes: number,
  client: SupabaseClient | null = createTzavtaStorageClient()
): Promise<{ ok: boolean; error?: string }> {
  if (!client) {
    return { ok: false, error: "storage_not_configured" };
  }

  const { error } = await client.from("bug_attachments").insert({
    bug_id: bugId,
    kind,
    storage_path: storagePath,
    mime,
    size_bytes: sizeBytes,
  });

  if (error) {
    console.error("[attachments] insert row failed:", error.message);
    return { ok: false, error: "insert_failed" };
  }

  return { ok: true };
}

export type VerifyObjectResult =
  | { ok: true; sizeBytes: number; contentType: string | null }
  | { ok: false; error: string };

export async function verifyStorageObject(
  storagePath: string,
  client: SupabaseClient | null = createTzavtaStorageClient()
): Promise<VerifyObjectResult> {
  if (!client) {
    return { ok: false, error: "storage_not_configured" };
  }

  const folder = storagePath.split("/").slice(0, -1).join("/");
  const filename = storagePath.split("/").pop();

  const { data, error } = await client.storage.from(TZAVTA_BUCKET).list(folder, {
    limit: 100,
    search: filename,
  });

  if (error) {
    console.error("[attachments] list failed:", error.message);
    return { ok: false, error: "verification_failed" };
  }

  const file = data?.find((f) => f.name === filename);
  if (!file) {
    return { ok: false, error: "object_not_found" };
  }

  return {
    ok: true,
    sizeBytes: file.metadata?.size ?? 0,
    contentType: file.metadata?.mimetype ?? null,
  };
}

export async function fetchObjectMagicBytes(
  storagePath: string,
  client: SupabaseClient | null = createTzavtaStorageClient()
): Promise<Uint8Array | null> {
  if (!client) return null;

  const { data: signedData } = await client.storage
    .from(TZAVTA_BUCKET)
    .createSignedUrl(storagePath, 60);

  if (!signedData?.signedUrl) return null;

  try {
    const response = await fetch(signedData.signedUrl, {
      headers: { Range: "bytes=0-15" },
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

export async function confirmSignedUpload(
  uploadTicket: string,
  userId: string,
  kind: AttachmentKind,
  client: SupabaseClient | null = createTzavtaStorageClient()
): Promise<{ ok: boolean; error?: string }> {
  if (!client) {
    return { ok: false, error: "storage_not_configured" };
  }

  const ticketResult = verifyUploadTicket(uploadTicket, userId);
  if (!ticketResult.ok) {
    return { ok: false, error: `ticket_${ticketResult.error}` };
  }

  const { bugId, storagePath, mime } = ticketResult.ticket;
  const pathPattern = new RegExp(`^${bugId}/[0-9a-f-]{36}\\.(webm|mp4)$`);
  if (!pathPattern.test(storagePath)) {
    return { ok: false, error: "invalid_path" };
  }

  const objectInfo = await verifyStorageObject(storagePath, client);
  if (!objectInfo.ok) {
    return { ok: false, error: objectInfo.error };
  }

  const sizeBytes = objectInfo.sizeBytes;
  if (sizeBytes <= 0) {
    await client.storage.from(TZAVTA_BUCKET).remove([storagePath]);
    return { ok: false, error: "invalid_size" };
  }

  if (!validateAttachmentSize(kind, sizeBytes)) {
    await client.storage.from(TZAVTA_BUCKET).remove([storagePath]);
    return { ok: false, error: "file_too_large" };
  }

  const storedContentType = objectInfo.contentType?.split(";")[0]?.trim() ?? null;
  if (storedContentType !== mime) {
    await client.storage.from(TZAVTA_BUCKET).remove([storagePath]);
    return { ok: false, error: "mime_mismatch" };
  }

  const magicBytes = await fetchObjectMagicBytes(storagePath, client);
  if (!magicBytes || !validateMagicBytes(magicBytes, mime)) {
    await client.storage.from(TZAVTA_BUCKET).remove([storagePath]);
    return { ok: false, error: "invalid_file_content" };
  }

  const { data: existing } = await client
    .from("bug_attachments")
    .select("id")
    .eq("storage_path", storagePath)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { ok: true };
  }

  return insertBugAttachment(bugId, kind, storagePath, mime, sizeBytes, client);
}

export type AttachmentCounts = {
  screenshots: number;
  recordings: number;
  techlogs: number;
};

export function validateAttachmentCounts(counts: AttachmentCounts): {
  ok: boolean;
  error?: string;
} {
  if (counts.screenshots > ATTACHMENT_LIMITS.screenshot.maxCount) {
    return { ok: false, error: `לכל היותר ${ATTACHMENT_LIMITS.screenshot.maxCount} צילומי מסך` };
  }
  if (counts.recordings > ATTACHMENT_LIMITS.recording.maxCount) {
    return { ok: false, error: `לכל היותר ${ATTACHMENT_LIMITS.recording.maxCount} הקלטה` };
  }
  if (counts.techlogs > ATTACHMENT_LIMITS.techlog.maxCount) {
    return { ok: false, error: `לכל היותר ${ATTACHMENT_LIMITS.techlog.maxCount} יומן טכני` };
  }
  return { ok: true };
}
