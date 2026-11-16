import { NextResponse } from "next/server";
import { parentFacingOrigin } from "@/lib/app-origin";
import { insertAuditLog } from "@/lib/audit-log";
import { hashFormFillToken, newFormFillOtpSessionToken } from "@/lib/form-fill-otp";
import { sendExternalDocumentSignatureLinkEmail } from "@/lib/external-document-signature-email";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import { loadStudentForInstitution } from "@/lib/simplesign/server-store";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseJsonBody, externalSignatureResendBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, externalSignatureResendBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "פרטי הבקשה אינם תקינים" },
      { status: 400 }
    );
  }

  const { requestId } = parsed.data;

  try {
    const supabase = createServiceClient();

    const { data: sigRequest, error: findError } = await supabase
      .from("external_document_signature_requests")
      .select("id, student_id, document_id, document_name, recipient_email, signer_label, status, institution_id, expires_at")
      .eq("id", requestId)
      .single();

    if (findError || !sigRequest) {
      return NextResponse.json(
        { ok: false, error: "בקשת החתימה לא נמצאה" },
        { status: 404 }
      );
    }

    if (sigRequest.institution_id !== auth.session.institutionId) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לבקשה זו" },
        { status: 403 }
      );
    }

    const ctx = buildMemberAccessContext(auth.session);
    if (!(await assertMemberCanAccessStudent(sigRequest.student_id, ctx))) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לבקשה זו" },
        { status: 403 }
      );
    }

    if (sigRequest.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: "הבקשה כבר לא ממתינה לחתימה" },
        { status: 409 }
      );
    }

    const expiresAt = new Date(sigRequest.expires_at).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      await supabase
        .from("external_document_signature_requests")
        .update({ status: "expired" })
        .eq("id", requestId)
        .eq("status", "pending");
      return NextResponse.json(
        { ok: false, error: "תוקף הבקשה פג — יש לשלוח בקשה חדשה" },
        { status: 409 }
      );
    }

    const student = await loadStudentForInstitution(sigRequest.student_id);
    const studentName = student?.full_name ?? "";

    const origin = parentFacingOrigin(request);

    const token = newFormFillOtpSessionToken();
    const tokenHash = await hashFormFillToken(token);

    const { data: insertedToken, error: tokenInsertError } = await supabase
      .from("external_signature_tokens")
      .insert({
        request_id: requestId,
        token_hash: tokenHash,
      })
      .select("id")
      .single();

    if (tokenInsertError || !insertedToken?.id) {
      console.error("[external-signature/resend] token insert:", tokenInsertError?.message);
      return NextResponse.json(
        { ok: false, error: "עדכון הבקשה נכשל" },
        { status: 500 }
      );
    }

    const link = `${origin}/sign-document/${encodeURIComponent(token)}`;
    const remainingMs = new Date(sigRequest.expires_at).getTime() - Date.now();
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    const mail = await sendExternalDocumentSignatureLinkEmail({
      to: sigRequest.recipient_email,
      documentName: sigRequest.document_name,
      studentName,
      signerLabel: sigRequest.signer_label,
      link,
      expiryDays: remainingDays,
    });

    if (!mail.sent) {
      console.error("[external-signature/resend] email send failed");
      await supabase
        .from("external_signature_tokens")
        .delete()
        .eq("id", insertedToken.id);
      return NextResponse.json(
        { ok: false, error: "שליחת המייל נכשלה — נסו שוב" },
        { status: 502 }
      );
    }

    await supabase
      .from("external_document_signature_requests")
      .update({ last_reminder_at: new Date().toISOString() })
      .eq("id", requestId);

    await insertAuditLog({
      institutionId: auth.session.institutionId,
      actorUserId: auth.session.userId,
      action: "external_signature.reminder",
      entityType: "student_document",
      entityId: sigRequest.document_id,
      summary: `תזכורת לחתימה: ${sigRequest.document_name} — ${studentName}`,
      metadata: {
        student_id: sigRequest.student_id,
        document_id: sigRequest.document_id,
        request_id: sigRequest.id,
        signer_label: sigRequest.signer_label,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[external-signature/resend]", err);
    return NextResponse.json(
      { ok: false, error: "שגיאת שרת" },
      { status: 500 }
    );
  }
}
