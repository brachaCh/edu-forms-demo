/**
 * קבלת הזמנת מורה כשכבר יש חשבון — בלי רישום מחדש.
 * משתמשת קיימת ממוסד אחר מצטרפת כ-member ומקושרת לכרטיס הצוות.
 */

import { normalizeEmail } from "@/lib/normalize-email";

export type ExistingUserInviteDecision =
  | { action: "accept_without_register"; userId: string }
  | { action: "login_required" }
  | { action: "session_mismatch" }
  | { action: "register_new" }
  | { action: "same_institution" };

export function decideExistingUserInviteAccept(input: {
  existingProfile: { id: string; institution_id: string | null } | null;
  inviteInstitutionId: string;
  inviteEmail: string;
  session: { userId: string; email: string } | null;
}): ExistingUserInviteDecision {
  const inviteEmail = normalizeEmail(input.inviteEmail);
  if (!input.existingProfile?.id) {
    return { action: "register_new" };
  }

  const sameInstitution =
    input.existingProfile.institution_id === input.inviteInstitutionId;
  if (sameInstitution) {
    return { action: "same_institution" };
  }

  if (!input.session) {
    return { action: "login_required" };
  }

  if (normalizeEmail(input.session.email) !== inviteEmail) {
    return { action: "session_mismatch" };
  }

  return {
    action: "accept_without_register",
    userId: input.existingProfile.id,
  };
}

/**
 * A pending invite is valid when the staff card is unlinked, or already
 * linked to the same invited user (teacher who left can rejoin).
 * A card linked to anyone else stays INVALID_TOKEN.
 */
export function pendingInviteAllowsLinkedStaffCard(input: {
  staffCard: {
    status?: string | null;
    user_profile_id?: string | null;
  } | null;
  invitedUserId?: string | null;
}): boolean {
  if (!input.staffCard || input.staffCard.status !== "integration-teacher") {
    return false;
  }
  if (!input.staffCard.user_profile_id) return true;
  return (
    Boolean(input.invitedUserId) &&
    input.staffCard.user_profile_id === input.invitedUserId
  );
}

/**
 * Link the invite staff card to the existing user only when it is still
 * unlinked and belongs to the invite institution. Never overwrites a link
 * (including a card already linked to this same user).
 */
export function staffCardLinkForExistingUser(input: {
  staffCard: {
    id: string;
    institution_id: string;
    user_profile_id?: string | null;
  };
  inviteInstitutionId: string;
  userId: string;
}): { staffCardId: string; userId: string } | null {
  if (input.staffCard.institution_id !== input.inviteInstitutionId) {
    return null;
  }
  if (input.staffCard.user_profile_id) {
    return null;
  }
  return { staffCardId: input.staffCard.id, userId: input.userId };
}
