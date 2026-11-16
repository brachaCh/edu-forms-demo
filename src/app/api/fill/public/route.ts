import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { FORM_FILL_OTP_COOKIE, maskRecipientEmail } from "@/lib/form-fill-otp";
import {
  hasValidFormFillOtpSession,
  loadPendingFormFillRequest,
} from "@/lib/form-fill-otp-server";
import { asStringRecord, sanitizeFillData } from "@/lib/form-fill-public-data";
import { formFillPublicBodySchema, parseJsonBody } from "@/lib/validation";

function otpRequired(maskedEmail?: string) {
  return NextResponse.json(
    { ok: false, error: "OTP_REQUIRED", maskedEmail: maskedEmail || "***" },
    { status: 401 }
  );
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, formFillPublicBodySchema);
  if (!parsed.ok) return parsed.response;
  const { action, token, complete } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "השרת אינו מוגדר" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();
  const fillRequest = await loadPendingFormFillRequest(supabase, token);
  const maskedEmail = fillRequest
    ? maskRecipientEmail(fillRequest.recipient_email)
    : "***";

  if (!fillRequest) {
    return NextResponse.json(
      { ok: false, error: "הקישור אינו תקין או שפג תוקפו" },
      { status: 404 }
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(FORM_FILL_OTP_COOKIE)?.value ?? "";
  const sessionOk = await hasValidFormFillOtpSession(
    supabase,
    fillRequest.id,
    sessionToken
  );
  if (!sessionOk) {
    return otpRequired(maskedEmail);
  }

  const { data: fill, error: fillError } = await supabase
    .from("student_form_fills")
    .select("data")
    .eq("id", fillRequest.form_fill_id)
    .maybeSingle();
  if (fillError || !fill) {
    return NextResponse.json(
      { ok: false, error: "הטופס אינו זמין" },
      { status: 404 }
    );
  }

  if (action === "get") {
    return NextResponse.json({
      ok: true,
      request: {
        formId: fillRequest.form_id,
        formTitle: fillRequest.form_title,
        studentName: fillRequest.student_name,
        data: asStringRecord(fill.data),
        expiresAt: fillRequest.expires_at,
        status: fillRequest.status,
      },
    });
  }

  const sanitized = sanitizeFillData(parsed.data.data ?? {});
  if (!sanitized.ok) {
    return NextResponse.json({ ok: false, error: sanitized.error }, { status: 400 });
  }

  // sanitizeFillData כבר זורק חתימות צד־שלישי; ממזגים מעל הקיים כדי לא למחוק חתימות מהמייל
  const nextData = {
    ...asStringRecord(fill.data),
    ...sanitized.data,
  };
  const { error: updateError } = await supabase
    .from("student_form_fills")
    .update({
      data: nextData,
      status: complete ? "completed" : "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", fillRequest.form_fill_id);
  if (updateError) {
    return NextResponse.json(
      { ok: false, error: "שמירת הטופס נכשלה" },
      { status: 500 }
    );
  }

  if (complete) {
    await supabase
      .from("form_fill_requests")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", fillRequest.id)
      .eq("status", "pending");
  }

  return NextResponse.json({ ok: true });
}
