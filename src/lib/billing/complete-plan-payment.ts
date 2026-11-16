import { createServiceClient } from "@/lib/supabase/admin";
import { computeNextExpiry } from "@/lib/billing/subscription-lifecycle";
import { isCustomPlanId } from "@/lib/billing/custom-plan";
import { schedulePurchaseOwnerNotification } from "@/lib/billing/purchase-notification";
import { getBillingPlanById } from "@/lib/sumit/plan-catalog";
import {
  fetchSumitPayment,
  isSumitApiConfigured,
  type SumitPaymentRecord,
} from "@/lib/sumit/client";

export interface CompletePlanPaymentInput {
  planPaymentId: string;
  institutionId: string;
  planId: string;
  sumitTransactionId: string;
  sumitCustomerId?: string | null;
  rawPayload?: Record<string, unknown> | null;
  /** הסכום ששולם בפועל (באגורות) — נשמר כשהוחל קופון בדף המתארח. */
  actualAmountAgorot?: number | null;
}

export interface CompletePlanPaymentResult {
  ok: boolean;
  reason?: "NOT_FOUND" | "ALREADY_COMPLETED" | "AMOUNT_MISMATCH" | "VERIFY_FAILED";
}

export async function expectedPlanAmountIls(
  planId: string,
  amountAgFromPayment?: number | null
): Promise<number | null> {
  if (isCustomPlanId(planId)) {
    if (amountAgFromPayment == null) return null;
    return amountAgFromPayment / 100;
  }
  const plan = await getBillingPlanById(planId);
  if (!plan) return null;
  return plan.priceAg / 100;
}

export async function paymentAmountMatchesPlan(
  planId: string,
  amountIls: number | null,
  amountAgFromPayment?: number | null,
  allowDiscount = false
): Promise<boolean> {
  if (amountIls === null) return true;
  const expected = await expectedPlanAmountIls(planId, amountAgFromPayment);
  if (expected === null) return false;
  if (allowDiscount) {
    // קופון הוחל בדף התשלום המתארח של SUMIT — מקבלים כל סכום חיובי עד המחיר המלא.
    return amountIls > 0 && amountIls <= expected + 0.01;
  }
  return Math.abs(amountIls - expected) < 0.01;
}

export async function verifySumitTransaction(
  transactionId: string,
  planId: string,
  amountAgFromPayment?: number | null,
  allowDiscount = false
): Promise<{ ok: true; payment: SumitPaymentRecord } | { ok: false }> {
  if (!isSumitApiConfigured()) {
    return { ok: false };
  }

  try {
    const payment = await fetchSumitPayment(transactionId);
    if (!payment?.validPayment) return { ok: false };
    if (
      !(await paymentAmountMatchesPlan(
        planId,
        payment.amountIls,
        amountAgFromPayment,
        allowDiscount
      ))
    ) {
      return { ok: false };
    }
    return { ok: true, payment };
  } catch (error) {
    console.error("[billing] verifySumitTransaction:", error);
    return { ok: false };
  }
}

function scheduleCardPurchaseNotification(args: {
  paymentId: string;
  institutionId: string;
  planId: string;
  paidAmountAgorot: number;
  listPriceAgorot: number;
  allowDiscount: boolean;
  paidAt: Date;
}): void {
  try {
    const couponApplied =
      args.allowDiscount && args.paidAmountAgorot < args.listPriceAgorot;
    schedulePurchaseOwnerNotification({
      institutionId: args.institutionId,
      planId: args.planId,
      paymentMethod: "credit_card",
      amountAgorot: args.paidAmountAgorot,
      listPriceAgorot: args.listPriceAgorot,
      couponApplied,
      idempotencyKey: `plan-payment:${args.paymentId}`,
      paidAt: args.paidAt,
    });
  } catch (error) {
    console.error("[billing] purchase notification failed:", error);
  }
}

