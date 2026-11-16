import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit-log";
import { hashPassword } from "@/lib/password";
import { hashResetToken } from "@/lib/password-reset";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_TTL_MS,
} from "@/lib/login-otp";
import { sendLoginOtpEmail } from "@/lib/login-otp-email";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  teacherInviteStudentsHref,
  type InstitutionSettings,
} from "@/lib/teacher-invite-redirect";
import type { Category } from "@/lib/supabase/types";
import {
  parseJsonBody,
  teacherInviteAcceptBodySchema,
} from "@/lib/validation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { addUserInstitutionMembership } from "@/lib/user-institutions";
import { normalizeEmail } from "@/lib/normalize-email";
import {
  decideExistingUserInviteAccept,
  pendingInviteAllowsLinkedStaffCard,
  staffCardLinkForExistingUser,
} from "@/lib/teacher-invite-accept";

async function getSessionUser(): Promise<{ userId: string; email: string } | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const payload = await verifySessionToken(token);
    if (!payload) return null;
    return { userId: payload.userId, email: normalizeEmail(payload.email) };
  } catch {
    return null;
  }
}

function parseToken(value: string | null): string | null {
  const token = (value ?? "").trim();
  if (!token || token.length < 32 || token.length > 200) return null;
  return token;
}

async function loadPendingInvite(token: string) {
  const supabase = createServiceClient();
  const tokenHash = await hashResetToken(token);

  const { data: invite, error } = await supabase
    .from("teacher_invitations")
    .select(
      "id, institution_id, student_id, email, teacher_name, status, expires_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("[teacher-invite] lookup:", error.message);
    return { error: "SERVER_UNAVAILABLE" as const };
  }

  if (!invite) {
    return { error: "INVALID_TOKEN" as const };
  }

  if (invite.status !== "pending") {
    return { error: "INVITE_USED" as const };
  }

  const expiresAt = new Date(invite.expires_at as string).getTime();
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    await supabase
      .from("teacher_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id)
      .eq("status", "pending");
    return { error: "TOKEN_EXPIRED" as const };
  }

  const { data: staffCard, error: staffError } = await supabase
    .from("students")
    .select(
      "id, full_name, phone, email, status, institution_id, user_profile_id, category"
    )
    .eq("id", invite.student_id)
    .eq("institution_id", invite.institution_id)
    .maybeSingle();

  if (staffError) {
    console.error("[teacher-invite] staff lookup:", staffError.message);
    return { error: "SERVER_UNAVAILABLE" as const };
  }

  if (!staffCard || staffCard.status !== "integration-teacher") {
    return { error: "INVALID_TOKEN" as const };
  }

  let invitedUserId: string | null = null;
  if (staffCard.user_profile_id) {
    const inviteEmail = normalizeEmail(invite.email ?? "");
    if (!inviteEmail) {
      return { error: "INVALID_TOKEN" as const };
    }
    const { data: inviteProfile, error: inviteProfileError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("email", inviteEmail)
      .maybeSingle();
    if (inviteProfileError) {
      console.error("[teacher-invite] invitee lookup:", inviteProfileError.message);
      return { error: "SERVER_UNAVAILABLE" as const };
    }
    invitedUserId = inviteProfile?.id ?? null;
  }

  if (!pendingInviteAllowsLinkedStaffCard({ staffCard, invitedUserId })) {
    return { error: "INVALID_TOKEN" as const };
  }

  // TZ-27: Also select education_framework and institution_type for proper routing
  const { data: institution, error: institutionError } = await supabase
    .from("institutions")
    .select("id, code, name, school_name, education_framework, institution_type")
    .eq("id", invite.institution_id)
    .maybeSingle();

  if (institutionError || !institution) {
    console.error("[teacher-invite] institution lookup:", institutionError?.message);
    return { error: "SERVER_UNAVAILABLE" as const };
  }

  return { invite, staffCard, institution };
}

export async function GET(request: Request) {
  const token = parseToken(new URL(request.url).searchParams.get("token"));
  if (!token) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const result = await loadPendingInvite(token);
  if ("error" in result) {
    const status = result.error === "SERVER_UNAVAILABLE" ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const { invite, staffCard, institution } = result;
  const teacherName = (invite.teacher_name || staffCard.full_name || "").trim();
  const phone = (staffCard.phone ?? "").trim();
  const email = normalizeEmail(invite.email ?? "");
  if (!email) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: existingProfile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, institution_id")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    console.error("[teacher-invite] profile lookup:", profileError.message);
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const session = await getSessionUser();
  const accept = decideExistingUserInviteAccept({
    existingProfile: existingProfile ?? null,
    inviteInstitutionId: invite.institution_id,
    inviteEmail: email,
    session,
  });
  const existsInOtherInstitution =
    accept.action === "accept_without_register" ||
    accept.action === "login_required" ||
    accept.action === "session_mismatch";
  const sessionEmailMatches = accept.action === "accept_without_register";

  // TZ-27: Pass institution settings for proper framework-based routing
  const institutionSettings: InstitutionSettings = {
    institution_type: institution.institution_type,
    education_framework: institution.education_framework,
  };

  return NextResponse.json({
    ok: true,
    teacherName,
    email: invite.email,
    institutionName: institution.name,
    phone: phone || null,
    redirectHref: teacherInviteStudentsHref(
      teacherName,
      staffCard.category as Category | null,
      institutionSettings
    ),
    existsInOtherInstitution,
    sessionEmailMatches,
    acceptAction: accept.action,
  });
}

async function sendRegistrationOtp(userId: string, email: string) {
  const supabase = createServiceClient();
  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await supabase
    .from("login_otp_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  const { error: insertError } = await supabase.from("login_otp_codes").insert({
    user_id: userId,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error("[teacher-invite] otp insert:", insertError.message);
    return { ok: false as const };
  }

  const { sent } = await sendLoginOtpEmail({ to: email, code });
  if (!sent && process.env.NODE_ENV === "production") {
    return { ok: false as const };
  }

  return { ok: true as const };
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, teacherInviteAcceptBodySchema);
  if (!parsed.ok) {
    const payload = (await parsed.response.clone().json()) as {
      error?: string;
      path?: string;
    };
    if (payload.path === "password") {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    if (payload.path === "terms_accepted") {
      return NextResponse.json({ error: "TERMS_REQUIRED" }, { status: 400 });
    }
    if (payload.error === "INVALID_BODY") {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  const token = parseToken(parsed.data.token);
  const password = parsed.data.password;
  const phoneInput = parsed.data.phone ?? "";

  if (!token) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const result = await loadPendingInvite(token);
  if ("error" in result) {
    const status = result.error === "SERVER_UNAVAILABLE" ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const { invite, staffCard, institution } = result;
  const email = normalizeEmail(invite.email ?? "");
  if (!email) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  // Phone validation is deferred - not required for existing user auto-accept
  const phone = phoneInput || (staffCard.phone ?? "").trim();

  try {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const fullName = (
      invite.teacher_name ||
      staffCard.full_name ||
      ""
    ).trim();
    const teacherName = fullName || email;

    // TZ-27: Pass institution settings for proper framework-based routing
    const institutionSettings: InstitutionSettings = {
      institution_type: institution.institution_type,
      education_framework: institution.education_framework,
    };
    const redirectHref = teacherInviteStudentsHref(
      teacherName,
      staffCard.category as Category | null,
      institutionSettings
    );

    const { data: existingProfile, error: existingProfileError } =
      await supabase
        .from("user_profiles")
        .select("id, institution_id")
        .eq("email", email)
        .maybeSingle();

    if (existingProfileError) {
      console.error(
        "[teacher-invite] profile lookup:",
        existingProfileError.message
      );
      return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
    }

    const session = await getSessionUser();
    const accept = decideExistingUserInviteAccept({
      existingProfile: existingProfile ?? null,
      inviteInstitutionId: invite.institution_id,
      inviteEmail: email,
      session,
    });

    if (accept.action === "login_required") {
      return NextResponse.json(
        { error: "EXISTING_ACCOUNT_LOGIN_REQUIRED" },
        { status: 409 }
      );
    }

    if (accept.action === "session_mismatch") {
      return NextResponse.json(
        { error: "SESSION_EMAIL_MISMATCH" },
        { status: 403 }
      );
    }

    if (accept.action === "accept_without_register") {
      const membershipOk = await addUserInstitutionMembership({
        userId: accept.userId,
        institutionId: invite.institution_id,
        role: "member",
      });

      if (!membershipOk) {
        console.error("[teacher-invite] add membership failed");
        return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
      }

      const link = staffCardLinkForExistingUser({
        staffCard: {
          id: staffCard.id,
          institution_id: staffCard.institution_id ?? invite.institution_id,
          user_profile_id: staffCard.user_profile_id,
        },
        inviteInstitutionId: invite.institution_id,
        userId: accept.userId,
      });

      if (link) {
        const { error: staffUpdateError } = await supabase
          .from("students")
          .update({
            user_profile_id: link.userId,
            email,
          })
          .eq("id", link.staffCardId)
          .eq("institution_id", invite.institution_id)
          .is("user_profile_id", null);

        if (staffUpdateError) {
          console.error(
            "[teacher-invite] staff update:",
            staffUpdateError.message
          );
          return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
        }
      }

      await supabase
        .from("teacher_invitations")
        .update({
          status: "accepted",
          accepted_at: now,
          created_user_id: accept.userId,
        })
        .eq("id", invite.id)
        .eq("status", "pending");

      void insertAuditLog({
        institutionId: invite.institution_id,
        actorUserId: accept.userId,
        action: "teacher.invite_accepted",
        entityType: "user",
        entityId: accept.userId,
        summary: `הצטרפות מורה קיימת למוסד נוסף: ${teacherName}`,
        metadata: {
          email,
          via: "teacher_invite",
          student_id: staffCard.id,
          source_institution_id: existingProfile?.institution_id,
        },
      });

      return NextResponse.json({
        ok: true,
        email,
        redirectHref: "/select-institution",
        needsOtp: false,
        multiInstitution: true,
      });
    }

    if (existingProfile?.id) {
      const sameInstitution = accept.action === "same_institution";
      const alreadyLinkedToSelf =
        staffCard.user_profile_id === existingProfile.id;

      if (sameInstitution && alreadyLinkedToSelf && invite.status === "pending") {
        const membershipOk = await addUserInstitutionMembership({
          userId: existingProfile.id,
          institutionId: invite.institution_id,
          role: "member",
        });

        if (!membershipOk) {
          console.error("[teacher-invite] re-add membership failed");
          return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
        }

        await supabase
          .from("teacher_invitations")
          .update({
            status: "accepted",
            accepted_at: now,
            created_user_id: existingProfile.id,
          })
          .eq("id", invite.id)
          .eq("status", "pending");

        return NextResponse.json({
          ok: true,
          email,
          redirectHref,
          needsOtp: false,
          resumed: true,
        });
      }

      if (
        sameInstitution &&
        !staffCard.user_profile_id &&
        invite.status === "pending"
      ) {
        if (!password || password.length < 8) {
          return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
        }
        if (phone.length < 9) {
          return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
        }
        const passwordHash = await hashPassword(password);
        const { error: profileUpdateError } = await supabase
          .from("user_profiles")
          .update({
            phone,
            password_hash: passwordHash,
            terms_accepted_at: now,
            setup_completed_at: now,
          })
          .eq("id", existingProfile.id);

        if (profileUpdateError) {
          console.error(
            "[teacher-invite] profile update:",
            profileUpdateError.message
          );
          return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
        }

        const profileRow = { id: existingProfile.id };
        const { error: staffUpdateError } = await supabase
          .from("students")
          .update({
            user_profile_id: profileRow.id,
            phone,
            email,
          })
          .eq("id", staffCard.id)
          .eq("institution_id", invite.institution_id)
          .is("user_profile_id", null);

        if (staffUpdateError) {
          console.error(
            "[teacher-invite] staff update:",
            staffUpdateError.message
          );
          return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
        }

        await supabase
          .from("teacher_invitations")
          .update({
            status: "accepted",
            accepted_at: now,
            created_user_id: profileRow.id,
          })
          .eq("id", invite.id)
          .eq("status", "pending");

        const otp = await sendRegistrationOtp(profileRow.id, email);
        if (!otp.ok) {
          return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 503 });
        }

        return NextResponse.json({
          ok: true,
          email,
          redirectHref,
          needsOtp: true,
          resumed: true,
        });
      }

      return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    }

    if (parsed.data.existingUserAccept === true || !password) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    if (phone.length < 9) {
      return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const { data: profileRow, error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        full_name: teacherName,
        phone,
        email,
        institution_id: institution.id,
        institution_code: institution.code,
        terms_accepted_at: now,
        setup_completed_at: now,
        is_admin: false,
        is_institution_owner: false,
        password_hash: passwordHash,
      })
      .select("id")
      .single();

    if (profileError || !profileRow) {
      console.error("[teacher-invite] profile insert:", profileError?.message);
      if (/duplicate key|user_profiles_email_key/i.test(profileError?.message ?? "")) {
        return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
      }
      return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
    }

    const { error: staffUpdateError } = await supabase
      .from("students")
      .update({
        user_profile_id: profileRow.id,
        phone,
        email,
      })
      .eq("id", staffCard.id)
      .eq("institution_id", invite.institution_id)
      .is("user_profile_id", null);

    if (staffUpdateError) {
      console.error("[teacher-invite] staff update:", staffUpdateError.message);
      await supabase.from("user_profiles").delete().eq("id", profileRow.id);
      return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
    }

    // TZ-17: יצירת רשומת חברות במוסד
    const { error: membershipError } = await supabase
      .from("user_institutions")
      .upsert(
        {
          user_id: profileRow.id,
          institution_id: institution.id,
          role: "member",
        },
        { onConflict: "user_id,institution_id" }
      );

    if (membershipError && !/does not exist|schema cache/i.test(membershipError.message)) {
      console.error("[teacher-invite] membership insert:", membershipError.message);
    }

    const { error: inviteUpdateError } = await supabase
      .from("teacher_invitations")
      .update({
        status: "accepted",
        accepted_at: now,
        created_user_id: profileRow.id,
      })
      .eq("id", invite.id)
      .eq("status", "pending");

    if (inviteUpdateError) {
      console.error("[teacher-invite] invite update:", inviteUpdateError.message);
    }

    const otp = await sendRegistrationOtp(profileRow.id, email);
    if (!otp.ok) {
      return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 503 });
    }

    void insertAuditLog({
      institutionId: institution.id,
      actorUserId: profileRow.id,
      action: "auth.register",
      entityType: "user",
      entityId: profileRow.id,
      summary: `הצטרפות מורה דרך הזמנה: ${teacherName}`,
      metadata: {
        email,
        via: "teacher_invite",
        student_id: staffCard.id,
      },
    });

    return NextResponse.json({
      ok: true,
      email,
      redirectHref,
      needsOtp: true,
    });
  } catch (error) {
    console.error("[teacher-invite]", error);
    return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
  }
}
