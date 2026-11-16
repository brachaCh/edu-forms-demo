import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  STUDENT_DOCUMENTS_BUCKET,
  assertStoragePathBelongsToInstitution,
  buildStudentDocumentStorageRef,
  isSafeStudentDocumentStoragePath,
  studentDocumentStorageFileName,
} from "@/lib/student-document-storage-ref";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-guard";
import { assertUploadMagicFromBytes } from "@/lib/upload-magic";

const UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000;
const SIGNED_DOWNLOAD_TTL_SEC = 60 * 60;
const MAGIC_RANGE = "bytes=0-1023";

export type StudentDocumentUploadKind = "upload" | "paper-waiver";

export type StudentDocumentUploadTicket = {
  typ: "student-doc";
  institutionId: string;
  studentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  folder: string;
  kind: StudentDocumentUploadKind;
  userId: string;
  expiresAt: number;
};

function ticketSecret(): string | null {
  const dedicated = process.env.UPLOAD_TICKET_SECRET?.trim();
  if (dedicated && dedicated.length >= 32) return dedicated;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return service || null;
}

export function isStudentDocumentUploadConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      ticketSecret()
  );
}

export function createStudentDocumentStorageClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let bucketReady = false;

export async function ensureStudentDocumentsBucket(
  client: SupabaseClient | null = createStudentDocumentStorageClient()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!client) return { ok: false, error: "storage_not_configured" };
  if (bucketReady) return { ok: true };

  const existing = await client.storage.getBucket(STUDENT_DOCUMENTS_BUCKET);
  if (!existing.error && existing.data) {
    bucketReady = true;
    return { ok: true };
  }

  const created = await client.storage.createBucket(STUDENT_DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
  });
  if (created.error) {
    const retry = await client.storage.getBucket(STUDENT_DOCUMENTS_BUCKET);
    if (!retry.error && retry.data) {
      bucketReady = true;
      return { ok: true };
    }
    console.error("[student-document-storage] createBucket failed:", created.error.message);
    return { ok: false, error: "bucket_unavailable" };
  }
  bucketReady = true;
  return { ok: true };
}

export function createStudentDocumentUploadTicket(
  params: Omit<StudentDocumentUploadTicket, "typ" | "expiresAt">
): string {
  const secret = ticketSecret();
  if (!secret) throw new Error("UPLOAD_TICKET_SECRET_MISSING");
  const ticket: StudentDocumentUploadTicket = {
    typ: "student-doc",
    ...params,
    expiresAt: Date.now() + UPLOAD_TICKET_TTL_MS,
  };
  const payload = JSON.stringify(ticket);
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyStudentDocumentUploadTicket(
  token: string,
  userId: string,
  institutionId: string
):
  | { ok: true; ticket: StudentDocumentUploadTicket }
  | { ok: false; error: string } {
  const secret = ticketSecret();
  if (!secret) return { ok: false, error: "unavailable" };
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return { ok: false, error: "invalid_format" };
    const payload = decoded.slice(0, lastDot);
    const providedSig = decoded.slice(lastDot + 1);
    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
    const sigBuffer = Buffer.from(providedSig, "hex");
    const expectedBuffer = Buffer.from(expectedSig, "hex");
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return { ok: false, error: "invalid_signature" };
    }
    const ticket = JSON.parse(payload) as StudentDocumentUploadTicket;
    if (ticket.typ !== "student-doc") return { ok: false, error: "invalid_type" };
    if (ticket.expiresAt < Date.now()) return { ok: false, error: "expired" };
    if (ticket.userId !== userId) return { ok: false, error: "user_mismatch" };
    if (ticket.institutionId !== institutionId) {
      return { ok: false, error: "institution_mismatch" };
    }
    if (!isSafeStudentDocumentStoragePath(ticket.storagePath)) {
      return { ok: false, error: "invalid_path" };
    }
    if (!assertStoragePathBelongsToInstitution(ticket.storagePath, institutionId)) {
      return { ok: false, error: "path_institution_mismatch" };
    }
    return { ok: true, ticket };
  } catch {
    return { ok: false, error: "invalid_token" };
  }
}

export function buildStudentDocumentStoragePath(input: {
  institutionId: string;
  studentId: string;
  fileName: string;
}): string | null {
  const objectId = randomUUID();
  const file = studentDocumentStorageFileName(objectId, input.fileName);
  if (!file) return null;
  const storagePath = `${input.institutionId}/${input.studentId}/${file}`;
  return isSafeStudentDocumentStoragePath(storagePath) ? storagePath : null;
}

export async function createStudentDocumentSignedUploadUrl(
  storagePath: string,
  client: SupabaseClient | null = createStudentDocumentStorageClient()
): Promise<{ ok: true; signedUrl: string } | { ok: false; error: string }> {
  if (!client) return { ok: false, error: "storage_not_configured" };
  const ready = await ensureStudentDocumentsBucket(client);
  if (!ready.ok) return ready;
  const { data, error } = await client.storage
    .from(STUDENT_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) {
    console.error("[student-document-storage] signed upload url failed:", error?.message);
    return { ok: false, error: "signed_url_failed" };
  }
  return { ok: true, signedUrl: data.signedUrl };
}

