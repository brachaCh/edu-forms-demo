import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  completePlanPayment,
  verifySumitTransaction,
} from "@/lib/billing/complete-plan-payment";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { extractSumitTransactionId } from "@/lib/sumit/transaction-id";

async function parseWebhookPayload(
  request: Request
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as unknown;
      if (body && typeof body === "object" && !Array.isArray(body)) {
        return body as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    try {
      const form = await request.formData();
      const record: Record<string, unknown> = {};
      form.forEach((value, key) => {
        record[key] = typeof value === "string" ? value : value.name;
      });
      return record;
    } catch {
      return null;
    }
  }

  try {
    const text = await request.text();
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function webhookSecretMatches(request: Request): boolean {
  const configured = process.env.SUMIT_WEBHOOK_SECRET?.trim();
  if (!configured) return true;

  const header =
    request.headers.get("x-sumit-secret")?.trim() ||
    request.headers.get("x-webhook-secret")?.trim();
  return header === configured;
}

function stringParam(
  payload: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  if (!webhookSecretMatches(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const payload = await parseWebhookPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const flatParams: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") flatParams[key] = value;
    else if (typeof value === "number") flatParams[key] = String(value);
  }

  const transactionId =
    extractSumitTransactionId(flatParams) ??
    stringParam(payload, ["PaymentID", "ID", "TransactionID"]);

  if (!transactionId) {
    return NextResponse.json({ received: true, skipped: "no_transaction_id" });
  }

  const supabase = createServiceClient();
  const { data: paymentRow } = await supabase
    .from("plan_payments")
    .select("id, institution_id, plan_id, status, amount_agorot, allow_discount")
    .eq("sumit_transaction_id", transactionId)
    .maybeSingle();

  let targetPayment = paymentRow;

  if (!targetPayment) {
    const email = stringParam(payload, [
      "Email",
      "EmailAddress",
      "CustomerEmail",
      "email",
    ]);

    if (email) {
      const { data: profileRow } = await supabase
        .from("user_profiles")
        .select("institution_id")
        .eq("email", email)
        .maybeSingle();

      if (profileRow?.institution_id) {
        const { data: pendingForInstitution } = await supabase
          .from("plan_payments")
          .select(
            "id, institution_id, plan_id, status, amount_agorot, allow_discount, created_at"
          )
          .eq("institution_id", profileRow.institution_id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        targetPayment = pendingForInstitution ?? null;
      }
    }
  }

  if (!targetPayment) {
    const { data: pendingRows } = await supabase
      .from("plan_payments")
      .select(
        "id, institution_id, plan_id, status, amount_agorot, allow_discount, created_at"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    targetPayment = pendingRows ?? null;
  }

  if (!targetPayment || targetPayment.status === "completed") {
    return NextResponse.json({ received: true, skipped: "no_pending_payment" });
  }

  const allowDiscount = Boolean(
    (targetPayment as { allow_discount?: boolean }).allow_discount
  );

  const verification = await verifySumitTransaction(
    transactionId,
    targetPayment.plan_id,
    targetPayment.amount_agorot as number,
    allowDiscount
  );

  if (!verification.ok) {
    return NextResponse.json({ received: true, skipped: "verify_failed" });
  }

  await completePlanPayment({
    planPaymentId: targetPayment.id,
    institutionId: targetPayment.institution_id,
    planId: targetPayment.plan_id,
    sumitTransactionId: verification.payment.transactionId,
    sumitCustomerId: verification.payment.customerId,
    rawPayload: payload,
    actualAmountAgorot:
      allowDiscount && verification.payment.amountIls != null
        ? Math.round(verification.payment.amountIls * 100)
        : null,
  });

  return NextResponse.json({ received: true, ok: true });
}
