import { cookies } from "next/headers";
import { isDemoUserId } from "@/lib/demo-data";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { SESSION_COOKIE, verifySessionTokenSignature } from "@/lib/session";
import { isAuthSessionActive } from "@/lib/auth-sessions";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import type { InstitutionMembershipRole, UserProfile } from "@/lib/supabase/types";
import { USER_PROFILE_SELECT } from "@/lib/institution-owner";
import {
  checkUserInstitutionMembership,
  getSessionActiveInstitution,
  getUserInstitutions,
} from "@/lib/user-institutions";
import { requireAuthSession, type AuthSession } from "@/lib/platform-admin";

/** סשן מחובר: tenant מלא כשיש מוסד פעיל, אחרת אימות פרופיל כמו GET /api/auth/session */
export async function requireLoggedInSession(): Promise<
  | { ok: true; session: AuthSession }
  | { ok: false; status: number; error: string }
> {
  const tenant = await requireTenantSession();
  if (tenant.ok) {
    return {
      ok: true,
      session: {
        userId: tenant.session.userId,
        profile: tenant.session.profile,
      },
    };
  }
  if (tenant.status === 401) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) {
      return tenant;
    }
    const payload = await verifySessionTokenSignature(token);
    if (!payload) {
      return tenant;
    }
    return requireAuthSession();
  }
  return requireAuthSession();
}

export type TenantSession = {
  userId: string;
  institutionId: string;
  profile: UserProfile;
  /** תפקיד החברות במוסד הפעיל */
  membershipRole: InstitutionMembershipRole | null;
  /** האם למשתמש יש יותר ממוסד אחד */
  hasMultipleInstitutions: boolean;
};

/** טוען פרופיל מאומת עם institution_id — לשימוש ב-API routes בלבד. */
export async function requireTenantSession(): Promise<
  | { ok: true; session: TenantSession }
  | { ok: false; status: number; error: string }
> {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return { ok: false, status: 503, error: "SERVER_UNAVAILABLE" };
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  // חתימה+תוקף — מקומי, בלי DB
  const payload = await verifySessionTokenSignature(token);
  if (!payload) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }
  if (isDemoUserId(payload.userId)) {
    return { ok: false, status: 403, error: "DEMO_SESSION" };
  }

  try {
    const supabase = createServiceClient();
    // בדיקת ביטול סשן ושליפת הפרופיל במקביל — חוסך סבב DB בכל בקשה
    const [active, { data: user, error }] = await Promise.all([
      isAuthSessionActive(payload.sid).catch(() => null),
      supabase
        .from("user_profiles")
        .select(USER_PROFILE_SELECT)
        .eq("id", payload.userId)
        .maybeSingle(),
    ]);

    if (active === false) {
      return { ok: false, status: 401, error: "UNAUTHORIZED" };
    }
    if (error || !user) {
      return { ok: false, status: 401, error: "UNAUTHORIZED" };
    }

    const profile = user as UserProfile;

    // TZ-17: בדיקת מוסד פעיל מהסשן או מהפרופיל
    // 1. ניסיון לקבל מוסד פעיל מטבלת הסשנים
    // 2. אם אין — נופלים למוסד מהפרופיל (תאימות לאחור)
    const sessionActiveInstitution =
      payload.userId !== "demo-user"
        ? await getSessionActiveInstitution(payload.sid).catch(() => null)
        : null;

    const activeInstitutionId =
      sessionActiveInstitution ?? profile.institution_id;

    if (!activeInstitutionId) {
      return { ok: false, status: 403, error: "NO_INSTITUTION" };
    }

    // TZ-17: אימות חברות במוסד הפעיל — לא לסמוך על institution_id מהלקוח
    const membershipCheck =
      payload.userId === "demo-user"
        ? { isMember: true, role: "member" as const }
        : await checkUserInstitutionMembership(profile.id, activeInstitutionId);

    if (!membershipCheck.isMember) {
      // Distinguish DB error (503 retryable) from genuine 'not a member' (403)
      if (membershipCheck.dbError) {
        return { ok: false, status: 503, error: "SERVICE_UNAVAILABLE" };
      }

      // המשתמש לא חבר במוסד הפעיל — מנסים לחזור למוסד מהפרופיל
      if (
        sessionActiveInstitution &&
        profile.institution_id &&
        profile.institution_id !== sessionActiveInstitution
      ) {
        const fallbackCheck = await checkUserInstitutionMembership(
          profile.id,
          profile.institution_id
        );
        if (fallbackCheck.isMember) {
          const institutions = await getUserInstitutions(profile.id);
          return {
            ok: true,
            session: {
              userId: profile.id,
              institutionId: profile.institution_id,
              profile,
              membershipRole: fallbackCheck.role,
              hasMultipleInstitutions: institutions.length > 1,
            },
          };
        }
        // Fallback check also hit a DB error
        if (fallbackCheck.dbError) {
          return { ok: false, status: 503, error: "SERVICE_UNAVAILABLE" };
        }
      }
      return { ok: false, status: 403, error: "NOT_MEMBER" };
    }

    // בדיקה אם יש כמה מוסדות
    const institutions = await getUserInstitutions(profile.id);
    const hasMultipleInstitutions = institutions.length > 1;

    return {
      ok: true,
      session: {
        userId: profile.id,
        institutionId: activeInstitutionId,
        profile,
        membershipRole: membershipCheck.role,
        hasMultipleInstitutions,
      },
    };
  } catch (error) {
    console.error("[server-auth]", error);
    return { ok: false, status: 500, error: "AUTH_FAILED" };
  }
}

