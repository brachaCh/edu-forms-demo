import type { Institution, UserProfile } from "@/lib/supabase/types";
import {
  getStaticPlanMetadata,
  parseFeaturesFromDescription,
} from "@/lib/plan-metadata";
import {
  buildCustomBillingPlan,
  isCustomPlanId,
  loadBillingUnitPrices,
  type CustomPlanSelection,
} from "@/lib/billing/custom-plan";
import { resolvePlanLimits } from "@/lib/plan-limits";
import type {
  PurchasePlan,
  PurchasePlanLimits,
  PlanCategory,
} from "@/lib/purchase-plans";
import { isPurchasePlanId } from "@/lib/purchase-plans";
import { isSumitApiConfigured } from "@/lib/sumit/client";
import { fetchSumitCatalogPageItems } from "@/lib/sumit/catalog-page";
import {
  getSumitRegularEducationCatalogUrl,
  getSumitSpecialEducationCatalogUrl,
  sumitCatalogAdminLabel,
  sumitCatalogKeyFromUrl,
} from "@/lib/sumit/catalog-urls";
import {
  draftFromCatalogItem,
  featuresFromProtocolLimits,
  parseSumitPlanId,
  type ProtocolPackageDraft,
} from "@/lib/sumit/protocol-packages";
import { getSumitPlanPaymentLink } from "@/lib/sumit/payment-links";

export interface BillingPlan extends PurchasePlan {
  sumitItemId: string | null;
  sumitSku: string | null;
  source: "sumit" | "fallback";
  isCustom?: boolean;
  /** כתובת דף תשלום מתארח ב-SUMIT (עם שדה קופון) — לחבילות רגילות שממופות. */
  paymentPageUrl?: string | null;
  /** מקור בקטלוג SUMIT (לניהול מיפוי קופונים). */
  sumitCatalogKey?: string | null;
  sumitCatalogLabel?: string | null;
  sumitCatalogUrl?: string | null;
}

type InstitutionContext = Pick<
  Institution | UserProfile,
  "institution_type" | "education_framework"
>;

const CACHE_TTL_MS = 15 * 60 * 1000;

let cachedPlans: BillingPlan[] | null = null;
let cacheExpiresAt = 0;
let inflight: Promise<BillingPlan[]> | null = null;

function billingPlanFromDraft(
  draft: ProtocolPackageDraft,
  number: number
): BillingPlan {
  const descriptionFeatures = parseFeaturesFromDescription(draft.description);
  return {
    id: draft.id,
    number,
    category: draft.category,
    title: draft.name,
    features:
      descriptionFeatures.length > 0 ? descriptionFeatures : draft.features,
    priceAg: Math.round(draft.priceIls * 100),
    limits: resolvePlanLimits(draft.id) ?? draft.limits,
    sumitItemId: draft.sumitItemId,
    sumitSku: draft.sku || null,
    source: "sumit",
  };
}

function legacyBillingPlan(meta: PurchasePlan): BillingPlan {
  return {
    ...meta,
    limits: resolvePlanLimits(meta.id) ?? meta.limits,
    sumitItemId: null,
    sumitSku: null,
    source: "fallback",
  };
}

async function plansFromCatalogUrl(
  catalogUrl: string | null,
  category: PlanCategory,
  catalogLabel: string
): Promise<BillingPlan[]> {
  if (!catalogUrl) return [];

  const items = await fetchSumitCatalogPageItems(catalogUrl);
  const plans: BillingPlan[] = [];
  const catalogKey = sumitCatalogKeyFromUrl(catalogUrl);

  items.forEach((item, index) => {
    const draft = draftFromCatalogItem({
      id: item.id,
      name: item.name,
      priceIls: item.priceIls,
      category,
    });
    if (!draft) return;
    plans.push({
      ...billingPlanFromDraft(draft, index + 1),
      sumitCatalogKey: catalogKey,
      sumitCatalogLabel: catalogLabel,
      sumitCatalogUrl: catalogUrl,
    });
  });

  return plans;
}

async function buildCatalogFromSumit(): Promise<BillingPlan[]> {
  const regularUrl = getSumitRegularEducationCatalogUrl();
  const specialUrl = getSumitSpecialEducationCatalogUrl();
  const [regular, special] = await Promise.all([
    plansFromCatalogUrl(
      regularUrl,
      "regular",
      sumitCatalogAdminLabel("חינוך רגיל", regularUrl)
    ),
    plansFromCatalogUrl(
      specialUrl,
      "special",
      sumitCatalogAdminLabel("חינוך מיוחד", specialUrl)
    ),
  ]);
  return [...regular, ...special];
}

