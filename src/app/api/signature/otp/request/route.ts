import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  generateOtpCode,
  getDevOtpBypassCode,
  hashOtpCode,
  isDevOtpBypassEnabled,
  OTP_TTL_MS,
} from "@/lib/login-otp";
import { maskRecipientEmail } from "@/lib/form-fill-otp";
import { sendFormSignatureOtpEmail } from "@/lib/form-signature-otp-email";
import {
  assertFormFillOtpRateLimit,
  clientIpFromRequest,
} from "@/lib/form-fill-otp-server";
import { loadPendingFormSignatureRequest } from "@/lib/form-signature-otp-server";
import { formFillTokenBodySchema, parseJsonBody } from "@/lib/validation";

function genericOk(maskedEmail?: string) {
  return NextResponse.json({
    ok: true,
    maskedEmail: maskedEmail || "***",
    message: "אם הקישור תקין, נשלח קוד אימות למייל שהוגדר.",
  });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, formFillTokenBodySchema);
  if (!parsed.ok) return parsed.response;
  const { token } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return genericOk();
  }

  try {
    const supabase = createServiceClient();
    const ip = clientIpFromRequest(request);
    const rateIp = await assertFormFillOtpRateLimit(
      supabase,
      `form-signature-otp:${ip}`
    );
    if (!rateIp.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rateIp.retryAfterSec },
        { status: 429 }
      );
    }

    const signatureRequest = await loadPendingFormSignatureRequest(
      supabase,
      token
    );
    if (!signatureRequest?.recipient_email) {
      return genericOk();
    }

    const rateEmail = await assertFormFillOtpRateLimit(
      supabase,
      `form-signature-otp-email:${signatureRequest.recipient_email}`
    );
    if (!rateEmail.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rateEmail.retryAfterSec },
        { status: 429 }
      );
    }

    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    const maskedEmail = maskRecipientEmail(signatureRequest.recipient_email);

    await supabase
      .from("form_signature_otp_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("request_id", signatureRequest.id)
      .is("used_at", null);

    const { error: insertError } = await supabase
      .from("form_signature_otp_codes")
      .insert({
        request_id: signatureRequest.id,
        code_hash: codeHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("[signature/otp/request] insert:", insertError.message);
      return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 503 });
    }

    const { sent } = await sendFormSignatureOtpEmail({
      to: signatureRequest.recipient_email,
      code,
    });
    const isDev = process.env.NODE_ENV !== "production";
    if (!sent) {
      if (!isDev) {
        return NextResponse.json({ error: "EMAIL_SEND_FAILED" }, { status: 502 });
      }
      console.warn("[signature/otp/request] dev: OTP email was not sent");
    }
    if (isDev && isDevOtpBypassEnabled()) {
      console.warn(
        `[signature/otp/request] DEV_OTP_BYPASS active — use code ${getDevOtpBypassCode()}`
      );
    }

    return genericOk(maskedEmail);
  } catch (error) {
    console.error("[signature/otp/request]", error);
    return genericOk();
  }
}
