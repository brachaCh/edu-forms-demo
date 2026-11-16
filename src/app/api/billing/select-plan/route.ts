import { NextResponse } from "next/server";
import { loadBillingProfileForActiveInstitution } from "@/lib/billing/load-profile";
import {
  isCustomPlanId,
  parseCustomPlanSelection,
} from "@/lib/billing/custom-plan";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isBillingPlanAllowedForInstitution } from "@/lib/sumit/plan-catalog";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { requireTenantSession } from "@/lib/server-auth";
import { insertAuditLog } from "@/lib/audit-log";
import { parseJsonBody, selectPlanBodySchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  // TZ-17: Use active institution from session, not original profile.institution_id
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId, institutionId } = auth.session;

  const parsed = await parseJsonBody(request, selectPlanBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_PLAN" }, { status: 400 });
  }
  const planId = parsed.data.plan_id;

  let customClasses: number | null = null;
  let customStudents: number | null = null;
  if (isCustomPlanId(planId)) {
    const selection = parseCustomPlanSelection({
      classes: parsed.data.custom_classes,
      students: parsed.data.custom_students,
    });
    if (!selection) {
      return NextResponse.json({ error: "INVALID_CUSTOM_PLAN" }, { status: 400 });
    }
    customClasses = selection.classes;
    customStudents = selection.students;
  }

  const profile = await loadBillingProfileForActiveInstitution(userId, institutionId);
  if (!profile?.institution_id) {
    return NextResponse.json({ error: "INSTITUTION_REQUIRED" }, { status: 400 });
  }

  if (
    !(await isBillingPlanAllowedForInstitution(
      planId,
      profile.institution_type ?? null,
      profile.education_framework ?? null
    ))
  ) {
    return NextResponse.json({ error: "PLAN_NOT_ALLOWED" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      plan_id: planId,
      plan_selected_at: now,
      subscription_status: "pending_payment",
    };
    if (isCustomPlanId(planId)) {
      updatePayload.plan_custom_classes = customClasses;
      updatePayload.plan_custom_students = customStudents;
    } else {
      updatePayload.plan_custom_classes = null;
      updatePayload.plan_custom_students = null;
    }

    const { error } = await supabase
      .from("institutions")
      .update(updatePayload)
      .eq("id", profile.institution_id);

    if (error) throw error;

    void insertAuditLog({
      institutionId: profile.institution_id,
      actorUserId: userId,
      action: "billing.select_plan",
      entityType: "billing",
      entityId: profile.institution_id,
      summary: `נבחרה חבילה: ${planId}`,
      metadata: {
        plan_id: planId,
        custom_classes: customClasses,
        custom_students: customStudents,
      },
    });

    const updated = await loadBillingProfileForActiveInstitution(userId, institutionId);
    return updated
      ? NextResponse.json({ profile: updated })
      : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    console.error("[billing/select-plan]", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}
