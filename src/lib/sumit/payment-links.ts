import { createServiceClient } from "@/lib/supabase/admin";
import { isSumitPayCatalogUrl } from "@/lib/sumit/catalog-page";

export interface SumitPlanPaymentLink {
  sumitItemId: string;
  paymentPageUrl: string;
  label: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: Map<string, SumitPlanPaymentLink> | null = null;
let cacheExpiresAt = 0;

/** בדיקת תקינות כתובת דף תשלום מתארח של SUMIT (pay.sumit.co.il, https). */
export function isValidSumitPaymentPageUrl(url: string): boolean {
  return isSumitPayCatalogUrl(url);
}

function rowToLink(row: Record<string, unknown>): SumitPlanPaymentLink | null {
  const sumitItemId =
    typeof row.sumit_item_id === "string" ? row.sumit_item_id.trim() : "";
  const paymentPageUrl =
    typeof row.payment_page_url === "string" ? row.payment_page_url.trim() : "";
  if (!sumitItemId || !paymentPageUrl) return null;
  return {
    sumitItemId,
    paymentPageUrl,
    label: typeof row.label === "string" ? row.label : null,
  };
}

/** מפה של sumitItemId -> קישור דף תשלום, עם cache קצר. */
export async function loadSumitPlanPaymentLinks(): Promise<
  Map<string, SumitPlanPaymentLink>
> {
  const now = Date.now();
  if (cached && cacheExpiresAt > now) return cached;

  const map = new Map<string, SumitPlanPaymentLink>();
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("sumit_plan_payment_links")
      .select("sumit_item_id, payment_page_url, label");
    if (!error && data) {
      for (const row of data) {
        const link = rowToLink(row as Record<string, unknown>);
        if (link) map.set(link.sumitItemId, link);
      }
    }
  } catch (error) {
    console.error("[sumit/payment-links] load failed:", error);
    return cached ?? map;
  }

  cached = map;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return map;
}

/** קישור דף התשלום המתארח לחבילה לפי מזהה הפריט ב-SUMIT. */
export async function getSumitPlanPaymentLink(
  sumitItemId: string | null | undefined
): Promise<string | null> {
  if (!sumitItemId) return null;
  const map = await loadSumitPlanPaymentLinks();
  return map.get(sumitItemId)?.paymentPageUrl ?? null;
}

export function clearSumitPlanPaymentLinksCache(): void {
  cached = null;
  cacheExpiresAt = 0;
}

/** רשימת כל הקישורים לניהול (ניהול פלטפורמה). */
export async function listSumitPlanPaymentLinks(): Promise<
  SumitPlanPaymentLink[]
> {
  const map = await loadSumitPlanPaymentLinks();
  return [...map.values()].sort((a, b) =>
    a.sumitItemId.localeCompare(b.sumitItemId)
  );
}

/** שמירה/עדכון קישור דף תשלום לחבילה. */
export async function upsertSumitPlanPaymentLink(input: {
  sumitItemId: string;
  paymentPageUrl: string;
  label?: string | null;
}): Promise<boolean> {
  const sumitItemId = input.sumitItemId.trim();
  const paymentPageUrl = input.paymentPageUrl.trim();
  if (!sumitItemId || !isValidSumitPaymentPageUrl(paymentPageUrl)) return false;

  const supabase = createServiceClient();
  const { error } = await supabase.from("sumit_plan_payment_links").upsert({
    sumit_item_id: sumitItemId,
    payment_page_url: paymentPageUrl,
    label: input.label?.trim() || null,
    updated_at: new Date().toISOString(),
  });

  clearSumitPlanPaymentLinksCache();
  return !error;
}

/** מחיקת קישור דף תשלום לחבילה. */
export async function deleteSumitPlanPaymentLink(
  sumitItemId: string
): Promise<boolean> {
  const id = sumitItemId.trim();
  if (!id) return false;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("sumit_plan_payment_links")
    .delete()
    .eq("sumit_item_id", id);

  clearSumitPlanPaymentLinksCache();
  return !error;
}
