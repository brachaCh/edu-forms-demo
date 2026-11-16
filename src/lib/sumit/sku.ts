import type { PlanCategory, PurchasePlanId } from "@/lib/purchase-plans";
import { isPurchasePlanId } from "@/lib/purchase-plans";

export interface ParsedPlanSku {
  planId: PurchasePlanId;
  category: PlanCategory;
}

/** מק"ט ב-SUMIT: `regular:plan-1` או `special:plan-7`. */
export function parsePlanSku(sku: string): ParsedPlanSku | null {
  const normalized = sku.trim();
  const match = normalized.match(/^(regular|special):(plan-\d+)$/i);
  if (!match || !isPurchasePlanId(match[2])) return null;

  return {
    planId: match[2],
    category: match[1].toLowerCase() as PlanCategory,
  };
}
