import { CUSTOM_PLAN_ID, isCustomPlanId } from "@/lib/billing/custom-plan";
import type { Institution, UserProfile } from "@/lib/supabase/types";
import { PLAN_METADATA } from "@/lib/plan-metadata";

/** קטלוג SUMIT: חינוך רגיל או חנ"מ (לא תלוי בגנים/בתי ספר). */
export type PlanCategory = "regular" | "special";

export type PurchasePlanId =
  | "plan-1"
  | "plan-2"
  | "plan-3"
  | "plan-4"
  | "plan-5"
  | "plan-6"
  | "plan-7"
  | "plan-8"
  | "plan-9"
  | "plan-10"
  | "plan-11"
  | "plan-12"
  | typeof CUSTOM_PLAN_ID;

export interface PurchasePlanLimits {
  integrationPortfolios?: number;
  personalBaskets?: boolean;
  classes?: number;
  students?: number;
}

export interface PurchasePlan {
  id: string;
  number: number;
  category: PlanCategory;
  title: string;
  features: string[];
  priceAg: number;
  limits: PurchasePlanLimits;
  isCustom?: boolean;
}

export function formatPlanSummary(plan: PurchasePlan): string {
  return plan.features.join(" · ");
}

/** קטלוג סטטי — גיבוי כש-SUMIT לא זמין; מקור מטא: plan-metadata.ts */
export const PURCHASE_PLANS: PurchasePlan[] = PLAN_METADATA;

const PLAN_BY_ID = new Map(PURCHASE_PLANS.map((plan) => [plan.id, plan]));

type InstitutionContext = Pick<
  Institution | UserProfile,
  "institution_type" | "education_framework"
>;

export function formatPlanPrice(priceAg: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(priceAg / 100);
}

export function isPurchasePlanId(value: string): value is PurchasePlanId {
  return isCustomPlanId(value) || PLAN_BY_ID.has(value as PurchasePlanId);
}

/** גיבוי סטטי — בשרת העדפו getBillingPlanById מ-plan-catalog. */
export function getPlanById(id: string): PurchasePlan | null {
  return PLAN_BY_ID.get(id as PurchasePlanId) ?? null;
}

/** גיבוי סטטי — בשרת העדפו getBillingPlansForInstitution מ-plan-catalog. */
export function getPlansForInstitution(
  _institutionType: InstitutionContext["institution_type"],
  educationFramework: InstitutionContext["education_framework"]
): PurchasePlan[] {
  if (educationFramework === "regular") {
    return PURCHASE_PLANS.filter((plan) => plan.category === "regular");
  }

  if (educationFramework === "special") {
    return PURCHASE_PLANS.filter((plan) => plan.category === "special");
  }

  return [];
}

/** גיבוי סטטי — בשרת העדפו isBillingPlanAllowedForInstitution מ-plan-catalog. */
export function isPlanAllowedForInstitution(
  planId: string,
  institutionType: InstitutionContext["institution_type"],
  educationFramework: InstitutionContext["education_framework"]
): boolean {
  if (!isPurchasePlanId(planId)) return false;
  return getPlansForInstitution(institutionType, educationFramework).some(
    (plan) => plan.id === planId
  );
}

