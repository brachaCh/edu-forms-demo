import { createServiceClient } from "@/lib/supabase/admin";
import type { Institution, UserProfile } from "@/lib/supabase/types";

export interface InstitutionBillingContext {
  planId: string | null;
  institutionType: Institution["institution_type"] | null;
  educationFramework: Institution["education_framework"] | null;
  planCustomClasses: number | null;
  planCustomStudents: number | null;
  isAdmin: boolean;
}

export async function loadInstitutionBillingContext(
  institutionId: string,
  userId?: string | null
): Promise<InstitutionBillingContext | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("institutions")
    .select("plan_id, institution_type, education_framework, plan_custom_classes, plan_custom_students")
    .eq("id", institutionId)
    .maybeSingle();

  if (error || !data) return null;

  let isAdmin = false;
  if (userId) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    isAdmin = profile?.is_admin === true;
  }

  return {
    planId: (data.plan_id as string | null) ?? null,
    institutionType:
      (data.institution_type as Institution["institution_type"] | null) ?? null,
    educationFramework:
      (data.education_framework as Institution["education_framework"] | null) ?? null,
    planCustomClasses: (data.plan_custom_classes as number | null) ?? null,
    planCustomStudents: (data.plan_custom_students as number | null) ?? null,
    isAdmin,
  };
}
