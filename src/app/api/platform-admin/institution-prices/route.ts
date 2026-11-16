import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  MAX_CUSTOM_CLASSES,
  MAX_CUSTOM_STUDENTS,
} from "@/lib/billing/custom-plan";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { parseSpecialPriceAgorot } from "@/lib/tutorials";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

function mapInstitutionRow(row: Record<string, unknown>) {
  return {
    institutionId: row.id as string,
    institutionName: (row.name as string) ?? "",
    institutionCode: (row.code as string) ?? "",
    specialPriceAgorot: (row.special_price_agorot as number | null) ?? null,
    planCustomClasses: (row.plan_custom_classes as number | null) ?? null,
    planCustomStudents: (row.plan_custom_students as number | null) ?? null,
  };
}

const INSTITUTION_PRICE_SELECT =
  "id, name, code, special_price_agorot, plan_custom_classes, plan_custom_students";

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
    const { data, error } = await supabase
      .from("institutions")
      .select(INSTITUTION_PRICE_SELECT)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      institutions: (data ?? []).map((row) =>
        mapInstitutionRow(row as Record<string, unknown>)
      ),
    });
  } catch (error) {
    console.error("[platform-admin/institution-prices GET]", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const institutionId =
    typeof body.institution_id === "string" ? body.institution_id.trim() : "";
  if (!institutionId) {
    return NextResponse.json({ error: "INVALID_INSTITUTION_ID" }, { status: 400 });
  }

  const price = parseSpecialPriceAgorot(body.special_price_agorot);
  if (!price.ok) {
    return NextResponse.json({ error: price.error }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    special_price_agorot: price.value,
  };

  if (body.custom_classes !== undefined) {
    const classes = Number(body.custom_classes);
    if (!Number.isInteger(classes) || classes < 0 || classes > MAX_CUSTOM_CLASSES) {
      return NextResponse.json({ error: "INVALID_CUSTOM_PLAN" }, { status: 400 });
    }
    update.plan_custom_classes = classes;
  }

  if (body.custom_students !== undefined) {
    const students = Number(body.custom_students);
    if (!Number.isInteger(students) || students < 0 || students > MAX_CUSTOM_STUDENTS) {
      return NextResponse.json({ error: "INVALID_CUSTOM_PLAN" }, { status: 400 });
    }
    update.plan_custom_students = students;
  }

  try {
    const supabase = createServiceClient();
    const { error: updateError } = await supabase
      .from("institutions")
      .update(update)
      .eq("id", institutionId);

    if (updateError) throw updateError;

    const { data, error } = await supabase
      .from("institutions")
      .select(INSTITUTION_PRICE_SELECT)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      institutions: (data ?? []).map((row) =>
        mapInstitutionRow(row as Record<string, unknown>)
      ),
    });
  } catch (error) {
    console.error("[platform-admin/institution-prices PATCH]", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}
