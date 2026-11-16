import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { mergeInstitutionIntoProfile } from "@/lib/profile-institution";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import type { Institution, UserProfile } from "@/lib/supabase/types";
import { USER_PROFILE_SELECT } from "@/lib/institution-owner";

export async function authenticatedUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await verifySessionToken(token))?.userId ?? null;
}

export async function loadBillingProfile(userId: string): Promise<UserProfile | null> {
  try {
    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[billing] loadProfile:", error.message);
      return null;
    }
    if (!user) return null;

    const { data: institution } = user.institution_id
      ? await supabase
          .from("institutions")
          .select("*")
          .eq("id", user.institution_id)
          .maybeSingle()
      : { data: null };

    return mergeInstitutionIntoProfile(
      user as UserProfile,
      institution as Institution | null
    );
  } catch (error) {
    console.error("[billing] loadProfile exception:", error);
    return null;
  }
}

/**
 * TZ-17: Loads billing profile with the ACTIVE institution from the session,
 * not the original institution from user_profiles. This ensures a teacher
 * in multiple institutions pays for / updates the currently active one.
 */
export async function loadBillingProfileForActiveInstitution(
  userId: string,
  activeInstitutionId: string
): Promise<UserProfile | null> {
  try {
    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[billing] loadProfileForActiveInstitution:", error.message);
      return null;
    }
    if (!user) return null;

    const { data: institution } = await supabase
      .from("institutions")
      .select("*")
      .eq("id", activeInstitutionId)
      .maybeSingle();

    const profile = user as UserProfile;
    const merged = mergeInstitutionIntoProfile(
      { ...profile, institution_id: activeInstitutionId },
      institution as Institution | null
    );

    return merged;
  } catch (error) {
    console.error("[billing] loadProfileForActiveInstitution exception:", error);
    return null;
  }
}
