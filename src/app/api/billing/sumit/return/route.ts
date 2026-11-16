import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { REGISTER_PLAN_PATH } from "@/lib/billing-access";
import {
  completePlanPayment,
  failPlanPayment,
  verifySumitTransaction,
} from "@/lib/billing/complete-plan-payment";
import {
  authenticatedUserId,
  loadBillingProfile,
} from "@/lib/billing/load-profile";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  PENDING_PAYMENT_COOKIE,
  pendingPaymentCookieOptions,
  verifyPendingPaymentToken,
} from "@/lib/sumit/pending-payment-cookie";
import { extractSumitTransactionIdFromSearch } from "@/lib/sumit/transaction-id";

const SETUP_PATH = "/personal-area/setup";

function redirectTo(request: Request, path: string, query?: Record<string, string>) {
  const url = new URL(path, request.url);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return redirectTo(request, REGISTER_PLAN_PATH, { payment: "unavailable" });
  }

  const transactionId = extractSumitTransactionIdFromSearch(
    new URL(request.url).searchParams
  );

  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(PENDING_PAYMENT_COOKIE)?.value;
  const pending = pendingToken
    ? await verifyPendingPaymentToken(pendingToken)
    : null;

  const userId = await authenticatedUserId();
  if (pending && userId && pending.userId !== userId) {
    return redirectTo(request, REGISTER_PLAN_PATH, { payment: "session_mismatch" });
  }

  if (!pending) {
    return redirectTo(request, REGISTER_PLAN_PATH, { payment: "missing_context" });
  }

  if (!transactionId) {
    await failPlanPayment(pending.paymentId, {
      source: "return",
      query: Object.fromEntries(new URL(request.url).searchParams),
    });
    cookieStore.delete(PENDING_PAYMENT_COOKIE);
    return redirectTo(request, REGISTER_PLAN_PATH, { payment: "missing_transaction" });
  }

  const supabase = createServiceClient();
  const { data: paymentRow } = await supabase
    .from("plan_payments")
    .select("amount_agorot, allow_discount")
    .eq("id", pending.paymentId)
    .maybeSingle();

  const allowDiscount = Boolean(paymentRow?.allow_discount);

  const verification = await verifySumitTransaction(
    transactionId,
    pending.planId,
    paymentRow?.amount_agorot as number | undefined,
    allowDiscount
  );

  if (!verification.ok) {
    await failPlanPayment(pending.paymentId, {
      source: "return",
      transactionId,
      query: Object.fromEntries(new URL(request.url).searchParams),
    });
    cookieStore.delete(PENDING_PAYMENT_COOKIE);
    return redirectTo(request, REGISTER_PLAN_PATH, { payment: "verify_failed" });
  }

  const result = await completePlanPayment({
    planPaymentId: pending.paymentId,
    institutionId: pending.institutionId,
    planId: pending.planId,
    sumitTransactionId: verification.payment.transactionId,
    sumitCustomerId: verification.payment.customerId,
    rawPayload: verification.payment.raw,
    actualAmountAgorot:
      allowDiscount && verification.payment.amountIls != null
        ? Math.round(verification.payment.amountIls * 100)
        : null,
  });

  cookieStore.set(PENDING_PAYMENT_COOKIE, "", {
    ...pendingPaymentCookieOptions(),
    maxAge: 0,
  });

  if (!result.ok && result.reason !== "ALREADY_COMPLETED") {
    return redirectTo(request, REGISTER_PLAN_PATH, { payment: "activation_failed" });
  }

  const profile = userId ? await loadBillingProfile(userId) : null;
  if (profile?.setup_completed_at) {
    return redirectTo(request, "/personal-area");
  }

  return redirectTo(request, SETUP_PATH, { payment: "success" });
}
