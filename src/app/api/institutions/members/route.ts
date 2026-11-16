import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireInstitutionOwner } from "@/lib/server-auth";

/** רשימת המשתמשים במוסד — רק לבעלת המוסד, כדי לבחור למי להעביר בעלות. */
export async function GET() {
  const auth = await requireInstitutionOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, is_institution_owner")
      .eq("institution_id", auth.session.institutionId)
      .order("full_name", { ascending: true });

    if (error) throw error;

    const members = (data ?? []).map((row) => ({
      id: row.id as string,
      full_name: (row.full_name as string) ?? "",
      email: (row.email as string) ?? "",
      is_institution_owner: row.is_institution_owner === true,
    }));

    return NextResponse.json({ members });
  } catch (error) {
    console.error("[institutions/members]", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
