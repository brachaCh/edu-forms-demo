import type { PlanCategory, PurchasePlanLimits } from "@/lib/purchase-plans";
import type { SumitIncomeItem } from "@/lib/sumit/income-items";

/** שם המותג ב-SUMIT נכתב «פרוטוקל» בלי ו׳. */
const PROTOCOL_NAME = "פרוטוקל";

/** תלמידים בתיק כיתה/גן בודד — תואם למכסה בכיתה קטנה. */
const SINGLE_CLASS_STUDENTS = 17;

const SUMIT_PLAN_ID =
  /^sumit:(\d+)(?::i(\d+))?(?::c(\d+))?(?::s(\d+))?(?::b)?$/;

export interface ProtocolPackageDraft {
  id: string;
  sumitItemId: string;
  sku: string;
  name: string;
  description: string;
  priceIls: number;
  category: PlanCategory;
  limits: PurchasePlanLimits;
  features: string[];
}

export function normalizeProtocolName(name: string): string {
  return name
    .replace(/[״""]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** פריט קטלוג של חבילת פרוטוקל, לא ספרים/בדיקות/העברות. */
export function isProtocolPackageName(name: string): boolean {
  const normalized = normalizeProtocolName(name);
  if (!normalized.includes(PROTOCOL_NAME)) return false;
  return /(?:עד\s+\d+|תיק|כית|כתת|כתה|גן)/.test(normalized);
}

/** כל חבילה שמזכירה חנ"מ שייכת לחינוך מיוחד. תיקי שילוב בלי חנ"מ — לחינוך רגיל. */
export function protocolPackageCategory(name: string): PlanCategory {
  const normalized = normalizeProtocolName(name);
  if (normalized.includes('חנ"מ')) return "special";
  return "regular";
}

export function limitsFromProtocolName(name: string): PurchasePlanLimits {
  const normalized = normalizeProtocolName(name);
  const limits: PurchasePlanLimits = {};

  const portfolios = normalized.match(/עד\s+(\d+)\s+תיקים/);
  if (portfolios) {
    limits.integrationPortfolios = Number(portfolios[1]);
    limits.personalBaskets = true;
  }

  const classes = normalized.match(/(\d+)\s*(?:כיתות|כתות)/);
  if (classes) {
    limits.classes = Number(classes[1]);
  } else if (/(?:כיתת|כתת)/.test(normalized)) {
    limits.classes = 1;
  }

  if (
    limits.integrationPortfolios === undefined &&
    limits.classes === undefined &&
    /תיק\s+כ(?:י)?תה/.test(normalized)
  ) {
    limits.students = SINGLE_CLASS_STUDENTS;
  }

  return limits;
}

export function featuresFromProtocolLimits(
  limits: PurchasePlanLimits,
  fallbackName: string
): string[] {
  const features: string[] = [];

  if (limits.integrationPortfolios) {
    features.push(`עד ${limits.integrationPortfolios} תיקי שילוב / סל אישי`);
  }
  if (limits.classes) {
    features.push(
      limits.classes === 1
        ? "כיתת חינוך מיוחד אחת"
        : `${limits.classes} כיתות / גנים`
    );
  }
  if (
    limits.students &&
    limits.integrationPortfolios === undefined &&
    limits.classes === undefined
  ) {
    features.push("תיק כיתת חינוך מיוחד");
    features.push(`עד ${limits.students} תלמידים`);
  }

  if (features.length === 0) features.push(fallbackName);
  return features;
}

export function encodeSumitPlanId(
  itemId: string,
  limits: PurchasePlanLimits
): string | null {
  if (!/^\d+$/.test(itemId)) return null;

  let id = `sumit:${itemId}`;
  if (limits.integrationPortfolios != null) {
    id += `:i${limits.integrationPortfolios}`;
  }
  if (limits.classes != null) id += `:c${limits.classes}`;
  if (limits.students != null) id += `:s${limits.students}`;
  if (limits.personalBaskets) id += ":b";

  if (id.length > 80) return null;
  return id;
}

export function parseSumitPlanId(
  planId: string
): { itemId: string; limits: PurchasePlanLimits } | null {
  const match = SUMIT_PLAN_ID.exec(planId);
  if (!match) return null;

  const limits: PurchasePlanLimits = {};
  if (match[2] != null) limits.integrationPortfolios = Number(match[2]);
  if (match[3] != null) limits.classes = Number(match[3]);
  if (match[4] != null) limits.students = Number(match[4]);
  if (planId.endsWith(":b")) limits.personalBaskets = true;

  return { itemId: match[1], limits };
}

/** פריט שכבר זוהה כשייך לקטלוג רגיל או מיוחד לפי כתובת ה-env. */
export function draftFromCatalogItem(input: {
  id: string;
  name: string;
  priceIls: number;
  category: PlanCategory;
  description?: string;
  sku?: string;
}): ProtocolPackageDraft | null {
  if (!/^\d+$/.test(input.id) || input.priceIls <= 0) return null;

  const name = normalizeProtocolName(input.name);
  if (!name) return null;

  const limits = limitsFromProtocolName(name);
  const id = encodeSumitPlanId(input.id, limits);
  if (!id) return null;

  return {
    id,
    sumitItemId: input.id,
    sku: input.sku ?? "",
    name,
    description: input.description?.trim() ?? "",
    priceIls: input.priceIls,
    category: input.category,
    limits,
    features: featuresFromProtocolLimits(limits, name),
  };
}

export function protocolPackagesFromIncomeItems(
  items: SumitIncomeItem[]
): ProtocolPackageDraft[] {
  const seen = new Set<string>();
  const drafts: ProtocolPackageDraft[] = [];

  for (const item of items) {
    if (item.priceIls <= 0) continue;
    if (!isProtocolPackageName(item.name)) continue;

    const name = normalizeProtocolName(item.name);
    if (seen.has(name)) continue;
    seen.add(name);

    const limits = limitsFromProtocolName(name);
    const id = encodeSumitPlanId(item.id, limits);
    if (!id) continue;

    drafts.push({
      id,
      sumitItemId: item.id,
      sku: item.sku,
      name,
      description: item.description,
      priceIls: item.priceIls,
      category: protocolPackageCategory(name),
      limits,
      features: featuresFromProtocolLimits(limits, name),
    });
  }

  drafts.sort(
    (a, b) => a.priceIls - b.priceIls || a.name.localeCompare(b.name, "he")
  );
  return drafts;
}
