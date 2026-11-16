/**
 * גיבוי לקריאה ידנית — cron ראשי רץ ב-Supabase Edge Function `subscription-reminders`.
 * @see supabase/functions/subscription-reminders/index.ts
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  buildRenewalReminderEmail,
  isPlanExpired,
  shouldSendRenewalReminder,
} from "@/lib/billing/subscription-lifecycle";
import { formatPlanPrice } from "@/lib/purchase-plans";
import { getBillingPlanById } from "@/lib/sumit/plan-catalog";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

async function sendReminderEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[cron/subscription-reminders] missing RESEND_API_KEY");
    return false;
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "פרוטוקל <onboarding@resend.dev>";

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[cron/subscription-reminders] resend failed:", detail);
    return false;
  }

  return true;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  const { data: institutions, error } = await supabase
    .from("institutions")
    .select(
      "id, name, plan_id, subscription_status, payment_method, plan_expires_at, renewal_reminder_for_expires_at"
    )
    .in("subscription_status", ["active", "expired"]);

  if (error) {
    console.error("[cron/subscription-reminders]", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }

  let expiredCount = 0;
  let remindersSent = 0;
  let remindersFailed = 0;

  for (const row of institutions ?? []) {
    const institutionId = row.id as string;
    const planExpiresAt = (row.plan_expires_at as string | null) ?? null;
    const subscriptionStatus = row.subscription_status as string;

    if (
      subscriptionStatus === "active" &&
      isPlanExpired(planExpiresAt, now)
    ) {
      await supabase
        .from("institutions")
        .update({ subscription_status: "expired" })
        .eq("id", institutionId);
      expiredCount += 1;
      continue;
    }

    if (
      !shouldSendRenewalReminder(
        row.subscription_status as "active",
        planExpiresAt,
        (row.renewal_reminder_for_expires_at as string | null) ?? null,
        now
      )
    ) {
      continue;
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name, email")
      .eq("institution_id", institutionId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!profile?.email) continue;

    const planId = (row.plan_id as string | null) ?? "";
    const plan = planId ? await getBillingPlanById(planId) : null;
    const planPriceFormatted =
      plan?.priceAg != null ? formatPlanPrice(plan.priceAg) : null;

    const emailCopy = buildRenewalReminderEmail({
      fullName: (profile.full_name as string) ?? "",
      institutionName: (row.name as string) ?? "המוסד",
      planPriceFormatted,
      expiresAt: planExpiresAt!,
      paymentMethod:
        (row.payment_method as "credit_card" | "bank_transfer" | null) ?? null,
    });

    const sent = await sendReminderEmail({
      to: profile.email as string,
      subject: emailCopy.subject,
      text: emailCopy.text,
      html: emailCopy.html,
    });

    if (sent) {
      await supabase
        .from("institutions")
        .update({ renewal_reminder_for_expires_at: planExpiresAt })
        .eq("id", institutionId);
      remindersSent += 1;
    } else {
      remindersFailed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    expiredCount,
    remindersSent,
    remindersFailed,
  });
}
