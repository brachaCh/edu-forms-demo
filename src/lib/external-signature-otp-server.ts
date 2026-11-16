import { hashFormFillToken } from "@/lib/form-fill-otp";
import type { createServiceClient } from "@/lib/supabase/admin";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type PendingExternalSignatureRequest = {
  id: string;
  student_id: string;
  document_id: string;
  document_name: string;
  recipient_email: string;
  signer_label: string;
  status: string;
  expires_at: string;
  institution_id: string;
};

export async function loadPendingExternalSignatureRequest(
  supabase: ServiceClient,
  token: string
): Promise<PendingExternalSignatureRequest | null> {
  const tokenHash = await hashFormFillToken(token);

  const { data: tokenRow, error: tokenError } = await supabase
    .from("external_signature_tokens")
    .select("request_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow?.request_id) return null;

  const { data, error } = await supabase
    .from("external_document_signature_requests")
    .select(
      "id, student_id, document_id, document_name, recipient_email, signer_label, status, expires_at, institution_id"
    )
    .eq("id", tokenRow.request_id)
    .maybeSingle();

  if (error || !data?.id) return null;
  if (data.status !== "pending") return null;
  const expiresAt = new Date(data.expires_at as string).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    await supabase
      .from("external_document_signature_requests")
      .update({ status: "expired" })
      .eq("id", data.id)
      .eq("status", "pending");
    return null;
  }

  return {
    id: String(data.id),
    student_id: String(data.student_id ?? ""),
    document_id: String(data.document_id ?? ""),
    document_name: String(data.document_name ?? ""),
    recipient_email: String(data.recipient_email ?? "")
      .trim()
      .toLowerCase(),
    signer_label: String(data.signer_label ?? ""),
    status: String(data.status ?? ""),
    expires_at: String(data.expires_at ?? ""),
    institution_id: String(data.institution_id ?? ""),
  };
}

export async function hasValidExternalSignatureOtpSession(
  supabase: ServiceClient,
  requestId: string,
  sessionToken: string
): Promise<boolean> {
  if (!sessionToken) return false;
  const sessionHash = await hashFormFillToken(sessionToken);
  const { data, error } = await supabase
    .from("external_signature_otp_sessions")
    .select("id, expires_at")
    .eq("request_id", requestId)
    .eq("session_hash", sessionHash)
    .maybeSingle();
  if (error || !data?.id) return false;
  const expiresAt = new Date(data.expires_at as string).getTime();
  return !Number.isNaN(expiresAt) && expiresAt > Date.now();
}

export function sessionMaxAgeSeconds(expiresAtIso: string): number {
  const expiresAt = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiresAt)) return 60 * 60;
  return Math.max(60, Math.min(60 * 60 * 24 * 14, Math.floor((expiresAt - Date.now()) / 1000)));
}
