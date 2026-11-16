import { hashFormFillToken } from "@/lib/form-fill-otp";
import type { createServiceClient } from "@/lib/supabase/admin";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type PendingFormSignatureRequest = {
  id: string;
  form_fill_id: string;
  recipient_email: string;
  signature_field_key: string;
  signature_field_label: string;
  form_title: string;
  student_name: string;
  snapshot_html: string;
  status: string;
  expires_at: string;
};

export async function loadPendingFormSignatureRequest(
  supabase: ServiceClient,
  token: string
): Promise<PendingFormSignatureRequest | null> {
  const tokenHash = await hashFormFillToken(token);
  const { data, error } = await supabase
    .from("form_signature_requests")
    .select(
      "id, form_fill_id, recipient_email, signature_field_key, signature_field_label, form_title, student_name, snapshot_html, status, expires_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data?.id) return null;
  if (data.status !== "pending") return null;
  const expiresAt = new Date(data.expires_at as string).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    await supabase
      .from("form_signature_requests")
      .update({ status: "expired" })
      .eq("id", data.id)
      .eq("status", "pending");
    return null;
  }

  return {
    id: String(data.id),
    form_fill_id: String(data.form_fill_id ?? ""),
    recipient_email: String(data.recipient_email ?? "")
      .trim()
      .toLowerCase(),
    signature_field_key: String(data.signature_field_key ?? ""),
    signature_field_label: String(data.signature_field_label ?? ""),
    form_title: String(data.form_title ?? ""),
    student_name: String(data.student_name ?? ""),
    snapshot_html: String(data.snapshot_html ?? ""),
    status: String(data.status ?? ""),
    expires_at: String(data.expires_at ?? ""),
  };
}

export async function hasValidFormSignatureOtpSession(
  supabase: ServiceClient,
  requestId: string,
  sessionToken: string
): Promise<boolean> {
  if (!sessionToken) return false;
  const sessionHash = await hashFormFillToken(sessionToken);
  const { data, error } = await supabase
    .from("form_signature_otp_sessions")
    .select("id, expires_at")
    .eq("request_id", requestId)
    .eq("session_hash", sessionHash)
    .maybeSingle();
  if (error || !data?.id) return false;
  const expiresAt = new Date(data.expires_at as string).getTime();
  return !Number.isNaN(expiresAt) && expiresAt > Date.now();
}
