import "server-only";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { SESSION_COOKIE, verifySessionTokenSignature } from "@/lib/session";
import {
  getSessionActiveInstitution,
  getUserInstitutions,
} from "@/lib/user-institutions";

export type ReporterInstitution = {
  name: string | null;
  code: string | null;
};

export async function resolveReporterInstitutionId(
  userId: string,
  profileInstitutionId: string | null | undefined
): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && userId !== "demo-user") {
    const payload = await verifySessionTokenSignature(token);
    if (payload?.userId === userId) {
      const active = await getSessionActiveInstitution(payload.sid).catch(
        () => null
      );
      if (active?.trim()) {
        return active.trim();
      }
    }
  }

  if (profileInstitutionId?.trim()) {
    return profileInstitutionId.trim();
  }

  const memberships = await getUserInstitutions(userId).catch(() => []);
  return memberships[0]?.institution_id ?? null;
}

export async function loadReporterInstitution(
  institutionId: string | null | undefined
): Promise<ReporterInstitution> {
  if (!institutionId?.trim()) {
    return { name: null, code: null };
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("institutions")
      .select("school_name, name, code")
      .eq("id", institutionId)
      .maybeSingle();
    if (error || !data) {
      return { name: null, code: null };
    }
    const name =
      (typeof data.school_name === "string" && data.school_name.trim()) ||
      (typeof data.name === "string" && data.name.trim()) ||
      null;
    const code =
      typeof data.code === "string" && data.code.trim()
        ? data.code.trim()
        : null;
    return { name, code };
  } catch {
    return { name: null, code: null };
  }
}
