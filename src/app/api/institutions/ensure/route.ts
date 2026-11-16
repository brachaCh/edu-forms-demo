/**
 * עדכון מוסד לפי קוד — רק למשתמשת מחוברת ולמוסד שלה, דרך service_role.
 * יצירת מוסד ברישום: /api/auth/register.
 */

import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Institution } from "@/lib/supabase/types";
import { parseJsonBody } from "@/lib/validation";
import { nonEmptyTrimmed } from "@/lib/validation/primitives";
import { z } from "zod";

const ensureInstitutionBodySchema = z.object({
  code: nonEmptyTrimmed(3, 40),
  name: nonEmptyTrimmed(2, 200),
  school_name: nonEmptyTrimmed(2, 200),
});

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, ensureInstitutionBodySchema);
  if (!parsed.ok) return parsed.response;

  const { code, name, school_name } = parsed.data;

  try {
    const supabase = createServiceClient();
    const { data: existing, error: findError } = await supabase
      .from("institutions")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (findError) throw new Error(findError.message);

    if (!existing) {
      return NextResponse.json({ error: "INSTITUTION_NOT_FOUND" }, { status: 404 });
    }

    const row = existing as Institution;
    if (row.id !== auth.session.institutionId) {
      return NextResponse.json({ error: "FORBIDDEN_INSTITUTION" }, { status: 403 });
    }
    // TZ-17: Check role in ACTIVE institution, not global profile flag
    const isOwner =
      auth.session.membershipRole === "owner" ||
      (auth.session.membershipRole === null &&
        auth.session.institutionId === auth.session.profile.institution_id &&
        auth.session.profile.is_institution_owner);
    if (!isOwner) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("institutions")
      .update({ name, school_name })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: data as Institution });
  } catch (error) {
    console.error("[api/institutions/ensure] POST:", error);
    return NextResponse.json(
      { error: "ENSURE_INSTITUTION_FAILED" },
      { status: 500 }
    );
  }
}
