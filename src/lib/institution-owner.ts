import type { InstitutionMembershipRole, UserProfile } from "@/lib/supabase/types";

/** עמודות פרופיל סטנדרטיות ל-API (כולל בעלות מוסד) */
export const USER_PROFILE_SELECT =
  "id, full_name, phone, email, institution_id, institution_code, setup_completed_at, terms_accepted_at, is_admin, is_institution_owner, created_at";

/**
 * רק בעלת המוסד (רכזת שילוב שנרשמה/רכשה) יכולה להזמין מורות.
 * is_admin נשאר נפרד (מנהל/פטור חיוב) ולא מחליף בעלות.
 */
export function canInviteInstitutionTeachers(
  profile: Pick<UserProfile, "is_institution_owner"> | null | undefined
): boolean {
  return profile?.is_institution_owner === true;
}

/**
 * Class homeroom (מחנכת) invite: institution owner or admin.
 * Matches requireInstitutionAdmin — membership owner/admin, system is_admin,
 * or pre-migration owner flag when membership role is missing.
 */
export function canInviteHomeroomTeacher(input: {
  membershipRole?: InstitutionMembershipRole | null;
  isAdmin?: boolean | null;
  isInstitutionOwner?: boolean | null;
} | null | undefined): boolean {
  if (!input) return false;
  if (input.isAdmin === true) return true;
  if (input.membershipRole === "owner" || input.membershipRole === "admin") {
    return true;
  }
  if (input.membershipRole == null && input.isInstitutionOwner === true) {
    return true;
  }
  return false;
}

/**
 * TZ-32: Only institution owner or system admin can assign students to teachers.
 * Admin role (role='admin') cannot assign — only owner (role='owner').
 * System admin (is_admin on profile) has superuser bypass.
 *
 * @param membershipRole - The user's role in the institution (from user_institutions table)
 * @param isAdmin - Whether the user has system admin flag (is_admin on user_profiles)
 */
export function canAssignStudentsToTeachers(
  membershipRole: InstitutionMembershipRole | null | undefined,
  isAdmin: boolean | null | undefined
): boolean {
  if (isAdmin === true) return true;
  return membershipRole === "owner";
}
