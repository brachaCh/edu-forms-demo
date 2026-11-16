import { createServiceClient } from "@/lib/supabase/admin";
import type { BillingPlan } from "@/lib/sumit/plan-catalog";
import type { PurchasePlanLimits } from "@/lib/purchase-plans";
import type { Category } from "@/lib/supabase/types";

export const CUSTOM_PLAN_ID = "plan-custom";
export const CUSTOM_PLAN_TITLE = "חבילה אישית";

export const DEFAULT_CLASS_PRICE_AG = 100_000;
export const DEFAULT_STUDENT_PRICE_AG = 4_500;

export const MAX_CUSTOM_CLASSES = 500;
export const MAX_CUSTOM_STUDENTS = 10_000;

export type BillingInstitutionType = Exclude<Category, "tutorials">;

export interface BillingUnitPrices {
  classPriceAg: number;
  studentPriceAg: number;
}

export interface CustomPlanSelection {
  classes: number;
  students: number;
}

export function isCustomPlanId(planId: string | null | undefined): boolean {
  return planId === CUSTOM_PLAN_ID;
}

/** תווית מכסת כיתות/גני חנ״מ בחבילה אישית */
export function classFolderLabel(institutionType: BillingInstitutionType | null): string {
  return institutionType === "kindergartens" ? "גני חנ״מ" : "כיתות ח״מ";
}

/** תווית מכסת תיקי שילוב / סל אישי */
export function portfolioQuotaLabel(): string {
  return "תיקי שילוב / סל אישי";
}

export function calculateCustomPlanPriceAg(
  selection: CustomPlanSelection,
  prices: BillingUnitPrices,
  specialPriceAgorot?: number | null
): number {
  if (typeof specialPriceAgorot === "number" && specialPriceAgorot >= 0) {
    return specialPriceAgorot;
  }
  return selection.classes * prices.classPriceAg + selection.students * prices.studentPriceAg;
}

export function buildCustomPlanFeatures(
  selection: CustomPlanSelection,
  institutionType: BillingInstitutionType | null
): string[] {
  const folderLabel = classFolderLabel(institutionType);
  const features: string[] = [];
  if (selection.students > 0) {
    features.push(`${selection.students} ${portfolioQuotaLabel()}`);
  }
  if (selection.classes > 0) {
    features.push(`${selection.classes} ${folderLabel}`);
  }
  return features;
}

export function parseCustomPlanSelection(input: {
  classes?: unknown;
  students?: unknown;
}): CustomPlanSelection | null {
  const classes =
    typeof input.classes === "number"
      ? input.classes
      : typeof input.classes === "string"
        ? Number.parseInt(input.classes, 10)
        : NaN;
  const students =
    typeof input.students === "number"
      ? input.students
      : typeof input.students === "string"
        ? Number.parseInt(input.students, 10)
        : NaN;

  if (!Number.isInteger(classes) || classes < 0 || classes > MAX_CUSTOM_CLASSES) {
    return null;
  }
  if (!Number.isInteger(students) || students < 0 || students > MAX_CUSTOM_STUDENTS) {
    return null;
  }
  if (classes === 0 && students === 0) {
    return null;
  }

  return { classes, students };
}

/** מגבלות אכיפה לחבילה אישית. */
export function resolveCustomPlanLimits(
  selection: CustomPlanSelection,
  educationFramework: "regular" | "special" | null = "regular"
): PurchasePlanLimits {
  const limits: PurchasePlanLimits = {};
  if (selection.classes > 0) {
    limits.classes = selection.classes;
    // כיתות חנ"מ — מכסת תלמידים = כיתות × 17 (מסונכרן עם plan-limits)
    limits.students = selection.classes * 17;
  }
  // בחינוך רגיל — מכסת תיקי שילוב/סל אישי נפרדת
  if (educationFramework !== "special" && selection.students > 0) {
    limits.integrationPortfolios = selection.students;
    limits.personalBaskets = true;
  }
  return limits;
}

