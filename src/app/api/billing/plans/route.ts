import { NextResponse } from "next/server";
import { loadBillingProfileForActiveInstitution } from "@/lib/billing/load-profile";
import {
  getBillingPlansForInstitution,
  isSumitBillingConfigured,
} from "@/lib/sumit/plan-catalog";
import { loadBillingUnitPrices } from "@/lib/billing/custom-plan";
import { getSumitCatalogUrlForInstitution } from "@/lib/sumit/catalog-urls";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { requireTenantSession } from "@/lib/server-auth";

export async function GET() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  // TZ-17: Use active institution from session, not original profile.institution_id
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId, institutionId } = auth.session;
  const profile = await loadBillingProfileForActiveInstitution(userId, institutionId);
  if (!profile) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const customSelection =
    profile.plan_id === "plan-custom" &&
    (profile.plan_custom_classes != null || profile.plan_custom_students != null)
      ? {
          classes: profile.plan_custom_classes ?? 0,
          students: profile.plan_custom_students ?? 0,
        }
      : { classes: 1, students: 0 };

  const plans = await getBillingPlansForInstitution(
    profile.institution_type ?? null,
    profile.education_framework ?? null,
    customSelection
  );

  const unitPrices = await loadBillingUnitPrices(profile.institution_type ?? null);

  const catalogUrl = getSumitCatalogUrlForInstitution(
    profile.institution_type ?? null,
    profile.education_framework ?? null
  );

  return NextResponse.json({
    plans,
    sumitConfigured: isSumitBillingConfigured(),
    catalogUrl,
    unitPrices,
  });
}