/**
 * TZ-17: Check if the user is an owner/admin of the ACTIVE institution.
 * Uses membershipRole from the session, not the global profile flag.
 * Falls back to profile.is_institution_owner only when:
 * - The active institution equals profile.institution_id (original)
 * - AND membershipRole is null (pre-migration fallback)
 */
function isOwnerOfActiveInstitution(session: TenantSession): boolean {
  // Use membership role from the active institution if available
  if (session.membershipRole === "owner") {
    return true;
  }

  // Pre-migration fallback: only when active institution is the original one
  // and we don't have a membership role (table might not exist yet)
  if (
    session.membershipRole === null &&
    session.institutionId === session.profile.institution_id &&
    session.profile.is_institution_owner
  ) {
    return true;
  }

  return false;
}

/**
 * TZ-17: Check if the user is an admin (owner or admin role) of the ACTIVE institution.
 * 
 * Admin access is granted when:
 * 1. membershipRole is "owner" or "admin" in the active institution, OR
 * 2. profile.is_admin is true (user-level admin flag, preserves existing behavior), OR
 * 3. Pre-migration fallback: active institution is original AND (is_institution_owner OR is_admin)
 * 
 * Note: profile.is_admin is honored regardless of membershipRole to preserve existing
 * behavior where is_admin non-owners have audit-log access. Owners do NOT gain new
 * admin-only access - they had it before via is_institution_owner check.
 */
function isAdminOfActiveInstitution(session: TenantSession): boolean {
  // Use membership role from the active institution if available
  if (session.membershipRole === "owner" || session.membershipRole === "admin") {
    return true;
  }

  // Honor user-level is_admin flag regardless of membership role
  // This preserves existing behavior for is_admin non-owners
  if (session.profile.is_admin === true) {
    return true;
  }

  // Pre-migration fallback: only when active institution is the original one
  if (
    session.membershipRole === null &&
    session.institutionId === session.profile.institution_id &&
    session.profile.is_institution_owner === true
  ) {
    return true;
  }

  return false;
}

/** דורש סשן tenant + הרשאת מנהל מוסד (admin או owner). */
export async function requireInstitutionAdmin(): Promise<
  | { ok: true; session: TenantSession }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireTenantSession();
  if (!auth.ok) return auth;

  // TZ-17: Check role in ACTIVE institution, not global profile flag
  if (!isAdminOfActiveInstitution(auth.session)) {
    return { ok: false, status: 403, error: "FORBIDDEN" };
  }
  return auth;
}

/** דורש בעלת מוסד (רכזת שנרשמה/רכשה) — להזמנת מורות. */
export async function requireInstitutionOwner(): Promise<
  | { ok: true; session: TenantSession }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireTenantSession();
  if (!auth.ok) return auth;

  // TZ-17: Check role in ACTIVE institution, not global profile flag
  if (!isOwnerOfActiveInstitution(auth.session)) {
    return { ok: false, status: 403, error: "FORBIDDEN" };
  }
  return auth;
}
