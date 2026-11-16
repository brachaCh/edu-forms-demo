import { SIMPLESIGN_API_BASE } from "@/lib/simplesign/constants";

export class SimpleSignApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SimpleSignApiError";
    this.status = status;
    this.code = code;
  }
}

async function simpleSignFetch(
  _path: string,
  _init?: RequestInit
): Promise<Record<string, unknown>> {
  throw new SimpleSignApiError("שליחה חיצונית לא זמינה בהדגמה", 503);
}

export interface CreateSubmissionInput {
  documentToken: string;
  signerName: string;
  signerEmail: string;
  signerPhone?: string;
  prefill: Record<string, string>;
  lockPrefill?: boolean;
}

export interface CreateSubmissionResult {
  submissionToken: string;
  signingUrl: string;
  status: string;
}

export async function createSimpleSignSubmission(
  input: CreateSubmissionInput
): Promise<CreateSubmissionResult> {
  const payload = await simpleSignFetch(
    `/documents/${encodeURIComponent(input.documentToken)}/submissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signer_name: input.signerName,
        signer_email: input.signerEmail,
        ...(input.signerPhone ? { signer_phone: input.signerPhone } : {}),
        prefill: input.prefill,
        lock_prefill: input.lockPrefill ?? true,
        send_email: false,
      }),
    }
  );

  const submissionToken = String(payload.submission_token ?? "").trim();
  const signingUrl = String(payload.signing_url ?? "").trim();
  if (!submissionToken || !signingUrl) {
    throw new SimpleSignApiError("תגובת SimpleSign לא שלמה", 502);
  }

  return {
    submissionToken,
    signingUrl,
    status: String(payload.status ?? "pending"),
  };
}

export interface MultiSignerSubmissionSignerInput {
  slot: number;
  signerName: string;
  signerEmail: string;
  signerPhone?: string;
  prefill: Record<string, string>;
}

export interface CreateMultiSignerSubmissionInput {
  documentToken: string;
  signers: MultiSignerSubmissionSignerInput[];
  /** שדות משותפים לכל החותמים (`signer: 0`). שדה שאינו משותף ייזרק ב-SimpleSign. */
  prefill?: Record<string, string>;
  lockPrefill?: boolean;
  sendEmail?: boolean;
}

export interface MultiSignerSubmissionBody {
  lock_prefill: boolean;
  send_email: boolean;
  prefill?: Record<string, string>;
  signers: Array<{
    slot: number;
    signer_name: string;
    signer_email: string;
    signer_phone?: string;
    prefill: Record<string, string>;
  }>;
}

/** גוף POST /documents/{token}/submissions למסמך רב-חותמים — בלי signer_* ברמת הבקשה */
export function serializeMultiSignerSubmissionBody(
  input: CreateMultiSignerSubmissionInput
): MultiSignerSubmissionBody {
  const sharedPrefill = input.prefill ?? {};
  const body: MultiSignerSubmissionBody = {
    lock_prefill: input.lockPrefill ?? true,
    send_email: input.sendEmail ?? false,
    signers: input.signers.map((signer) => ({
      slot: signer.slot,
      signer_name: signer.signerName,
      signer_email: signer.signerEmail,
      ...(signer.signerPhone ? { signer_phone: signer.signerPhone } : {}),
      prefill: signer.prefill,
    })),
  };
  if (Object.keys(sharedPrefill).length > 0) {
    body.prefill = sharedPrefill;
  }
  return body;
}

export interface MultiSignerSubmissionSignerResult {
  slot: number;
  signingUrl: string;
  label?: string;
}

export interface CreateMultiSignerSubmissionResult {
  submissionToken: string;
  status: string;
  signers: MultiSignerSubmissionSignerResult[];
}

function parseMultiSignerResponse(
  payload: Record<string, unknown>
): CreateMultiSignerSubmissionResult {
  const submissionToken = String(payload.submission_token ?? "").trim();
  if (!submissionToken) {
    throw new SimpleSignApiError("תגובת SimpleSign לא שלמה", 502);
  }

  const rawSigners = payload.signers;
  if (!Array.isArray(rawSigners) || rawSigners.length === 0) {
    throw new SimpleSignApiError("תגובת SimpleSign ללא חותמים", 502);
  }

  const signers: MultiSignerSubmissionSignerResult[] = [];
  for (const item of rawSigners) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const slot = Number(row.slot);
    const signingUrl = String(row.signing_url ?? "").trim();
    if (!Number.isInteger(slot) || slot < 1 || !signingUrl) continue;
    signers.push({
      slot,
      signingUrl,
      label: typeof row.label === "string" ? row.label : undefined,
    });
  }

  if (signers.length === 0) {
    throw new SimpleSignApiError("תגובת SimpleSign ללא קישורי חתימה", 502);
  }

  return {
    submissionToken,
    status: String(payload.status ?? "pending"),
    signers,
  };
}

export async function createMultiSignerSubmission(
  input: CreateMultiSignerSubmissionInput
): Promise<CreateMultiSignerSubmissionResult> {
  const payload = await simpleSignFetch(
    `/documents/${encodeURIComponent(input.documentToken)}/submissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeMultiSignerSubmissionBody(input)),
    }
  );

  return parseMultiSignerResponse(payload);
}

export function isMultiSignerDocument(
  payload: Record<string, unknown>
): boolean {
  return payload.multi_signer === true;
}

export function simpleSignSubmissionDownloadUrl(submissionToken: string): string {
  return `${SIMPLESIGN_API_BASE}/submissions/${encodeURIComponent(submissionToken)}/download`;
}

export async function getSimpleSignSubmission(
  submissionToken: string
): Promise<Record<string, unknown>> {
  return simpleSignFetch(
    `/submissions/${encodeURIComponent(submissionToken)}`
  );
}

export async function downloadSimpleSignFile(
  _downloadUrl: string
): Promise<ArrayBuffer> {
  throw new SimpleSignApiError("שליחה חיצונית לא זמינה בהדגמה", 503);
}

export async function getDocumentInputs(
  documentToken: string
): Promise<Record<string, unknown>> {
  return simpleSignFetch(
    `/documents/${encodeURIComponent(documentToken)}/inputs`
  );
}
