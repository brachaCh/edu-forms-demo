import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";
import type { Institution, UserProfile } from "@/lib/supabase/types";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  getDevOtpBypassCode,
  hashOtpCode,
  isDevOtpBypassEnabled,
  OTP_MAX_ATTEMPTS,
  otpHashesEqual,
} from "@/lib/login-otp";
import { insertAuditLog } from "@/lib/audit-log";
import { USER_PROFILE_SELECT } from "@/lib/institution-owner";
import { mergeInstitutionIntoProfile } from "@/lib/profile-institution";
import { otpVerifyBodySchema, parseJsonBody } from "@/lib/validation";

async function auditAuthLogin(input: {
  institutionId: string | null | undefined;
  userId: string;
  fullName?: string | null;
  email: string;
  success: boolean;
  reason?: string;
}): Promise<void> {
  if (!input.institutionId) return;
  await insertAuditLog({
    institutionId: input.institutionId,
    actorUserId: input.userId,
    action: input.success ? "auth.login" : "auth.login_failed",
    entityType: "user",
    entityId: input.userId,
    summary: input.success
      ? input.fullName
        ? `התחברות: ${input.fullName}`
        : "התחברות למערכת"
      : input.fullName
        ? `ניסיון התחברות כושל: ${input.fullName}`
        : "ניסיון התחברות כושל",
    metadata: {
      email: input.email,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, otpVerifyBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }
  const { email, code } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "SERVER_AUTH_UNAVAILABLE" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServiceClient();
    const { data: profileRow, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, institution_id, full_name")
      .ilike("email", email)
      .maybeSingle();

    if (profileError || !profileRow?.id) {
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const userId = String(profileRow.id);
    const institutionId = profileRow.institution_id
      ? String(profileRow.institution_id)
      : null;
    const fullName =
      typeof profileRow.full_name === "string" ? profileRow.full_name : null;

    const devBypass =
      isDevOtpBypassEnabled() && code === getDevOtpBypassCode();

    let otpId: string | null = null;

    if (!devBypass) {
      const { data: otpRows, error: otpError } = await supabase
        .from("login_otp_codes")
        .select("id, code_hash, expires_at, used_at, attempt_count")
        .eq("user_id", userId)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (otpError) {
        console.error("[auth/otp/verify] lookup:", otpError.message);
        return NextResponse.json({ error: "LOGIN_FAILED" }, { status: 500 });
      }

      const otp = otpRows?.[0];
      if (!otp) {
        void auditAuthLogin({
          institutionId,
          userId,
          fullName,
          email,
          success: false,
          reason: "NO_OTP",
        });
        return NextResponse.json(
          { error: "INVALID_CREDENTIALS" },
          { status: 401 }
        );
      }

      const expiresAt = new Date(otp.expires_at as string).getTime();
      if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
        await supabase
          .from("login_otp_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", otp.id);
        void auditAuthLogin({
          institutionId,
          userId,
          fullName,
          email,
          success: false,
          reason: "OTP_EXPIRED",
        });
        return NextResponse.json({ error: "OTP_EXPIRED" }, { status: 401 });
      }

      const attempts = Number(otp.attempt_count) || 0;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await supabase
          .from("login_otp_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", otp.id);
        void auditAuthLogin({
          institutionId,
          userId,
          fullName,
          email,
          success: false,
          reason: "OTP_LOCKED",
        });
        return NextResponse.json({ error: "OTP_LOCKED" }, { status: 401 });
      }

      const codeHash = await hashOtpCode(code);
      if (!otpHashesEqual(codeHash, String(otp.code_hash ?? ""))) {
        const nextAttempts = attempts + 1;
        await supabase
          .from("login_otp_codes")
          .update({
            attempt_count: nextAttempts,
            ...(nextAttempts >= OTP_MAX_ATTEMPTS
              ? { used_at: new Date().toISOString() }
              : {}),
          })
          .eq("id", otp.id);

        void auditAuthLogin({
          institutionId,
          userId,
          fullName,
          email,
          success: false,
          reason: "INVALID_CODE",
        });
        return NextResponse.json(
          { error: "INVALID_CREDENTIALS" },
          { status: 401 }
        );
      }

      otpId = String(otp.id);
    } else {
      console.warn(`[auth/otp/verify] DEV_OTP_BYPASS login for ${email}`);
    }

    // service_role ישיר — בלי matoah_get_auth_material (נמחק/צומצם ב-048)
    const { data: authProfile, error: authProfileError } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .ilike("email", email)
      .maybeSingle();

    if (authProfileError) {
      console.error("[auth/otp/verify] profile:", authProfileError.message);
      return NextResponse.json({ error: "LOGIN_FAILED" }, { status: 500 });
    }
    if (!authProfile?.id) {
      void auditAuthLogin({
        institutionId,
        userId,
        fullName,
        email,
        success: false,
        reason: "NO_AUTH_MATERIAL",
      });
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    let profile = authProfile as UserProfile;
    if (profile.institution_id) {
      const { data: institution } = await supabase
        .from("institutions")
        .select("*")
        .eq("id", profile.institution_id)
        .maybeSingle();
      if (institution) {
        profile = mergeInstitutionIntoProfile(
          profile,
          institution as Institution
        );
      }
    }

    // Mark OTP used only after session can be created — otherwise a 500 burns a valid code.
    // Conditional update closes a race: two parallel verifies must not both succeed.
    const token = await createSessionToken(profile);

    if (otpId) {
      const { data: consumed, error: consumeError } = await supabase
        .from("login_otp_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", otpId)
        .is("used_at", null)
        .select("id");

      if (consumeError) {
        console.error("[auth/otp/verify] consume:", consumeError.message);
        return NextResponse.json({ error: "LOGIN_FAILED" }, { status: 500 });
      }
      if (!consumed || consumed.length !== 1) {
        void auditAuthLogin({
          institutionId: profile.institution_id ?? institutionId,
          userId: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          success: false,
          reason: "OTP_ALREADY_USED",
        });
        return NextResponse.json(
          { error: "INVALID_CREDENTIALS" },
          { status: 401 }
        );
      }
    }

    void auditAuthLogin({
      institutionId: profile.institution_id ?? institutionId,
      userId: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      success: true,
    });

    const response = NextResponse.json({ profile });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[auth/otp/verify]", error);
    return NextResponse.json({ error: "LOGIN_FAILED" }, { status: 500 });
  }
}
