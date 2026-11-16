import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { insertAuditLog } from "@/lib/audit-log";
import {
  hasValidExternalSignatureOtpSession,
  loadPendingExternalSignatureRequest,
} from "@/lib/external-signature-otp-server";
import { EXTERNAL_SIGNATURE_OTP_COOKIE } from "@/lib/external-signature-constants";
import { isValidSubmittedSignature } from "@/lib/green-signature";
import { externalSignatureSignBodySchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, externalSignatureSignBodySchema);
  if (!parsed.ok) return parsed.response;
  const { token, signatureData } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "השרת אינו מוגדר" },
      { status: 503 }
    );
  }

  if (!isValidSubmittedSignature(signatureData)) {
    return NextResponse.json(
      { ok: false, error: "החתימה אינה תקינה" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const sigRequest = await loadPendingExternalSignatureRequest(supabase, token);

  if (!sigRequest) {
    return NextResponse.json(
      { ok: false, error: "הקישור אינו תקין או שפג תוקפו" },
      { status: 404 }
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(EXTERNAL_SIGNATURE_OTP_COOKIE)?.value ?? "";
  const sessionOk = await hasValidExternalSignatureOtpSession(
    supabase,
    sigRequest.id,
    sessionToken
  );
  if (!sessionOk) {
    return NextResponse.json(
      { ok: false, error: "OTP_REQUIRED" },
      { status: 401 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("external_document_signature_requests")
    .update({
      status: "signed",
      signature_data: signatureData,
      signed_at: new Date().toISOString(),
    })
    .eq("id", sigRequest.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[external-signature/sign] update:", updateError.message);
    return NextResponse.json(
      { ok: false, error: "שמירת החתימה נכשלה" },
      { status: 500 }
    );
  }

  if (!updated?.id) {
    return NextResponse.json(
      { ok: false, error: "הבקשה כבר לא ממתינה לחתימה" },
      { status: 409 }
    );
  }

  await insertAuditLog({
    institutionId: sigRequest.institution_id,
    actorUserId: null,
    action: "external_signature.signed",
    entityType: "student_document",
    entityId: sigRequest.document_id,
    summary: `נחתם: ${sigRequest.document_name}`,
    metadata: {
      student_id: sigRequest.student_id,
      document_id: sigRequest.document_id,
      request_id: sigRequest.id,
      signer_label: sigRequest.signer_label,
    },
  });

  return NextResponse.json({ ok: true });
}
