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
import {
  hashFormFillToken,
  newFormFillOtpSessionToken,
} from "@/lib/form-fill-otp";
import {
  assertFormFillOtpRateLimit,
  clientIpFromRequest,
} from "@/lib/form-fill-otp-server";
import {
  loadPendingExternalSignatureRequest,
  sessionMaxAgeSeconds,
} from "@/lib/external-signature-otp-server";
import { EXTERNAL_SIGNATURE_OTP_COOKIE } from "@/lib/external-signature-constants";
import { externalSignatureOtpVerifyBodySchema, parseJsonBody } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, externalSignatureOtpVerifyBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }
  const { token, code } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "OTP_UNAVAILABLE" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServiceClient();

    const ip = clientIpFromRequest(request);
    const rateIp = await assertFormFillOtpRateLimit(
      supabase,
      `external-sig-otp-verify:${ip}`,
      { limit: 10 }
    );
    if (!rateIp.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rateIp.retryAfterSec },
        { status: 429 }
      );
    }

    const sigRequest = await loadPendingExternalSignatureRequest(supabase, token);
    if (!sigRequest) {
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const devBypass =
      isDevOtpBypassEnabled() && code === getDevOtpBypassCode();

    if (!devBypass) {
      const { data: otpRows, error: otpError } = await supabase
        .from("external_signature_otp_codes")
        .select("id, code_hash, expires_at, used_at, attempt_count")
        .eq("request_id", sigRequest.id)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (otpError) {
        console.error("[external-signature/otp/verify] lookup:", otpError.message);
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
          .from("external_signature_otp_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", otp.id);
        return NextResponse.json({ error: "OTP_EXPIRED" }, { status: 401 });
      }

      const attempts = Number(otp.attempt_count) || 0;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await supabase
          .from("external_signature_otp_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", otp.id);
        return NextResponse.json({ error: "OTP_LOCKED" }, { status: 401 });
      }

      const nextAttempts = attempts + 1;
      const { data: claimed, error: claimError } = await supabase
        .from("external_signature_otp_codes")
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
        .from("external_signature_otp_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", otp.id);
    }

    const sessionToken = newFormFillOtpSessionToken();
    const sessionHash = await hashFormFillToken(sessionToken);
    const { error: sessionError } = await supabase
      .from("external_signature_otp_sessions")
      .insert({
        request_id: sigRequest.id,
        session_hash: sessionHash,
        expires_at: sigRequest.expires_at,
      });

    if (sessionError) {
      console.error("[external-signature/otp/verify] session:", sessionError.message);
      return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 503 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      EXTERNAL_SIGNATURE_OTP_COOKIE,
      sessionToken,
      sessionCookieOptions(sessionMaxAgeSeconds(sigRequest.expires_at))
    );
    return response;
  } catch (error) {
    console.error("[external-signature/otp/verify]", error);
    return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 500 });
  }
}
