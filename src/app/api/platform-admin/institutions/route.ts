import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

interface MemberRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string | null;
}

export async function GET() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = createServiceClient();
    const { data: institutions, error } = await supabase
      .from("institutions")
      .select("id, name, school_name, code, institution_type, created_at")
      .order("name", { ascending: true });

    if (error) throw error;

    const institutionIds = (institutions ?? []).map((row) => row.id as string);
    const membersByInstitution = new Map<string, MemberRow[]>();

    if (institutionIds.length > 0) {
      const { data: memberships } = await supabase
        .from("user_institutions")
        .select("user_id, institution_id, role")
        .in("institution_id", institutionIds);

      const userIds = [
        ...new Set((memberships ?? []).map((row) => row.user_id as string)),
      ];

      const profilesById = new Map<
        string,
        { full_name: string; email: string; phone: string | null }
      >();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id, full_name, email, phone")
          .in("id", userIds);
        for (const profile of profiles ?? []) {
          profilesById.set(profile.id as string, {
            full_name: (profile.full_name as string) ?? "",
            email: (profile.email as string) ?? "",
            phone: (profile.phone as string | null) ?? null,
          });
        }
      }

      for (const membership of memberships ?? []) {
        const instId = membership.institution_id as string;
        const profile = profilesById.get(membership.user_id as string);
        if (!profile) continue;
        const list = membersByInstitution.get(instId) ?? [];
        list.push({
          id: membership.user_id as string,
          fullName: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          role: (membership.role as string | null) ?? null,
        });
        membersByInstitution.set(instId, list);
      }

      // Fallback: profiles whose institution_id is set but no membership row
      const { data: fallbackProfiles } = await supabase
        .from("user_profiles")
        .select("id, full_name, email, phone, institution_id")
        .in("institution_id", institutionIds);

      for (const profile of fallbackProfiles ?? []) {
        const instId = profile.institution_id as string | null;
        if (!instId) continue;
        const list = membersByInstitution.get(instId) ?? [];
        if (list.some((member) => member.id === profile.id)) continue;
        list.push({
          id: profile.id as string,
          fullName: (profile.full_name as string) ?? "",
          email: (profile.email as string) ?? "",
          phone: (profile.phone as string | null) ?? null,
          role: null,
        });
        membersByInstitution.set(instId, list);
      }
    }

    return NextResponse.json({
      institutions: (institutions ?? []).map((row) => ({
        id: row.id as string,
        name: (row.name as string) ?? "",
        schoolName: (row.school_name as string | null) ?? null,
        code: (row.code as string) ?? "",
        institutionType: (row.institution_type as string | null) ?? null,
        createdAt: (row.created_at as string) ?? "",
        members: membersByInstitution.get(row.id as string) ?? [],
      })),
    });
  } catch (error) {
    console.error("[platform-admin/institutions GET]", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
