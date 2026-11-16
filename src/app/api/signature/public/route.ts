import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { companionIdFieldForSignature } from "@/lib/form-fields";
import { mergeFormFillData } from "@/lib/form-fill-data-server";
import { asStringRecord } from "@/lib/form-fill-public-data";
import { FORM_SIGNATURE_OTP_COOKIE, maskRecipientEmail } from "@/lib/form-signature-otp";
import {
  hasValidFormSignatureOtpSession,
  loadPendingFormSignatureRequest,
} from "@/lib/form-signature-otp-server";
import { archiveSignedFormIfComplete } from "@/lib/form-signed-archive-server";
import { isValidSubmittedSignature } from "@/lib/green-signature";
import { parseJsonBody, signaturePublicBodySchema } from "@/lib/validation";

function otpRequired(maskedEmail?: string) {
  return NextResponse.json(
    {
      ok: false,
      error: "OTP_REQUIRED",
      otpRequired: true,
      maskedEmail: maskedEmail || "***",
    },
    { status: 401 }
  );
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, signaturePublicBodySchema);
  if (!parsed.ok) return parsed.response;
  const { action, token } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "השרת אינו מוגדר" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();
  const signatureRequest = await loadPendingFormSignatureRequest(
    supabase,
    token
  );
  const maskedEmail = signatureRequest
    ? maskRecipientEmail(signatureRequest.recipient_email)
    : "***";

  if (!signatureRequest) {
    return NextResponse.json(
      { ok: false, error: "הקישור אינו תקין או שפג תוקפו" },
      { status: 404 }
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(FORM_SIGNATURE_OTP_COOKIE)?.value ?? "";
  const sessionOk = await hasValidFormSignatureOtpSession(
    supabase,
    signatureRequest.id,
    sessionToken
  );
  if (!sessionOk) {
    return otpRequired(maskedEmail);
  }

  if (action === "get") {
    let companionIdValue = "";
    const companion = companionIdFieldForSignature(
      signatureRequest.signature_field_key
    );
    if (companion) {
      const { data: fill } = await supabase
        .from("student_form_fills")
        .select("data")
        .eq("id", signatureRequest.form_fill_id)
        .maybeSingle();
      const data = asStringRecord(fill?.data);
      companionIdValue = String(data[companion.key] ?? "").trim().slice(0, 40);
    }

    return NextResponse.json({
      ok: true,
      request: {
        formTitle: signatureRequest.form_title,
        studentName: signatureRequest.student_name,
        fieldKey: signatureRequest.signature_field_key,
        fieldLabel: signatureRequest.signature_field_label,
        snapshotHtml: signatureRequest.snapshot_html,
        expiresAt: signatureRequest.expires_at,
        status: signatureRequest.status,
        companionIdField: companion
          ? {
              key: companion.key,
              label: companion.label,
              value: companionIdValue,
            }
          : null,
      },
    });
  }

  const signature = parsed.data.signature ?? "";
  if (!isValidSubmittedSignature(signature)) {
    return NextResponse.json(
      { ok: false, error: "החתימה אינה תקינה" },
      { status: 400 }
    );
  }

  const companion = companionIdFieldForSignature(
    signatureRequest.signature_field_key
  );
  const companionIdValue = String(parsed.data.companionIdValue ?? "")
    .trim()
    .slice(0, 40);
  if (companion && !companionIdValue) {
    return NextResponse.json(
      { ok: false, error: `נא למלא ${companion.label}` },
      { status: 400 }
    );
  }

  // מיזוג אטומי — רק השדות של החותם הזה, בלי לדרוס חתימות שנכנסו במקביל
  const patch: Record<string, string> = {
    [signatureRequest.signature_field_key]: signature,
  };
  if (companion && companionIdValue) {
    patch[companion.key] = companionIdValue;
  }

  let merged = false;
  try {
    merged = await mergeFormFillData(
      supabase,
      signatureRequest.form_fill_id,
      patch
    );
  } catch (error) {
    console.error("[signature/public] merge:", error);
    return NextResponse.json(
      { ok: false, error: "שמירת החתימה נכשלה" },
      { status: 500 }
    );
  }
  if (!merged) {
    return NextResponse.json(
      { ok: false, error: "הטופס אינו זמין" },
      { status: 404 }
    );
  }

  await supabase
    .from("form_signature_requests")
    .update({ status: "signed", signed_at: new Date().toISOString() })
    .eq("id", signatureRequest.id)
    .eq("status", "pending");

  try {
    await archiveSignedFormIfComplete(signatureRequest.form_fill_id);
  } catch (error) {
    console.error("[signature/public] archive:", error);
  }

  return NextResponse.json({ ok: true });
}
