import type { Institution, UserProfile } from "@/lib/supabase/types";

export function mergeInstitutionIntoProfile(
  profile: UserProfile,
  institution: Institution | null | undefined
): UserProfile {
  if (!institution) return profile;

  return {
    ...profile,
    institution_name: institution.name ?? null,
    school_name: institution.school_name ?? null,
    institution_type: institution.institution_type ?? null,
    education_framework: institution.education_framework ?? null,
    institution_logo_url: institution.logo_url ?? null,
    plan_id: institution.plan_id ?? null,
    plan_selected_at: institution.plan_selected_at ?? null,
    subscription_status: institution.subscription_status ?? "none",
    paid_at: institution.paid_at ?? null,
    plan_expires_at: institution.plan_expires_at ?? null,
    payment_method: institution.payment_method ?? null,
    plan_custom_classes: institution.plan_custom_classes ?? null,
    plan_custom_students: institution.plan_custom_students ?? null,
    special_price_agorot: institution.special_price_agorot ?? null,
  };
}
