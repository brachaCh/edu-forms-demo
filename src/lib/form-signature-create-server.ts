import { sendFormSignatureLinkEmail } from "@/lib/form-signature-otp-email";
import { hashFormFillToken, newFormFillOtpSessionToken } from "@/lib/form-fill-otp";
import type { SignatureAssignment } from "@/lib/form-signature-request";
import type { createServiceClient } from "@/lib/supabase/admin";

type ServiceClient = ReturnType<typeof createServiceClient>;

const EXPIRY_DAYS = 7;

export type SendSignatureRequestsInput = {
  supabase: ServiceClient;
  origin: string;
  formFillId: string;
  formTitle: string;
  studentName: string;
  snapshotHtml: string;
  assignments: SignatureAssignment[];
};

export type SendSignatureRequestsResult =
  | { ok: true; sentTo: string[] }
  | { ok: false; error: string; sentTo?: string[] };

export async function sendSignatureRequests(
  input: SendSignatureRequestsInput
): Promise<SendSignatureRequestsResult> {
  const fieldKeys = [...new Set(input.assignments.map((item) => item.fieldKey))];
  for (const fieldKey of fieldKeys) {
    const { error } = await input.supabase
      .from("form_signature_requests")
      .update({ status: "revoked" })
      .eq("form_fill_id", input.formFillId)
      .eq("signature_field_key", fieldKey)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
  }

  const expiresAt = new Date(
    Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const sentTo: string[] = [];

  for (const assignment of input.assignments) {
    const token = newFormFillOtpSessionToken();
    const tokenHash = await hashFormFillToken(token);
    const { error: insertError } = await input.supabase
      .from("form_signature_requests")
      .insert({
        form_fill_id: input.formFillId,
        recipient_email: assignment.email,
        signature_field_key: assignment.fieldKey,
        signature_field_label: assignment.fieldLabel,
        form_title: input.formTitle,
        student_name: input.studentName,
        snapshot_html: input.snapshotHtml,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
    if (insertError) {
      console.error("[sendSignatureRequests] insert:", insertError.message);
      return {
        ok: false,
        error: "יצירת קישור החתימה נכשלה",
        sentTo,
      };
    }

    const link = `${input.origin}/sign/${encodeURIComponent(token)}`;
    const mail = await sendFormSignatureLinkEmail({
      to: assignment.email,
      formTitle: input.formTitle,
      studentName: input.studentName,
      fieldLabel: assignment.fieldLabel,
      link,
      expiryDays: EXPIRY_DAYS,
    });
    if (!mail.sent) {
      await input.supabase
        .from("form_signature_requests")
        .update({ status: "revoked" })
        .eq("token_hash", tokenHash);
      return {
        ok: false,
        error: mail.detail
          ? `שליחת המייל נכשלה: ${mail.detail}`
          : "שליחת המייל נכשלה",
        sentTo,
      };
    }
    sentTo.push(assignment.email);
  }

  return { ok: true, sentTo };
}
