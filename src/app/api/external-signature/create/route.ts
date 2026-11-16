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
import { parseJsonBody, externalSignatureCreateBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

const EXPIRY_DAYS = 14;

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, externalSignatureCreateBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "פרטי הבקשה אינם תקינים" },
      { status: 400 }
    );
  }

  const { studentId, documentId, recipientEmail, signerLabel } = parsed.data;

  try {
    const student = await loadStudentForInstitution(studentId);
    if (!student || student.institution_id !== auth.session.institutionId) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לתלמיד זה" },
        { status: 403 }
      );
    }

    const ctx = buildMemberAccessContext(auth.session);
    if (!(await assertMemberCanAccessStudent(studentId, ctx))) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לתלמיד זה" },
        { status: 403 }
      );
    }

    const supabase = createServiceClient();

    const { data: doc, error: docError } = await supabase
      .from("student_documents")
      .select("id, name, student_id")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { ok: false, error: "המסמך לא נמצא" },
        { status: 404 }
      );
    }

    if (doc.student_id !== studentId) {
      return NextResponse.json(
        { ok: false, error: "המסמך לא שייך לתלמיד זה" },
        { status: 403 }
      );
    }

    const documentName = doc.name;
    const origin = parentFacingOrigin(request);
    const expiresAt = new Date(
      Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const token = newFormFillOtpSessionToken();
    const tokenHash = await hashFormFillToken(token);

    const { data: insertedRequest, error: insertError } = await supabase
      .from("external_document_signature_requests")
      .insert({
        student_id: studentId,
        document_id: documentId,
        institution_id: auth.session.institutionId,
        document_name: documentName,
        recipient_email: recipientEmail,
        signer_label: signerLabel,
        expires_at: expiresAt,
        created_by: auth.session.userId,
      })
      .select("id")
      .single();

    if (insertError || !insertedRequest?.id) {
      console.error("[external-signature/create] insert:", insertError?.message);
      return NextResponse.json(
        { ok: false, error: "יצירת בקשת החתימה נכשלה" },
        { status: 500 }
      );
    }

    const { error: tokenInsertError } = await supabase
      .from("external_signature_tokens")
      .insert({
        request_id: insertedRequest.id,
        token_hash: tokenHash,
      });

    if (tokenInsertError) {
      console.error("[external-signature/create] token insert:", tokenInsertError.message);
      await supabase
        .from("external_document_signature_requests")
        .update({ status: "revoked" })
        .eq("id", insertedRequest.id);
      return NextResponse.json(
        { ok: false, error: "יצירת בקשת החתימה נכשלה" },
        { status: 500 }
      );
    }

    const link = `${origin}/sign-document/${encodeURIComponent(token)}`;
    const mail = await sendExternalDocumentSignatureLinkEmail({
      to: recipientEmail,
      documentName,
      studentName: student.full_name ?? "",
      signerLabel,
      link,
      expiryDays: EXPIRY_DAYS,
    });

    if (!mail.sent) {
      console.error("[external-signature/create] email send failed");
      await supabase
        .from("external_document_signature_requests")
        .update({ status: "revoked" })
        .eq("id", insertedRequest.id);

      return NextResponse.json(
        { ok: false, error: "שליחת המייל נכשלה — נסו שוב" },
        { status: 502 }
      );
    }

    const { error: revokeError } = await supabase
      .from("external_document_signature_requests")
      .update({ status: "revoked" })
      .eq("document_id", documentId)
      .eq("status", "pending")
      .neq("id", insertedRequest.id);

    if (revokeError) {
      console.warn("[external-signature/create] revoke previous:", revokeError.message);
    }

    await insertAuditLog({
      institutionId: auth.session.institutionId,
      actorUserId: auth.session.userId,
      action: "external_signature.request",
      entityType: "student_document",
      entityId: documentId,
      summary: `נשלח לחתימה: ${documentName} — ${student.full_name ?? ""}`,
      metadata: {
        student_id: studentId,
        document_id: documentId,
        signer_label: signerLabel,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[external-signature/create]", err);
    return NextResponse.json(
      { ok: false, error: "שגיאת שרת" },
      { status: 500 }
    );
  }
}
