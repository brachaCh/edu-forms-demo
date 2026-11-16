import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit-log";
import {
  isSetupBlockedForInstitutionType,
  PILOT_BLOCKED_ERROR_CODE,
} from "@/lib/billing/pilot-blocked-types";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import type { Institution, UserProfile } from "@/lib/supabase/types";
import { USER_PROFILE_SELECT } from "@/lib/institution-owner";
import { mergeInstitutionIntoProfile } from "@/lib/profile-institution";
import {
  institutionSettingsBodySchema,
  parseJsonBody,
} from "@/lib/validation";

async function authenticatedUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await verifySessionToken(token))?.userId ?? null;
}

/**
 * TZ-17: Load profile with the ACTIVE institution's data, not the original.
 */
async function loadProfileForActiveInstitution(
  userId: string,
  activeInstitutionId: string | null
): Promise<UserProfile | null> {
  try {
    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[settings/institution] loadProfile:", error.message);
      return null;
    }
    if (!user) return null;

    const institutionIdToLoad = activeInstitutionId ?? (user as UserProfile).institution_id;

    const { data: institution } = institutionIdToLoad
      ? await supabase
          .from("institutions")
          .select("*")
          .eq("id", institutionIdToLoad)
          .maybeSingle()
      : { data: null };

    return mergeInstitutionIntoProfile(
      { ...(user as UserProfile), institution_id: institutionIdToLoad },
      institution as Institution | null
    );
  } catch (error) {
    console.error("[settings/institution] loadProfile exception:", error);
    return null;
  }
}

/**
 * TZ-17: Load profile without institution merge (for new user creation path)
 */
async function loadUserProfileOnly(userId: string): Promise<UserProfile | null> {
  try {
    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[settings/institution] loadUserProfileOnly:", error.message);
      return null;
    }
    return user as UserProfile | null;
  } catch (error) {
    console.error("[settings/institution] loadUserProfileOnly exception:", error);
    return null;
  }
}

export async function GET() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  // TZ-17: Try to get active institution from session, but don't require it
  // (new users may not have an institution yet)
  const { requireTenantSession } = await import("@/lib/server-auth");
  const auth = await requireTenantSession();

  if (auth.ok) {
    // User has an active institution - return that institution's data
    const profile = await loadProfileForActiveInstitution(
      auth.session.userId,
      auth.session.institutionId
    );
    return profile
      ? NextResponse.json({ profile })
      : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // No institution or not logged in - try basic auth
  if (auth.error === "NO_INSTITUTION") {
    const userId = await authenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const profile = await loadUserProfileOnly(userId);
    return profile
      ? NextResponse.json({ profile })
      : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ error: auth.error }, { status: auth.status });
}

