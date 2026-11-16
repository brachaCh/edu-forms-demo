import { NextResponse } from "next/server";
import {
  loadAllBillingUnitPrices,
  updateBillingUnitPrices,
  type BillingInstitutionType,
} from "@/lib/billing/custom-plan";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

const INSTITUTION_TYPES: BillingInstitutionType[] = [
  "kindergartens",
  "schools",
  "high-schools",
];

function isInstitutionType(value: string): value is BillingInstitutionType {
  return INSTITUTION_TYPES.includes(value as BillingInstitutionType);
}

export async function GET() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prices = await loadAllBillingUnitPrices();
  return NextResponse.json({ prices });
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

  const institutionType =
    typeof body.institution_type === "string" ? body.institution_type.trim() : "";
  if (!isInstitutionType(institutionType)) {
    return NextResponse.json({ error: "INVALID_INSTITUTION_TYPE" }, { status: 400 });
  }

  const classPriceIls =
    typeof body.class_price_ils === "number"
      ? body.class_price_ils
      : Number.parseFloat(String(body.class_price_ils ?? ""));
  const studentPriceIls =
    typeof body.student_price_ils === "number"
      ? body.student_price_ils
      : Number.parseFloat(String(body.student_price_ils ?? ""));

  if (
    !Number.isFinite(classPriceIls) ||
    classPriceIls < 0 ||
    !Number.isFinite(studentPriceIls) ||
    studentPriceIls < 0
  ) {
    return NextResponse.json({ error: "INVALID_PRICES" }, { status: 400 });
  }

  const classPriceAg = Math.round(classPriceIls * 100);
  const studentPriceAg = Math.round(studentPriceIls * 100);

  const ok = await updateBillingUnitPrices(
    institutionType,
    classPriceAg,
    studentPriceAg
  );
  if (!ok) {
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }

  const prices = await loadAllBillingUnitPrices();
  return NextResponse.json({ ok: true, prices });
}