export async function completePlanPayment(
  input: CompletePlanPaymentInput
): Promise<CompletePlanPaymentResult> {
  const supabase = createServiceClient();

  const { data: existing, error: loadError } = await supabase
    .from("plan_payments")
    .select("id, institution_id, plan_id, status, amount_agorot, allow_discount")
    .eq("id", input.planPaymentId)
    .maybeSingle();

  if (loadError || !existing) return { ok: false, reason: "NOT_FOUND" };
  if (existing.institution_id !== input.institutionId) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (existing.plan_id !== input.planId) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const listPriceAgorot = Number(existing.amount_agorot) || 0;
  const allowDiscount = Boolean(
    (existing as { allow_discount?: boolean }).allow_discount
  );
  const discountedPaidAgorot =
    typeof input.actualAmountAgorot === "number" &&
    Number.isFinite(input.actualAmountAgorot) &&
    input.actualAmountAgorot > 0
      ? Math.round(input.actualAmountAgorot)
      : null;
  const paidAmountAgorot = discountedPaidAgorot ?? listPriceAgorot;

  if (existing.status === "completed") {
    return { ok: true, reason: "ALREADY_COMPLETED" };
  }

  if (!isCustomPlanId(input.planId)) {
    const plan = await getBillingPlanById(input.planId);
    if (!plan) return { ok: false, reason: "NOT_FOUND" };
  }

  const { data: institutionRow } = await supabase
    .from("institutions")
    .select("plan_expires_at")
    .eq("id", input.institutionId)
    .maybeSingle();

  const now = new Date();
  // Card / coupon success: school-year expiry (TZ-68), not +1 calendar year.
  const expiresAt = computeNextExpiry(
    (institutionRow?.plan_expires_at as string | null) ?? null,
    now
  );

  const paymentUpdate: Record<string, unknown> = {
    status: "completed",
    sumit_transaction_id: input.sumitTransactionId,
    raw_webhook: input.rawPayload ?? null,
  };
  // כשהוחל קופון — שומרים את הסכום ששולם בפועל לרישום מדויק.
  if (
    typeof input.actualAmountAgorot === "number" &&
    Number.isFinite(input.actualAmountAgorot) &&
    input.actualAmountAgorot > 0
  ) {
    paymentUpdate.amount_agorot = Math.round(input.actualAmountAgorot);
  }

  const { data: updatedPayments, error: paymentUpdateError } = await supabase
    .from("plan_payments")
    .update(paymentUpdate)
    .eq("id", input.planPaymentId)
    .eq("status", "pending")
    .select("id");

  if (paymentUpdateError) {
    console.error("[billing] completePlanPayment plan_payments:", paymentUpdateError);
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (!updatedPayments || updatedPayments.length === 0) {
    return { ok: true, reason: "ALREADY_COMPLETED" };
  }

  const institutionUpdate: Record<string, unknown> = {
    plan_id: input.planId,
    subscription_status: "active",
    paid_at: now.toISOString(),
    plan_expires_at: expiresAt.toISOString(),
    payment_method: "credit_card",
    renewal_reminder_for_expires_at: null,
    sumit_transaction_id: input.sumitTransactionId,
  };
  if (input.sumitCustomerId) {
    institutionUpdate.sumit_customer_id = input.sumitCustomerId;
  }

  const { error: institutionError } = await supabase
    .from("institutions")
    .update(institutionUpdate)
    .eq("id", input.institutionId);

  if (institutionError) {
    console.error("[billing] completePlanPayment institutions:", institutionError);
    return { ok: false, reason: "NOT_FOUND" };
  }

  scheduleCardPurchaseNotification({
    paymentId: existing.id,
    institutionId: input.institutionId,
    planId: input.planId,
    paidAmountAgorot,
    listPriceAgorot,
    allowDiscount,
    paidAt: now,
  });

  return { ok: true };
}

export async function failPlanPayment(
  planPaymentId: string,
  rawPayload?: Record<string, unknown> | null
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("plan_payments")
    .update({
      status: "failed",
      raw_webhook: rawPayload ?? null,
    })
    .eq("id", planPaymentId)
    .eq("status", "pending");
}
