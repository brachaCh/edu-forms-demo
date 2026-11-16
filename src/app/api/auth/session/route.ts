import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  verifySessionTokenSignature,
} from "@/lib/session";
import { isAuthSessionActive } from "@/lib/auth-sessions";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { mergeInstitutionIntoProfile } from "@/lib/profile-institution";
import { isSumitBillingConfigured } from "@/lib/sumit/plan-catalog";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { DEMO_USER, isDemoUserId } from "@/lib/demo-data";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import type { Institution, UserProfile } from "@/lib/supabase/types";
import { USER_PROFILE_SELECT, canAssignStudentsToTeachers } from "@/lib/institution-owner";
import {
  checkUserInstitutionMembership,
  getUserInstitutions,
  getSessionActiveInstitution,
} from "@/lib/user-institutions";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ profile: null });
  }

  // חתימה מקומית קודם; בדיקת הביטול בשרת רצה במקביל לשליפת הפרופיל למטה
  const session = await verifySessionTokenSignature(token);
  if (!session) {
    const response = NextResponse.json({ profile: null });
    response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }
  const sessionActivePromise: Promise<boolean | null> = isDemoUserId(
    session.userId
  )
    ? Promise.resolve(true)
    : isAuthSessionActive(session.sid).catch(() => null);

  // רק מזהה הדמו — לא התאמת מייל (מונע השתלטות אם נרשמים עם demo@example.local)
  if (isDemoUserId(session.userId)) {
    return NextResponse.json({
      profile: DEMO_USER,
      sumitConfigured: isSumitBillingConfigured(),
      // PR #54: Demo users are NOT platform admins (security hardening)
      isPlatformAdmin: false,
      // TZ-28: Demo users have full access for member-scoped features
      membershipRole: "owner",
      canManageStudents: true,
      // TZ-32: Demo users can assign students to teachers
      canAssignTeachers: true,
    });
  }

  if (isSupabaseConfiguredServer() && isServiceRoleConfigured()) {
    try {
      const supabase = createServiceClient();
      const [active, { data, error }] = await Promise.all([
        sessionActivePromise,
        supabase
          .from("user_profiles")
          .select(USER_PROFILE_SELECT)
          .eq("id", session.userId)
          .maybeSingle(),
      ]);

      if (active === false) {
        const response = NextResponse.json({ profile: null });
        response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
        return response;
      }

      if (!error && data) {
        let profile = data as UserProfile;

        // TZ-17: Get active institution from session, falling back to profile.institution_id
        const activeInstitutionId =
          (await getSessionActiveInstitution(session.sid).catch(() => null)) ??
          profile.institution_id;

        if (activeInstitutionId) {
          const { data: institution } = await supabase
            .from("institutions")
            .select("*")
            .eq("id", activeInstitutionId)
            .maybeSingle();
          if (institution) {
            // TZ-17: Override institution_id with the active one and merge
            profile = mergeInstitutionIntoProfile(
              { ...profile, institution_id: activeInstitutionId },
              institution as Institution
            );
          }
        }

        // TZ-17: בדיקה אם למשתמש יש כמה מוסדות
        const institutions = await getUserInstitutions(profile.id);
        const hasMultipleInstitutions = institutions.length > 1;

        // TZ-28: Get membership role for the active institution
        const membershipCheck = activeInstitutionId
          ? await checkUserInstitutionMembership(profile.id, activeInstitutionId)
          : { isMember: false, role: null };
        const membershipRole = membershipCheck.role;
        // TZ-28: User can manage students if owner, admin, or system admin
        const canManageStudents =
          membershipRole === "owner" ||
          membershipRole === "admin" ||
          profile.is_admin === true;
        // TZ-32: Only owner or system admin can assign students to teachers (not admin)
        const canAssignTeachers = canAssignStudentsToTeachers(
          membershipRole,
          profile.is_admin
        );

        return NextResponse.json({
          profile,
          sumitConfigured: isSumitBillingConfigured(),
          isPlatformAdmin: isPlatformAdminEmail(profile.email),
          hasMultipleInstitutions,
          institutionCount: institutions.length,
          membershipRole,
          canManageStudents,
          canAssignTeachers,
        });
      }
    } catch (error) {
      console.error("[auth/session]", error);
    }
  }

  if ((await sessionActivePromise) === false) {
    const response = NextResponse.json({ profile: null });
    response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  return NextResponse.json({
    profile: {
      id: session.userId,
      email: session.email,
      full_name: session.fullName,
      phone: "",
      institution_id: null,
      institution_code: null,
      setup_completed_at: null,
      terms_accepted_at: null,
      is_admin: false,
      is_institution_owner: false,
      created_at: new Date().toISOString(),
    } satisfies UserProfile,
    sumitConfigured: isSumitBillingConfigured(),
    isPlatformAdmin: false,
  });
}