export function buildCustomBillingPlan(input: {
  institutionType: BillingInstitutionType | null;
  educationFramework: "regular" | "special" | null;
  selection: CustomPlanSelection;
  prices: BillingUnitPrices;
  specialPriceAgorot?: number | null;
}): BillingPlan {
  const category: BillingPlan["category"] =
    input.educationFramework === "special" ? "special" : "regular";

  return {
    id: CUSTOM_PLAN_ID,
    number: 0,
    category,
    title: CUSTOM_PLAN_TITLE,
    features: buildCustomPlanFeatures(input.selection, input.institutionType),
    priceAg: calculateCustomPlanPriceAg(
      input.selection,
      input.prices,
      input.specialPriceAgorot
    ),
    limits: resolveCustomPlanLimits(
      input.selection,
      input.educationFramework ?? "regular"
    ),
    sumitItemId: null,
    sumitSku: null,
    source: "fallback",
    isCustom: true,
  };
}

export async function loadBillingUnitPrices(
  institutionType: BillingInstitutionType | null
): Promise<BillingUnitPrices> {
  const type = institutionType ?? "schools";

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("billing_unit_prices")
      .select("class_price_agorot, student_price_agorot")
      .eq("institution_type", type)
      .maybeSingle();

    if (error || !data) {
      return {
        classPriceAg: DEFAULT_CLASS_PRICE_AG,
        studentPriceAg: DEFAULT_STUDENT_PRICE_AG,
      };
    }

    return {
      classPriceAg: (data.class_price_agorot as number) ?? DEFAULT_CLASS_PRICE_AG,
      studentPriceAg: (data.student_price_agorot as number) ?? DEFAULT_STUDENT_PRICE_AG,
    };
  } catch {
    return {
      classPriceAg: DEFAULT_CLASS_PRICE_AG,
      studentPriceAg: DEFAULT_STUDENT_PRICE_AG,
    };
  }
}

export async function loadAllBillingUnitPrices(): Promise<
  Record<BillingInstitutionType, BillingUnitPrices & { institutionType: BillingInstitutionType }>
> {
  const result: Record<
    BillingInstitutionType,
    BillingUnitPrices & { institutionType: BillingInstitutionType }
  > = {
    kindergartens: {
      institutionType: "kindergartens",
      classPriceAg: DEFAULT_CLASS_PRICE_AG,
      studentPriceAg: DEFAULT_STUDENT_PRICE_AG,
    },
    schools: {
      institutionType: "schools",
      classPriceAg: DEFAULT_CLASS_PRICE_AG,
      studentPriceAg: DEFAULT_STUDENT_PRICE_AG,
    },
    "high-schools": {
      institutionType: "high-schools",
      classPriceAg: DEFAULT_CLASS_PRICE_AG,
      studentPriceAg: DEFAULT_STUDENT_PRICE_AG,
    },
  };

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("billing_unit_prices")
      .select("institution_type, class_price_agorot, student_price_agorot");

    if (error || !data) return result;

    for (const row of data) {
      const type = row.institution_type as BillingInstitutionType;
      if (type !== "kindergartens" && type !== "schools" && type !== "high-schools") {
        continue;
      }
      result[type] = {
        institutionType: type,
        classPriceAg: (row.class_price_agorot as number) ?? DEFAULT_CLASS_PRICE_AG,
        studentPriceAg: (row.student_price_agorot as number) ?? DEFAULT_STUDENT_PRICE_AG,
      };
    }
    return result;
  } catch {
    return result;
  }
}

export async function updateBillingUnitPrices(
  institutionType: BillingInstitutionType,
  classPriceAg: number,
  studentPriceAg: number
): Promise<boolean> {
  if (
    !Number.isInteger(classPriceAg) ||
    classPriceAg < 0 ||
    !Number.isInteger(studentPriceAg) ||
    studentPriceAg < 0
  ) {
    return false;
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("billing_unit_prices").upsert({
    institution_type: institutionType,
    class_price_agorot: classPriceAg,
    student_price_agorot: studentPriceAg,
    updated_at: new Date().toISOString(),
  });

  return !error;
}

export function customPlanTitleWithSelection(
  selection: CustomPlanSelection | null | undefined
): string {
  if (!selection) return CUSTOM_PLAN_TITLE;
  const parts: string[] = [CUSTOM_PLAN_TITLE];
  if (selection.students > 0) {
    parts.push(`${selection.students} תיקי שילוב/סל`);
  }
  if (selection.classes > 0) parts.push(`${selection.classes} כיתות ח״מ`);
  return parts.join(" — ");
}