export async function PUT(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const parsed = await parseJsonBody(request, institutionSettingsBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const institutionCode = parsed.data.institution_code;
  const institutionName = parsed.data.institution_name;
  const schoolName = parsed.data.school_name;
  const institutionType = parsed.data.institution_type;
  const framework = parsed.data.education_framework;
  const logo =
    typeof parsed.data.logo_url === "string" &&
    parsed.data.logo_url.startsWith("data:image/")
      ? parsed.data.logo_url
      : parsed.data.logo_url === null
        ? null
        : undefined;

  // TZ-17: Try to get active institution from session
  const { requireTenantSession } = await import("@/lib/server-auth");
  const auth = await requireTenantSession();

  let userId: string;
  let activeInstitutionId: string | null = null;
  let membershipRole: string | null = null;

  if (auth.ok) {
    userId = auth.session.userId;
    activeInstitutionId = auth.session.institutionId;
    membershipRole = auth.session.membershipRole;
  } else if (auth.error === "NO_INSTITUTION") {
    // New user creating their first institution
    const authUserId = await authenticatedUserId();
    if (!authUserId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    userId = authUserId;
  } else {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = createServiceClient();

    // TZ-17: Check ownership in the ACTIVE institution
    let isOwnerOfActive = false;
    if (activeInstitutionId) {
      // Check if user is owner of the active institution
      isOwnerOfActive =
        membershipRole === "owner" ||
        (membershipRole === null && auth.ok && auth.session.profile.is_institution_owner === true &&
          auth.session.institutionId === auth.session.profile.institution_id);
    }

    // Load current profile with active institution data
    const current = activeInstitutionId
      ? await loadProfileForActiveInstitution(userId, activeInstitutionId)
      : await loadUserProfileOnly(userId);

    if (!current) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // If user has an active institution, they must be owner to edit it
    if (activeInstitutionId && !isOwnerOfActive) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (
      activeInstitutionId &&
      isSetupBlockedForInstitutionType(
        institutionType,
        current.institution_type ?? null,
        current.subscription_status ?? null
      )
    ) {
      return NextResponse.json({ error: PILOT_BLOCKED_ERROR_CODE }, { status: 403 });
    }

    // TZ-17: Use active institution ID, not profile.institution_id
    let institutionId = activeInstitutionId;
    if (!institutionId) {
      // Never join an existing institution by code — each user gets their own workspace.
      // Joining an existing institution goes through teacher_invitations.
      // Check if code is already taken (UNIQUE constraint on institutions.code).
      const { data: byCode } = await supabase
        .from("institutions")
        .select("id")
        .eq("code", institutionCode)
        .maybeSingle();

      if (byCode?.id) {
        return NextResponse.json(
          { error: "INSTITUTION_CODE_TAKEN" },
          { status: 409 }
        );
      }

      const { data: created, error: createError } = await supabase
        .from("institutions")
        .insert({
          code: institutionCode,
          name: institutionName,
          school_name: schoolName,
          institution_type: institutionType,
          education_framework: framework,
          ...(logo !== undefined ? { logo_url: logo } : {}),
        })
        .select("id")
        .single();
      if (createError) {
        if (createError.code === "23505") {
          return NextResponse.json(
            { error: "INSTITUTION_CODE_TAKEN" },
            { status: 409 }
          );
        }
        throw createError;
      }
      institutionId = created.id;

      const { error: linkError } = await supabase
        .from("user_profiles")
        .update({
          institution_id: institutionId,
          institution_code: institutionCode,
          is_institution_owner: true,
        })
        .eq("id", userId);
      if (linkError) throw linkError;

      // TZ-17: יצירת רשומת חברות במוסד (בעלים)
      const { error: membershipError } = await supabase
        .from("user_institutions")
        .upsert(
          {
            user_id: userId,
            institution_id: institutionId,
            role: "owner",
          },
          { onConflict: "user_id,institution_id" }
        );

      if (membershipError && !/does not exist|schema cache/i.test(membershipError.message)) {
        console.error("[settings/institution] membership insert:", membershipError.message);
      }
    }

    const institutionPatch: Record<string, unknown> = {
      code: institutionCode,
      name: institutionName,
      school_name: schoolName,
      institution_type: institutionType,
      education_framework: framework,
    };
    if (logo !== undefined) institutionPatch.logo_url = logo;

    // שינוי מסגרת (רגיל ↔ מיוחד, או הגדרה ראשונה אחרי חבילה) — מאפסים חבילה
    const previousFramework = current.education_framework ?? null;
    const frameworkChanged = previousFramework !== framework;
    if (frameworkChanged) {
      institutionPatch.plan_id = null;
      institutionPatch.plan_selected_at = null;
      institutionPatch.subscription_status = "none";
      institutionPatch.plan_custom_classes = null;
      institutionPatch.plan_custom_students = null;
    }

    const { error: institutionError } = await supabase
      .from("institutions")
      .update(institutionPatch)
      .eq("id", institutionId);
    if (institutionError) {
      if (institutionError.code === "23505") {
        return NextResponse.json(
          { error: "INSTITUTION_CODE_TAKEN" },
          { status: 409 }
        );
      }
      throw institutionError;
    }

    // Sync institution_code to ALL profiles linked to this institution,
    // so that when the owner changes the code, everyone stays in sync.
    const { error: syncError } = await supabase
      .from("user_profiles")
      .update({ institution_code: institutionCode })
      .eq("institution_id", institutionId);
    if (syncError) {
      console.error("[settings/institution] sync code:", syncError.message);
    }

    // Only update user_profiles.institution_id when creating a new institution
    // (not when editing an existing active institution)
    const profileUpdatePayload: Record<string, unknown> = {
      setup_completed_at: new Date().toISOString(),
    };
    if (!activeInstitutionId) {
      // New institution creation - link to profile
      profileUpdatePayload.institution_id = institutionId;
      profileUpdatePayload.institution_code = institutionCode;
    }

    const { error: profileError } = await supabase
      .from("user_profiles")
      .update(profileUpdatePayload)
      .eq("id", userId);
    if (profileError) throw profileError;

    // TZ-17: Return profile with the active institution's data
    const profile = await loadProfileForActiveInstitution(userId, institutionId);
    if (institutionId) {
      void insertAuditLog({
        institutionId: institutionId,
        actorUserId: userId,
        action: "institution.update",
        entityType: "institution",
        entityId: institutionId,
        summary: `עודכנו פרטי מוסד: ${institutionName}`,
        metadata: {
          institution_code: institutionCode,
          school_name: schoolName,
          logo_updated: logo !== undefined,
        },
      });
    }
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[settings/institution]", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}
