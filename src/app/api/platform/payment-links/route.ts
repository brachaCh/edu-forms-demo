import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  deleteSumitPlanPaymentLink,
  isValidSumitPaymentPageUrl,
  listSumitPlanPaymentLinks,
  upsertSumitPlanPaymentLink,
} from "@/lib/sumit/payment-links";

export async function GET() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const links = await listSumitPlanPaymentLinks();
  return NextResponse.json({ links });
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

  const sumitItemId =
    typeof body.sumit_item_id === "string" ? body.sumit_item_id.trim() : "";
  const paymentPageUrl =
    typeof body.payment_page_url === "string" ? body.payment_page_url.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : null;

  if (!sumitItemId) {
    return NextResponse.json({ error: "INVALID_ITEM_ID" }, { status: 400 });
  }

  // כתובת ריקה -> מחיקת המיפוי
  if (!paymentPageUrl) {
    const ok = await deleteSumitPlanPaymentLink(sumitItemId);
    if (!ok) {
      return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
    }
    const links = await listSumitPlanPaymentLinks();
    return NextResponse.json({ ok: true, links });
  }

  if (!isValidSumitPaymentPageUrl(paymentPageUrl)) {
    return NextResponse.json({ error: "INVALID_URL" }, { status: 400 });
  }

  const ok = await upsertSumitPlanPaymentLink({
    sumitItemId,
    paymentPageUrl,
    label,
  });
  if (!ok) {
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }

  const links = await listSumitPlanPaymentLinks();
  return NextResponse.json({ ok: true, links });
}
