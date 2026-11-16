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
import { sendFormFillOtpEmail } from "@/lib/form-fill-otp-email";
import {
  assertFormFillOtpRateLimit,
  clientIpFromRequest,
  loadPendingFormFillRequest,
} from "@/lib/form-fill-otp-server";
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
      `form-fill-otp:${ip}`
    );
    if (!rateIp.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rateIp.retryAfterSec },
        { status: 429 }
      );
    }

    const fillRequest = await loadPendingFormFillRequest(supabase, token);
    if (!fillRequest?.recipient_email) {
      return genericOk();
    }

    const rateEmail = await assertFormFillOtpRateLimit(
      supabase,
      `form-fill-otp-email:${fillRequest.recipient_email}`
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
    const maskedEmail = maskRecipientEmail(fillRequest.recipient_email);

    await supabase
      .from("form_fill_otp_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("request_id", fillRequest.id)
      .is("used_at", null);

    const { error: insertError } = await supabase
      .from("form_fill_otp_codes")
      .insert({
        request_id: fillRequest.id,
        code_hash: codeHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("[fill/otp/request] insert:", insertError.message);
      return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 503 });
    }

    const { sent } = await sendFormFillOtpEmail({
      to: fillRequest.recipient_email,
      code,
    });
    const isDev = process.env.NODE_ENV !== "production";
    if (!sent) {
      if (!isDev) {
        return NextResponse.json({ error: "EMAIL_SEND_FAILED" }, { status: 502 });
      }
      console.warn("[fill/otp/request] dev: OTP email was not sent");
    }
    if (isDev && isDevOtpBypassEnabled()) {
      console.warn(
        `[fill/otp/request] DEV_OTP_BYPASS active — use code ${getDevOtpBypassCode()}`
      );
    }

    return genericOk(maskedEmail);
  } catch (error) {
    console.error("[fill/otp/request]", error);
    return genericOk();
  }
}
