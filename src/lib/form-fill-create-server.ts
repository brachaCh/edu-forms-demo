import { parentFacingOrigin } from "@/lib/app-origin";
import { sendFormFillLinkEmail } from "@/lib/form-fill-otp-email";
import { hashFormFillToken, newFormFillOtpSessionToken } from "@/lib/form-fill-otp";
import type { createServiceClient } from "@/lib/supabase/admin";

type ServiceClient = ReturnType<typeof createServiceClient>;

const EXPIRY_DAYS = 14;

export type SendFormFillLinkInput = {
  supabase: ServiceClient;
  origin: string;
  formFillId: string;
  formId: string;
  formTitle: string;
  studentName: string;
  recipientEmail: string;
  note?: string;
};

export type SendFormFillLinkResult =
  | { ok: true; sentTo: string[] }
  | { ok: false; error: string; status?: number };

/**
 * יצירת קישור מילוי ושליחת מייל — אותה לוגיקה כמו ב־/api/fill/create.
 */
export async function sendFormFillLink(
  input: SendFormFillLinkInput
): Promise<SendFormFillLinkResult> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  const expiresAt = new Date(
    Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const token = newFormFillOtpSessionToken();
  const tokenHash = await hashFormFillToken(token);
  const { error: insertError } = await input.supabase
    .from("form_fill_requests")
    .insert({
      form_fill_id: input.formFillId,
      form_id: input.formId,
      recipient_email: recipientEmail,
      form_title: input.formTitle,
      student_name: input.studentName,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
  if (insertError) {
    console.error("[sendFormFillLink] insert:", insertError.message);
    return { ok: false, error: "יצירת קישור המילוי נכשלה", status: 500 };
  }

  const link = `${input.origin}/fill/${encodeURIComponent(token)}`;
  const mail = await sendFormFillLinkEmail({
    to: recipientEmail,
    formTitle: input.formTitle,
    studentName: input.studentName,
    note: input.note,
    link,
    expiryDays: EXPIRY_DAYS,
  });
  if (!mail.sent) {
    console.error("[sendFormFillLink] email:", mail.detail ?? "not sent");
    await input.supabase
      .from("form_fill_requests")
      .update({ status: "revoked" })
      .eq("token_hash", tokenHash);
    return { ok: false, error: "שליחת המייל נכשלה", status: 502 };
  }

  const { error: revokeError } = await input.supabase
    .from("form_fill_requests")
    .update({ status: "revoked" })
    .eq("form_fill_id", input.formFillId)
    .eq("recipient_email", recipientEmail)
    .eq("status", "pending")
    .neq("token_hash", tokenHash);
  if (revokeError) {
    console.error("[sendFormFillLink] revoke previous:", revokeError.message);
  }

  return { ok: true, sentTo: [recipientEmail] };
}

export async function revokePendingFormFillRequestsForRecipients(
  supabase: ServiceClient,
  formFillId: string,
  recipientEmails: string[]
): Promise<void> {
  const normalized = [
    ...new Set(
      recipientEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)
    ),
  ];
  if (normalized.length === 0) return;
  const { error } = await supabase
    .from("form_fill_requests")
    .update({ status: "revoked" })
    .eq("form_fill_id", formFillId)
    .eq("status", "pending")
    .in("recipient_email", normalized);
  if (error) {
    console.error(
      "[revokePendingFormFillRequestsForRecipients]",
      error.message
    );
  }
}

export function resolveParentFacingOrigin(request?: Request): string {
  if (request) return parentFacingOrigin(request);
  return process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || "http://localhost:3000";
}
