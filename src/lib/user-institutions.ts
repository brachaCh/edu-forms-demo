/**
 * TZ-17: ניהול חברויות משתמש במוסדות (multi-institution support)
 * קובץ זה מכיל פונקציות עזר לניהול המבנה הרב-מוסדי
 */

import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import type {
  InstitutionMembershipRole,
  UserInstitutionWithDetails,
} from "@/lib/supabase/types";

export interface MembershipCheckResult {
  isMember: boolean;
  role: InstitutionMembershipRole | null;
  /** Set to true when a transient DB error occurred (should retry / return 503) */
  dbError?: boolean;
}

/**
 * בודק אם למשתמש יש חברות במוסד מסוים
 * @returns { isMember: boolean, role: InstitutionMembershipRole | null }
 */
export async function checkUserInstitutionMembership(
  userId: string,
  institutionId: string
): Promise<MembershipCheckResult> {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return { isMember: false, role: null };
  }

  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("user_institutions")
      .select("role")
      .eq("user_id", userId)
      .eq("institution_id", institutionId)
      .maybeSingle();

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return fallbackLegacyMembershipCheck(userId, institutionId);
      }
      console.error("[user-institutions] membership check:", error.message);
      return { isMember: false, role: null, dbError: true };
    }

    if (!data) {
      return { isMember: false, role: null };
    }

    return {
      isMember: true,
      role: data.role as InstitutionMembershipRole,
    };
  } catch (error) {
    console.error("[user-institutions] membership check exception:", error);
    return { isMember: false, role: null, dbError: true };
  }
}

/**
 * Fallback לפני הרצת מיגרציה 056 — בודק לפי institution_id בפרופיל
 */
async function fallbackLegacyMembershipCheck(
  userId: string,
  institutionId: string
): Promise<MembershipCheckResult> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("institution_id, is_institution_owner")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[user-institutions] fallback membership check:", error.message);
      return { isMember: false, role: null, dbError: true };
    }

    if (!data) {
      return { isMember: false, role: null };
    }

    if (data.institution_id === institutionId) {
      return {
        isMember: true,
        role: data.is_institution_owner ? "owner" : "member",
      };
    }

    return { isMember: false, role: null };
  } catch (error) {
    console.error("[user-institutions] fallback membership check exception:", error);
    return { isMember: false, role: null, dbError: true };
  }
}

/**
 * מחזיר את כל המוסדות שהמשתמש חבר בהם
 */
export async function getUserInstitutions(
  userId: string
): Promise<UserInstitutionWithDetails[]> {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return [];
  }

  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("user_institutions")
      .select(`
        institution_id,
        role,
        created_at,
        institutions:institution_id (
          id,
          code,
          name,
          school_name,
          logo_url
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return fallbackLegacyGetUserInstitutions(userId);
      }
      console.error("[user-institutions] get institutions:", error.message);
      return [];
    }

    if (!data) return [];

    return data.map((row) => {
      const inst = row.institutions as unknown as {
        id: string;
        code: string;
        name: string;
        school_name: string | null;
        logo_url: string | null;
      } | null;

      return {
        institution_id: row.institution_id,
        institution_code: inst?.code ?? "",
        institution_name: inst?.name ?? "",
        school_name: inst?.school_name ?? null,
        logo_url: inst?.logo_url ?? null,
        role: row.role as InstitutionMembershipRole,
        membership_created_at: row.created_at,
      };
    });
  } catch (error) {
    console.error("[user-institutions] get institutions exception:", error);
    return [];
  }
}

/**
 * Fallback לפני הרצת מיגרציה 056
 */
async function fallbackLegacyGetUserInstitutions(
  userId: string
): Promise<UserInstitutionWithDetails[]> {
  try {
    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("institution_id, is_institution_owner, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.institution_id) return [];

    const { data: institution } = await supabase
      .from("institutions")
      .select("id, code, name, school_name, logo_url")
      .eq("id", profile.institution_id)
      .maybeSingle();

    if (!institution) return [];

    return [
      {
        institution_id: institution.id,
        institution_code: institution.code,
        institution_name: institution.name,
        school_name: institution.school_name,
        logo_url: institution.logo_url,
        role: profile.is_institution_owner ? "owner" : "member",
        membership_created_at: profile.created_at,
      },
    ];
  } catch {
    return [];
  }
}

/**
 * מוסיף חברות למשתמש במוסד (למשל אחרי קבלת הזמנה)
 */
export async function addUserInstitutionMembership(input: {
  userId: string;
  institutionId: string;
  role: InstitutionMembershipRole;
}): Promise<boolean> {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return false;
  }

  try {
    const supabase = createServiceClient();

    const { error } = await supabase.from("user_institutions").upsert(
      {
        user_id: input.userId,
        institution_id: input.institutionId,
        role: input.role,
      },
      { onConflict: "user_id,institution_id" }
    );

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return true;
      }
      console.error("[user-institutions] add membership:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[user-institutions] add membership exception:", error);
    return false;
  }
}

/**
 * מעדכן את המוסד הפעיל בסשן
 */
export async function updateSessionActiveInstitution(
  sessionId: string,
  institutionId: string
): Promise<boolean> {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return false;
  }

  try {
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("auth_sessions")
      .update({ active_institution_id: institutionId })
      .eq("id", sessionId);

    if (error) {
      if (/does not exist|schema cache|column/i.test(error.message)) {
        return true;
      }
      console.error("[user-institutions] update active institution:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[user-institutions] update active institution exception:", error);
    return false;
  }
}

/**
 * מחזיר את המוסד הפעיל מהסשן
 */
export async function getSessionActiveInstitution(
  sessionId: string
): Promise<string | null> {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return null;
  }

  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("auth_sessions")
      .select("active_institution_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      if (/does not exist|schema cache|column/i.test(error.message)) {
        return null;
      }
      console.error("[user-institutions] get active institution:", error.message);
      return null;
    }

    return data?.active_institution_id ?? null;
  } catch (error) {
    console.error("[user-institutions] get active institution exception:", error);
    return null;
  }
}
