import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { sessionCookieOptions } from "@/lib/session";
import {
  getDevOtpBypassCode,
  hashOtpCode,
  isDevOtpBypassEnabled,
  OTP_MAX_ATTEMPTS,
  otpHashesEqual,
} from "@/lib/login-otp";
import { hashFormFillToken } from "@/lib/form-fill-otp";
import {
  FORM_SIGNATURE_OTP_COOKIE,
  newFormSignatureOtpSessionToken,
} from "@/lib/form-signature-otp";
import { loadPendingFormSignatureRequest } from "@/lib/form-signature-otp-server";
import {
  assertFormFillOtpRateLimit,
  clientIpFromRequest,
  sessionMaxAgeSeconds,
} from "@/lib/form-fill-otp-server";
import { formFillOtpVerifyBodySchema, parseJsonBody } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, formFillOtpVerifyBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }
  const { token, code } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 503 });
  }

  try {
    const supabase = createServiceClient();

    // הגבלת ניסיונות אימות לפי IP — לפני כל גישה למסד לפי token
    const ip = clientIpFromRequest(request);
    const rateIp = await assertFormFillOtpRateLimit(
      supabase,
      `form-signature-otp-verify:${ip}`,
      { limit: 20 }
    );
    if (!rateIp.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rateIp.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rateIp.retryAfterSec) } }
      );
    }

    const signatureRequest = await loadPendingFormSignatureRequest(
      supabase,
      token
    );
    if (!signatureRequest) {
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const devBypass =
      isDevOtpBypassEnabled() && code === getDevOtpBypassCode();

    if (!devBypass) {
      const { data: otpRows, error: otpError } = await supabase
        .from("form_signature_otp_codes")
        .select("id, code_hash, expires_at, used_at, attempt_count")
        .eq("request_id", signatureRequest.id)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (otpError) {
        console.error("[signature/otp/verify] lookup:", otpError.message);
        return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 500 });
      }

      const otp = otpRows?.[0];
      if (!otp) {
        return NextResponse.json(
          { error: "INVALID_CREDENTIALS" },
          { status: 401 }
        );
      }

      const expiresAt = new Date(otp.expires_at as string).getTime();
      if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
        await supabase
          .from("form_signature_otp_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", otp.id);
        return NextResponse.json({ error: "OTP_EXPIRED" }, { status: 401 });
      }

      const attempts = Number(otp.attempt_count) || 0;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await supabase
          .from("form_signature_otp_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", otp.id);
        return NextResponse.json({ error: "OTP_LOCKED" }, { status: 401 });
      }

      // מונים את הניסיון לפני ההשוואה, ורק אם המונה עדיין בערך שקראנו —
      // כך בקשות מקבילות לא עוברות את OTP_MAX_ATTEMPTS
      const nextAttempts = attempts + 1;
      const { data: claimed, error: claimError } = await supabase
        .from("form_signature_otp_codes")
        .update({
          attempt_count: nextAttempts,
          ...(nextAttempts >= OTP_MAX_ATTEMPTS
            ? { used_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", otp.id)
        .eq("attempt_count", attempts)
        .is("used_at", null)
        .select("id")
        .maybeSingle();
      if (claimError || !claimed?.id) {
        return NextResponse.json(
          { error: "INVALID_CREDENTIALS" },
          { status: 401 }
        );
      }

      const codeHash = await hashOtpCode(code);
      if (!otpHashesEqual(codeHash, String(otp.code_hash ?? ""))) {
        return NextResponse.json(
          { error: nextAttempts >= OTP_MAX_ATTEMPTS ? "OTP_LOCKED" : "INVALID_CREDENTIALS" },
          { status: 401 }
        );
      }

      await supabase
        .from("form_signature_otp_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", otp.id);
    }

    const sessionToken = newFormSignatureOtpSessionToken();
    const sessionHash = await hashFormFillToken(sessionToken);
    const { error: sessionError } = await supabase
      .from("form_signature_otp_sessions")
      .insert({
        request_id: signatureRequest.id,
        session_hash: sessionHash,
        expires_at: signatureRequest.expires_at,
      });

    if (sessionError) {
      console.error("[signature/otp/verify] session:", sessionError.message);
      return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 503 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      FORM_SIGNATURE_OTP_COOKIE,
      sessionToken,
      sessionCookieOptions(sessionMaxAgeSeconds(signatureRequest.expires_at))
    );
    return response;
  } catch (error) {
    console.error("[signature/otp/verify]", error);
    return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 500 });
  }
}