export async function loadBillingPlanCatalog(): Promise<BillingPlan[]> {
  if (
    !getSumitRegularEducationCatalogUrl() &&
    !getSumitSpecialEducationCatalogUrl()
  ) {
    return [];
  }

  const now = Date.now();
  if (cachedPlans && cacheExpiresAt > now) {
    return cachedPlans;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const plans = await buildCatalogFromSumit();
      cachedPlans = plans;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      return plans;
    } catch (error) {
      console.error("[plan-catalog] SUMIT fetch failed:", error);
      return cachedPlans ?? [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function clearBillingPlanCatalogCache(): void {
  cachedPlans = null;
  cacheExpiresAt = 0;
}

export async function getBillingPlanById(planId: string): Promise<BillingPlan | null> {
  if (isCustomPlanId(planId)) {
    return buildCustomBillingPlan({
      institutionType: "schools",
      educationFramework: "special",
      selection: { classes: 0, students: 0 },
      prices: await loadBillingUnitPrices("schools"),
    });
  }

  const catalog = await loadBillingPlanCatalog();
  const exact = catalog.find((plan) => plan.id === planId);
  if (exact) return exact;

  const parsed = parseSumitPlanId(planId);
  if (parsed) {
    const limits = resolvePlanLimits(planId) ?? parsed.limits;
    const sameItem = catalog.find((plan) => plan.sumitItemId === parsed.itemId);
    if (sameItem) {
      return { ...sameItem, id: planId, limits };
    }
    return {
      id: planId,
      number: 0,
      category: "regular",
      title: "חבילה",
      features: featuresFromProtocolLimits(parsed.limits, "חבילה"),
      priceAg: 0,
      limits,
      sumitItemId: parsed.itemId,
      sumitSku: null,
      source: "sumit",
    };
  }

  if (!isPurchasePlanId(planId)) return null;
  const meta = getStaticPlanMetadata(planId);
  if (!meta) return null;
  return legacyBillingPlan(meta);
}

export async function resolveBillingPlanForInstitution(input: {
  planId: string;
  institutionType: InstitutionContext["institution_type"];
  educationFramework: InstitutionContext["education_framework"];
  customClasses?: number | null;
  customStudents?: number | null;
  specialPriceAgorot?: number | null;
}): Promise<BillingPlan | null> {
  if (isCustomPlanId(input.planId)) {
    const classes = input.customClasses ?? 0;
    const students = input.customStudents ?? 0;
    if (classes === 0 && students === 0) return null;

    const prices = await loadBillingUnitPrices(input.institutionType ?? null);
    return buildCustomBillingPlan({
      institutionType: input.institutionType ?? null,
      educationFramework: input.educationFramework ?? null,
      selection: { classes, students },
      prices,
      specialPriceAgorot: input.specialPriceAgorot,
    });
  }

  const plan = await getBillingPlanById(input.planId);
  return plan ? withPaymentPageUrl(plan) : null;
}

/** מצרף כתובת דף תשלום מתארח לחבילה רגילה שממופה ב-SUMIT. */
async function withPaymentPageUrl(plan: BillingPlan): Promise<BillingPlan> {
  if (plan.isCustom || !plan.sumitItemId) return plan;
  const paymentPageUrl = await getSumitPlanPaymentLink(plan.sumitItemId);
  return paymentPageUrl ? { ...plan, paymentPageUrl } : plan;
}

export async function getBillingPlansForInstitution(
  institutionType: InstitutionContext["institution_type"],
  educationFramework: InstitutionContext["education_framework"],
  customSelection?: CustomPlanSelection | null
): Promise<BillingPlan[]> {
  const catalog = await loadBillingPlanCatalog();
  const prices = await loadBillingUnitPrices(institutionType ?? null);

  let plans: BillingPlan[] = [];
  if (educationFramework === "regular") {
    plans = catalog.filter((plan) => plan.category === "regular");
  } else if (educationFramework === "special") {
    plans = catalog.filter((plan) => plan.category === "special");
  }

  plans = await Promise.all(plans.map((plan) => withPaymentPageUrl(plan)));

  const selection = customSelection ?? { classes: 1, students: 0 };
  plans.push(
    buildCustomBillingPlan({
      institutionType: institutionType ?? null,
      educationFramework: educationFramework ?? null,
      selection,
      prices,
    })
  );

  return plans;
}

export async function isBillingPlanAllowedForInstitution(
  planId: string,
  institutionType: InstitutionContext["institution_type"],
  educationFramework: InstitutionContext["education_framework"]
): Promise<boolean> {
  if (isCustomPlanId(planId)) {
    return educationFramework === "regular" || educationFramework === "special";
  }

  const legacy = getStaticPlanMetadata(planId);
  if (legacy) {
    return (
      (educationFramework === "regular" || educationFramework === "special") &&
      legacy.category === educationFramework
    );
  }

  const plans = await getBillingPlansForInstitution(
    institutionType,
    educationFramework
  );
  return plans.some((plan) => plan.id === planId);
}

export function isSumitBillingConfigured(): boolean {
  return isSumitApiConfigured();
}

export type { PlanCategory, PurchasePlanLimits };
