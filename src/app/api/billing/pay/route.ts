import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sumitReturnUrl, sumitWebhookUrl, appOrigin } from "@/lib/app-origin";
import { loadBillingProfileForActiveInstitution } from "@/lib/billing/load-profile";
import { REGISTER_PLAN_PATH } from "@/lib/billing-access";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { requireTenantSession } from "@/lib/server-auth";
import { startSumitBeginRedirect } from "@/lib/sumit/begin-redirect";
import {
  createPendingPaymentToken,
  PENDING_PAYMENT_COOKIE,
  pendingPaymentCookieOptions,
} from "@/lib/sumit/pending-payment-cookie";
import {
  isBillingPlanAllowedForInstitution,
  isSumitBillingConfigured,
  resolveBillingPlanForInstitution,
} from "@/lib/sumit/plan-catalog";
import { buildSumitCatalogCheckoutUrl } from "@/lib/sumit/catalog-urls";

export async function POST(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  if (!isSumitBillingConfigured()) {
    return NextResponse.json({ error: "PAYMENT_NOT_CONFIGURED" }, { status: 503 });
  }

  // TZ-17: Use active institution from session, not original profile.institution_id
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId, institutionId } = auth.session;
  const profile = await loadBillingProfileForActiveInstitution(userId, institutionId);
  if (!profile?.institution_id || !profile.plan_id) {
    return NextResponse.json({ error: "PLAN_REQUIRED" }, { status: 400 });
  }

  if (
    !(await isBillingPlanAllowedForInstitution(
      profile.plan_id,
      profile.institution_type ?? null,
      profile.education_framework ?? null
    ))
  ) {
    return NextResponse.json({ error: "PLAN_NOT_ALLOWED" }, { status: 400 });
  }

  const plan = await resolveBillingPlanForInstitution({
    planId: profile.plan_id,
    institutionType: profile.institution_type ?? null,
    educationFramework: profile.education_framework ?? null,
    customClasses: profile.plan_custom_classes ?? null,
    customStudents: profile.plan_custom_students ?? null,
    specialPriceAgorot: profile.special_price_agorot ?? null,
  });
  if (!plan) {
    return NextResponse.json({ error: "INVALID_PLAN" }, { status: 400 });
  }

  if (!plan.isCustom && (!plan.sumitItemId || plan.priceAg <= 0)) {
    return NextResponse.json({ error: "PLAN_NOT_IN_CATALOG" }, { status: 409 });
  }

  const origin = appOrigin(request);
  const cancelUrl = `${origin}${REGISTER_PLAN_PATH}?payment=cancelled`;

  // חבילה רגילה שממופה לדף תשלום מתארח של SUMIT — שם יש שדה קופון.
  // התשלום עשוי להיות מוזל, לכן מסמנים allow_discount לאימות הסכום.
  const hostedPaymentUrl =
    !plan.isCustom && plan.paymentPageUrl ? plan.paymentPageUrl : null;

  try {
    const supabase = createServiceClient();
    const { data: paymentRow, error: insertError } = await supabase
      .from("plan_payments")
      .insert({
        institution_id: profile.institution_id,
        plan_id: profile.plan_id,
        amount_agorot: plan.priceAg,
        currency: "ILS",
        status: "pending",
        allow_discount: hostedPaymentUrl != null,
      })
      .select("id")
      .single();

    if (insertError || !paymentRow) throw insertError;

    let paymentUrl: string;
    if (hostedPaymentUrl) {
      // הפניה לדף התשלום המתארח (עם קוד קופון). הזרמת מייל מראש לנוחות ולהתאמת ה-webhook.
      paymentUrl = buildSumitCatalogCheckoutUrl(hostedPaymentUrl, profile.email);
    } else {
      try {
        paymentUrl = await startSumitBeginRedirect({
          profile,
          plan,
          returnUrl: sumitReturnUrl(request),
          cancelUrl,
          ipnUrl: sumitWebhookUrl(request),
        });
      } catch (beginRedirectError) {
        console.error("[billing/pay] beginredirect failed:", beginRedirectError);
        return NextResponse.json({ error: "PAYMENT_START_FAILED" }, { status: 502 });
      }
    }

    const pendingToken = await createPendingPaymentToken(
      paymentRow.id,
      profile.institution_id,
      profile.plan_id,
      userId
    );

    const cookieStore = await cookies();
    cookieStore.set(PENDING_PAYMENT_COOKIE, pendingToken, pendingPaymentCookieOptions());

    if (profile.subscription_status !== "active") {
      await supabase
        .from("institutions")
        .update({ subscription_status: "pending_payment" })
        .eq("id", profile.institution_id);
    }

    return NextResponse.json({ paymentUrl });
  } catch (error) {
    console.error("[billing/pay]", error);
    return NextResponse.json({ error: "PAYMENT_START_FAILED" }, { status: 500 });
  }
}

