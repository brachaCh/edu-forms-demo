import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/password";
import { insertAuditLog } from "@/lib/audit-log";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";
import type { UserProfile } from "@/lib/supabase/types";
import { parseJsonBody, registerBodySchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "SERVER_AUTH_UNAVAILABLE" },
      { status: 503 }
    );
  }

  const parsed = await parseJsonBody(request, registerBodySchema);
  if (!parsed.ok) return parsed.response;

  const {
    full_name: fullName,
    phone,
    email,
    password,
    institution_code: institutionCode,
    institution_name: institutionName,
    school_name: schoolName,
  } = parsed.data;

  try {
    const supabase = createServiceClient();
    const { data: duplicate } = await supabase
      .from("user_profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (duplicate) {
      return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    }

    const { data: existingInstitution, error: institutionLookupError } =
      await supabase
        .from("institutions")
        .select("*")
        .eq("code", institutionCode)
        .maybeSingle();
    if (institutionLookupError) throw institutionLookupError;

    if (existingInstitution) {
      return NextResponse.json(
        { error: "INSTITUTION_CODE_TAKEN" },
        { status: 409 }
      );
    }

    const { data: institution, error: institutionInsertError } = await supabase
      .from("institutions")
      .insert({
        code: institutionCode,
        name: institutionName,
        school_name: schoolName,
      })
      .select("*")
      .single();
    if (institutionInsertError) {
      if (institutionInsertError.code === "23505") {
        return NextResponse.json(
          { error: "INSTITUTION_CODE_TAKEN" },
          { status: 409 }
        );
      }
      throw institutionInsertError;
    }

    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    const { data: profileRow, error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        full_name: fullName,
        phone,
        email,
        institution_id: institution.id,
        institution_code: institutionCode,
        terms_accepted_at: now,
        setup_completed_at: null,
        is_admin: false,
        is_institution_owner: true,
        password_hash: passwordHash,
      })
      .select(
        "id, full_name, phone, email, institution_id, institution_code, setup_completed_at, terms_accepted_at, is_admin, is_institution_owner, created_at"
      )
      .single();
    if (profileError) throw profileError;

    // TZ-17: יצירת רשומת חברות במוסד (בעלים)
    const { error: membershipError } = await supabase
      .from("user_institutions")
      .upsert(
        {
          user_id: profileRow.id,
          institution_id: institution.id,
          role: "owner",
        },
        { onConflict: "user_id,institution_id" }
      );

    if (membershipError && !/does not exist|schema cache/i.test(membershipError.message)) {
      console.error("[auth/register] membership insert:", membershipError.message);
    }

    const profile: UserProfile = {
      ...(profileRow as UserProfile),
      institution_name: institutionName,
      school_name: schoolName,
      institution_type: null,
      education_framework: null,
      institution_logo_url: institution.logo_url ?? null,
    };
    const token = await createSessionToken(profile);
    void insertAuditLog({
      institutionId: institution.id,
      actorUserId: profile.id,
      action: "auth.register",
      entityType: "user",
      entityId: profile.id,
      summary: `הרשמה חדשה: ${profile.full_name}`,
      metadata: { email: profile.email },
    });
    const response = NextResponse.json({ profile }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[auth/register]", error);
    return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
  }
}
