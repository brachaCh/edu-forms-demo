import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  isCustomPlanId,
  parseCustomPlanSelection,
} from "@/lib/billing/custom-plan";
import {
  bankPurchaseIdempotencyKey,
  schedulePurchaseOwnerNotification,
} from "@/lib/billing/purchase-notification";
import {
  computeExtendedExpiry,
  computeNextExpiry,
  effectiveSubscriptionStatus,
} from "@/lib/billing/subscription-lifecycle";
import { isBillingPlanAllowedForInstitution } from "@/lib/sumit/plan-catalog";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import type { SubscriptionStatus } from "@/lib/supabase/types";
import {
  parseJsonBody,
  platformSubscriptionPatchSchema,
} from "@/lib/validation";

function updateFailed(context: string, error: unknown) {
  console.error(`[platform/subscriptions PATCH] ${context}`, error);
  return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ institutionId: string }> }
) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { institutionId } = await context.params;
  if (!institutionId?.trim()) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const parsed = await parseJsonBody(request, platformSubscriptionPatchSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  }
  const action = parsed.data.action;

  const supabase = createServiceClient();

  try {
    const { data: institution, error: loadError } = await supabase
      .from("institutions")
      .select(
        "id, plan_id, institution_type, education_framework, plan_expires_at, subscription_status"
      )
      .eq("id", institutionId)
      .maybeSingle();

    if (loadError || !institution) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const now = new Date();

    if (action === "cancel") {
      const { error } = await supabase
        .from("institutions")
        .update({ subscription_status: "cancelled" })
        .eq("id", institutionId);
      if (error) return updateFailed("cancel", error);
      return NextResponse.json({ ok: true });
    }

    // Allowed for every status, including "none": leftover plan/payment fields
    // still need to be cleared so the admin row visibly updates.
    if (action === "remove") {
      const { data: removedRows, error } = await supabase
        .from("institutions")
        .update({
          plan_id: null,
          plan_selected_at: null,
          plan_custom_classes: null,
          plan_custom_students: null,
          subscription_status: "none",
          payment_method: null,
          paid_at: null,
          plan_expires_at: null,
          renewal_reminder_for_expires_at: null,
        })
        .eq("id", institutionId)
        .select("id");
      if (error) return updateFailed("remove", error);
      if (!removedRows?.length) {
        return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, subscriptionStatus: "none" });
    }

    if (action === "extend_expiry") {
      const days = parsed.data.days ?? 30;
      const newExpiry = computeExtendedExpiry(
        (institution.plan_expires_at as string | null) ?? null,
        days,
        now
      );

      const { error } = await supabase
        .from("institutions")
        .update({
          plan_expires_at: newExpiry.toISOString(),
          renewal_reminder_for_expires_at: null,
        })
        .eq("id", institutionId);

      if (error) return updateFailed("extend_expiry", error);
      return NextResponse.json({
        ok: true,
        planExpiresAt: newExpiry.toISOString(),
      });
    }

    const planId = parsed.data.plan_id?.trim() || institution.plan_id;

    if (!planId) {
      return NextResponse.json({ error: "PLAN_REQUIRED" }, { status: 400 });
    }

    if (
      !(await isBillingPlanAllowedForInstitution(
        planId,
        institution.institution_type ?? null,
        institution.education_framework ?? null
      ))
    ) {
      return NextResponse.json({ error: "PLAN_NOT_ALLOWED" }, { status: 400 });
    }

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

    if (action === "update_plan") {
      const updatePayload: Record<string, unknown> = {
        plan_id: planId,
        plan_selected_at: now.toISOString(),
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
        .eq("id", institutionId);
      if (error) return updateFailed("update_plan", error);
      return NextResponse.json({ ok: true });
    }

    if (action === "activate_bank") {
      // Bank-transfer approval / admin grant: school-year expiry (TZ-68).
      const previousExpiresAt =
        typeof institution.plan_expires_at === "string" &&
        institution.plan_expires_at.trim()
          ? institution.plan_expires_at
          : null;
      const wasEffectivelyActive =
        effectiveSubscriptionStatus(
          (institution.subscription_status as SubscriptionStatus | null) ?? null,
          previousExpiresAt,
          now
        ) === "active";
      const expiresAt = computeNextExpiry(previousExpiresAt, now);
      const newExpiresAt = expiresAt.toISOString();

      const updatePayload: Record<string, unknown> = {
        plan_id: planId,
        plan_selected_at: now.toISOString(),
        subscription_status: "active",
        payment_method: "bank_transfer",
        paid_at: now.toISOString(),
        plan_expires_at: newExpiresAt,
        renewal_reminder_for_expires_at: null,
      };
      if (isCustomPlanId(planId)) {
        updatePayload.plan_custom_classes = customClasses;
        updatePayload.plan_custom_students = customStudents;
      } else {
        updatePayload.plan_custom_classes = null;
        updatePayload.plan_custom_students = null;
      }

      const updateQuery = supabase
        .from("institutions")
        .update(updatePayload)
        .eq("id", institutionId);
      const expiryMatchedQuery =
        previousExpiresAt == null
          ? updateQuery.is("plan_expires_at", null)
          : updateQuery.eq("plan_expires_at", previousExpiresAt);

      const { data: activatedRows, error } = await expiryMatchedQuery.select("id");

      if (error) return updateFailed("activate_bank", error);

      const rowChanged = Boolean(activatedRows && activatedRows.length > 0);

      if (rowChanged && !wasEffectivelyActive) {
        try {
          schedulePurchaseOwnerNotification({
            institutionId,
            planId,
            paymentMethod: "bank_transfer",
            amountAgorot: null,
            listPriceAgorot: null,
            couponApplied: false,
            idempotencyKey: bankPurchaseIdempotencyKey(
              institutionId,
              newExpiresAt
            ),
            paidAt: now,
          });
        } catch (notifyError) {
          console.error("[billing] purchase notification failed:", notifyError);
        }
      }

      return NextResponse.json({ ok: true, planExpiresAt: newExpiresAt });
    }

    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return updateFailed("unexpected", error);
  }
}