export async function createStudentDocumentSignedDownloadUrl(
  storagePath: string,
  institutionId: string,
  options?: { download?: string | boolean },
  client: SupabaseClient | null = createStudentDocumentStorageClient()
): Promise<string | null> {
  if (!client || !isSafeStudentDocumentStoragePath(storagePath)) return null;
  if (!assertStoragePathBelongsToInstitution(storagePath, institutionId)) {
    return null;
  }
  const { data, error } = await client.storage
    .from(STUDENT_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_DOWNLOAD_TTL_SEC, {
      download: options?.download ?? true,
    });
  if (error || !data?.signedUrl) {
    console.error("[student-document-storage] signed download url failed:", error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function verifyStudentDocumentObject(
  storagePath: string,
  client: SupabaseClient | null = createStudentDocumentStorageClient()
): Promise<
  | { ok: true; sizeBytes: number; contentType: string | null }
  | { ok: false; error: string }
> {
  if (!client) return { ok: false, error: "storage_not_configured" };
  const folder = storagePath.split("/").slice(0, -1).join("/");
  const filename = storagePath.split("/").pop();
  const { data, error } = await client.storage
    .from(STUDENT_DOCUMENTS_BUCKET)
    .list(folder, { limit: 100, search: filename });
  if (error) {
    console.error("[student-document-storage] list failed:", error.message);
    return { ok: false, error: "verification_failed" };
  }
  const file = data?.find((item) => item.name === filename);
  if (!file) return { ok: false, error: "object_not_found" };
  return {
    ok: true,
    sizeBytes: Number(file.metadata?.size ?? 0),
    contentType: file.metadata?.mimetype ?? null,
  };
}

export async function fetchStudentDocumentObjectBytes(
  storagePath: string,
  institutionId: string,
  client: SupabaseClient | null = createStudentDocumentStorageClient()
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!client || !isSafeStudentDocumentStoragePath(storagePath)) return null;
  if (!assertStoragePathBelongsToInstitution(storagePath, institutionId)) {
    return null;
  }
  const { data, error } = await client.storage
    .from(STUDENT_DOCUMENTS_BUCKET)
    .download(storagePath);
  if (error || !data) {
    console.error("[student-document-storage] download failed:", error?.message);
    return null;
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  return {
    bytes,
    contentType: data.type?.trim() || "application/pdf",
  };
}

export async function fetchStudentDocumentMagicBytes(
  storagePath: string,
  client: SupabaseClient | null = createStudentDocumentStorageClient()
): Promise<Uint8Array | null> {
  if (!client) return null;
  const { data } = await client.storage
    .from(STUDENT_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (!data?.signedUrl) return null;
  try {
    const response = await fetch(data.signedUrl, {
      headers: { Range: MAGIC_RANGE },
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function removeStudentDocumentObject(
  storagePath: string,
  institutionId: string,
  client: SupabaseClient | null = createStudentDocumentStorageClient()
): Promise<void> {
  if (!client || !isSafeStudentDocumentStoragePath(storagePath)) return;
  if (!assertStoragePathBelongsToInstitution(storagePath, institutionId)) {
    return;
  }
  const { error } = await client.storage
    .from(STUDENT_DOCUMENTS_BUCKET)
    .remove([storagePath]);
  if (error) {
    console.error("[student-document-storage] remove failed:", error.message);
  }
}

export async function confirmStudentDocumentObject(input: {
  storagePath: string;
  mappedMime: string;
  institutionId: string;
  client?: SupabaseClient | null;
}): Promise<
  | { ok: true; mimeType: string; sizeBytes: number; dataUrl: string }
  | { ok: false; error: string }
> {
  const client = input.client ?? createStudentDocumentStorageClient();
  if (!client) return { ok: false, error: "storage_not_configured" };
  if (!isSafeStudentDocumentStoragePath(input.storagePath)) {
    return { ok: false, error: "invalid_path" };
  }
  if (!assertStoragePathBelongsToInstitution(input.storagePath, input.institutionId)) {
    return { ok: false, error: "path_institution_mismatch" };
  }

  const objectInfo = await verifyStudentDocumentObject(input.storagePath, client);
  if (!objectInfo.ok) return objectInfo;
  if (!Number.isFinite(objectInfo.sizeBytes) || objectInfo.sizeBytes <= 0) {
    await removeStudentDocumentObject(input.storagePath, input.institutionId, client);
    return { ok: false, error: "invalid_size" };
  }
  if (objectInfo.sizeBytes > MAX_UPLOAD_BYTES) {
    await removeStudentDocumentObject(input.storagePath, input.institutionId, client);
    return { ok: false, error: "FILE_TOO_LARGE" };
  }

  const magic = await fetchStudentDocumentMagicBytes(input.storagePath, client);
  const checked = assertUploadMagicFromBytes(magic, input.mappedMime);
  if (!checked.ok) {
    await removeStudentDocumentObject(input.storagePath, input.institutionId, client);
    return checked;
  }

  return {
    ok: true,
    mimeType: checked.mimeType,
    sizeBytes: objectInfo.sizeBytes,
    dataUrl: buildStudentDocumentStorageRef(input.storagePath),
  };
}
