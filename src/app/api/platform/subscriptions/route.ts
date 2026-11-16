import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { customPlanTitleWithSelection, isCustomPlanId } from "@/lib/billing/custom-plan";
import {
  getBillingPlanById,
  loadBillingPlanCatalog,
} from "@/lib/sumit/plan-catalog";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import type {
  PaymentMethod,
  SubscriptionStatus,
} from "@/lib/supabase/types";

export interface PlatformSubscriptionRow {
  institutionId: string;
  institutionName: string;
  schoolName: string | null;
  institutionCode: string;
  institutionType: string | null;
  planId: string | null;
  planTitle: string | null;
  educationFramework: "regular" | "special" | null;
  planCustomClasses: number | null;
  planCustomStudents: number | null;
  subscriptionStatus: SubscriptionStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  planExpiresAt: string | null;
  userId: string | null;
  userFullName: string | null;
  userEmail: string | null;
  userPhone: string | null;
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
      .select(
        "id, code, name, school_name, institution_type, education_framework, plan_id, plan_custom_classes, plan_custom_students, subscription_status, payment_method, paid_at, plan_expires_at"
      )
      .order("name", { ascending: true });

    if (error) throw error;

    const institutionIds = (institutions ?? []).map((row) => row.id as string);
    const usersByInstitution = new Map<
      string,
      { id: string; full_name: string; email: string; phone: string }
    >();

    if (institutionIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, full_name, email, phone, institution_id, created_at")
        .in("institution_id", institutionIds)
        .order("created_at", { ascending: true });

      for (const profile of profiles ?? []) {
        const instId = profile.institution_id as string | null;
        if (!instId || usersByInstitution.has(instId)) continue;
        usersByInstitution.set(instId, {
          id: profile.id as string,
          full_name: profile.full_name as string,
          email: profile.email as string,
          phone: profile.phone as string,
        });
      }
    }

    const rows: PlatformSubscriptionRow[] = [];

    for (const row of institutions ?? []) {
      const planId = (row.plan_id as string | null) ?? null;
      let planTitle: string | null = null;
      if (planId) {
        if (isCustomPlanId(planId)) {
          planTitle = customPlanTitleWithSelection({
            classes: (row.plan_custom_classes as number | null) ?? 0,
            students: (row.plan_custom_students as number | null) ?? 0,
          });
        } else {
          const plan = await getBillingPlanById(planId);
          planTitle = plan?.title ?? planId;
        }
      }

      const user = usersByInstitution.get(row.id as string);

      rows.push({
        institutionId: row.id as string,
        institutionName: (row.name as string) ?? "",
        schoolName: (row.school_name as string | null) ?? null,
        institutionCode: (row.code as string) ?? "",
        institutionType: (row.institution_type as string | null) ?? null,
        planId,
        planTitle,
        educationFramework:
          row.education_framework === "regular" ||
          row.education_framework === "special"
            ? row.education_framework
            : null,
        planCustomClasses: (row.plan_custom_classes as number | null) ?? null,
        planCustomStudents: (row.plan_custom_students as number | null) ?? null,
        subscriptionStatus:
          (row.subscription_status as SubscriptionStatus) ?? "none",
        paymentMethod: (row.payment_method as PaymentMethod | null) ?? null,
        paidAt: (row.paid_at as string | null) ?? null,
        planExpiresAt: (row.plan_expires_at as string | null) ?? null,
        userId: user?.id ?? null,
        userFullName: user?.full_name ?? null,
        userEmail: user?.email ?? null,
        userPhone: user?.phone ?? null,
      });
    }

    const catalog = await loadBillingPlanCatalog();
    return NextResponse.json({
      subscriptions: rows,
      plans: catalog.map((plan) => ({
        id: plan.id,
        title: plan.title,
        priceAg: plan.priceAg,
        category: plan.category,
        sumitCatalogKey: plan.sumitCatalogKey ?? null,
        sumitCatalogLabel: plan.sumitCatalogLabel ?? null,
        sumitCatalogUrl: plan.sumitCatalogUrl ?? null,
      })),
    });
  } catch (error) {
    console.error("[platform/subscriptions GET]", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
