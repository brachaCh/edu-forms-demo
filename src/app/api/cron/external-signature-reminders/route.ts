/**
 * Automatic reminders for pending external-document signature requests.
 * First reminder 3 days after original send, then every 3 days, max 3 total.
 * Runs as Vercel cron (morning Israel time) with Authorization: Bearer CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { parentFacingOrigin } from "@/lib/app-origin";
import { REMINDER_INTERVAL_DAYS } from "@/lib/external-signature-reminder-logic";
import { hashFormFillToken, newFormFillOtpSessionToken } from "@/lib/form-fill-otp";
import { sendExternalDocumentSignatureLinkEmail } from "@/lib/external-document-signature-email";
import { insertAuditLog } from "@/lib/audit-log";
import { loadStudentForInstitution } from "@/lib/simplesign/server-store";
import {
  findRequestsDueForReminder,
  MAX_AUTO_REMINDERS,
} from "@/lib/external-signature-reminder-logic";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 50;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  const dueBefore = new Date(
    now.getTime() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: pending, error: selectError } = await supabase
    .from("external_document_signature_requests")
    .select(
      "id, student_id, document_id, document_name, recipient_email, signer_label, institution_id, created_at, auto_reminder_count, last_reminder_at, expires_at"
    )
    .eq("status", "pending")
    .gt("expires_at", now.toISOString())
    .lt("auto_reminder_count", MAX_AUTO_REMINDERS)
    .or(
      `last_reminder_at.lte.${dueBefore},and(last_reminder_at.is.null,created_at.lte.${dueBefore})`
    )
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (selectError) {
    console.error("[cron/external-signature-reminders] select:", selectError.message);
    return NextResponse.json({ error: "SELECT_FAILED" }, { status: 500 });
  }

  const requests = pending ?? [];
  const dueRequests = findRequestsDueForReminder(requests, now);

  let sentCount = 0;
  let failedCount = 0;
  const origin = parentFacingOrigin();

  for (const req of dueRequests.slice(0, BATCH_SIZE)) {
    const reqExpiresAt = new Date(req.expires_at).getTime();
    if (Number.isNaN(reqExpiresAt) || reqExpiresAt <= now.getTime()) {
      continue;
    }
    try {
      const student = await loadStudentForInstitution(req.student_id);
      const studentName = student?.full_name ?? "";

      const token = newFormFillOtpSessionToken();
      const tokenHash = await hashFormFillToken(token);

      const { data: insertedToken, error: tokenInsertError } = await supabase
        .from("external_signature_tokens")
        .insert({
          request_id: req.id,
          token_hash: tokenHash,
        })
        .select("id")
        .single();

      if (tokenInsertError || !insertedToken?.id) {
        console.error(
          `[cron/external-signature-reminders] token insert failed for ${req.id}:`,
          tokenInsertError?.message
        );
        failedCount++;
        continue;
      }

      const link = `${origin}/sign-document/${encodeURIComponent(token)}`;
      const remainingMs = new Date(req.expires_at).getTime() - now.getTime();
      const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
      const mail = await sendExternalDocumentSignatureLinkEmail({
        to: req.recipient_email,
        documentName: req.document_name,
        studentName,
        signerLabel: req.signer_label,
        link,
        expiryDays: remainingDays,
      });

      if (!mail.sent) {
        console.error(
          `[cron/external-signature-reminders] email failed for ${req.id}`
        );
        await supabase
          .from("external_signature_tokens")
          .delete()
          .eq("id", insertedToken.id);
        failedCount++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("external_document_signature_requests")
        .update({
          auto_reminder_count: req.auto_reminder_count + 1,
          last_reminder_at: now.toISOString(),
        })
        .eq("id", req.id);

      if (updateError) {
        console.error(
          `[cron/external-signature-reminders] update failed for ${req.id}:`,
          updateError.message
        );
        failedCount++;
        continue;
      }

      if (req.institution_id) {
        void insertAuditLog({
          institutionId: req.institution_id,
          actorUserId: null,
          action: "external_signature.auto_reminder",
          entityType: "student_document",
          entityId: req.document_id,
          summary: `תזכורת אוטומטית לחתימה: ${req.document_name} — ${studentName}`,
          metadata: {
            student_id: req.student_id,
            document_id: req.document_id,
            request_id: req.id,
            signer_label: req.signer_label,
            reminder_number: req.auto_reminder_count + 1,
            automatic: true,
          },
        });
      }

      sentCount++;
    } catch (err) {
      console.error(`[cron/external-signature-reminders] error for ${req.id}:`, err);
      failedCount++;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: requests.length,
    due: dueRequests.length,
    sent: sentCount,
    failed: failedCount,
  });
}
