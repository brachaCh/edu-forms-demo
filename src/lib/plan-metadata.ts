import type { PurchasePlan, PurchasePlanId, PlanCategory } from "@/lib/purchase-plans";

/** מטא-דאטה מקומי — מגבלות, קטגוריה ותכונות (לא קיים ב-SUMIT). */

export const PLAN_METADATA: PurchasePlan[] = [

  {

    id: "plan-1",

    number: 1,

    category: "regular",

    title: 'חבילה מס\' 1',

    features: ["עד 60 תיקי שילוב / סל אישי"],

    priceAg: 210_000,

    limits: { integrationPortfolios: 60, personalBaskets: true },

  },

  {

    id: "plan-2",

    number: 2,

    category: "regular",

    title: 'חבילה מס\' 2',

    features: ["עד 100 תיקי שילוב / סל אישי"],

    priceAg: 320_000,

    limits: { integrationPortfolios: 100, personalBaskets: true },

  },

  {

    id: "plan-3",

    number: 3,

    category: "regular",

    title: 'חבילה מס\' 3',

    features: ["תיק כיתת חינוך מיוחד", "עד 17 תלמידים"],

    priceAg: 100_000,

    limits: { students: 17 },

  },

  {

    id: "plan-4",

    number: 4,

    category: "regular",

    title: 'חבילה מס\' 4',

    features: ["עד 60 תיקי שילוב / סל אישי", "כיתת חינוך מיוחד אחת"],

    priceAg: 310_000,

    limits: { integrationPortfolios: 60, personalBaskets: true, classes: 1 },

  },

  {

    id: "plan-5",

    number: 5,

    category: "regular",

    title: 'חבילה מס\' 5',

    features: ["עד 100 תיקי שילוב / סל אישי", "2 כיתות חינוך מיוחד"],

    priceAg: 490_000,

    limits: { integrationPortfolios: 100, personalBaskets: true, classes: 2 },

  },

  {

    id: "plan-6",

    number: 6,

    category: "regular",

    title: 'חבילה מס\' 6',

    features: ["עד 120 תיקי שילוב / סל אישי", "3 כיתות חינוך מיוחד"],

    priceAg: 640_000,

    limits: { integrationPortfolios: 120, personalBaskets: true, classes: 3 },

  },

  {

    id: "plan-7",

    number: 7,

    category: "special",

    title: 'חבילה מס\' 7',

    features: ["עד 5 כיתות / גנים"],

    priceAg: 380_000,

    limits: { classes: 5 },

  },

  {

    id: "plan-8",

    number: 8,

    category: "special",

    title: 'חבילה מס\' 8',

    features: ["עד 8 כיתות / גנים"],

    priceAg: 590_000,

    limits: { classes: 8 },

  },

  {

    id: "plan-9",

    number: 9,

    category: "special",

    title: 'חבילה מס\' 9',

    features: ["עד 12 כיתות / גנים"],

    priceAg: 830_000,

    limits: { classes: 12 },

  },

  {

    id: "plan-10",

    number: 10,

    category: "special",

    title: "חבילה מספר 10",

    features: ["עד 15 כיתות / גנים"],

    priceAg: 1_050_000,

    limits: { classes: 15 },

  },

  {

    id: "plan-11",

    number: 11,

    category: "special",

    title: "חבילה מספר 11",

    features: ["עד 20 כיתות / גנים"],

    priceAg: 1_380_000,

    limits: { classes: 20 },

  },

  {

    id: "plan-12",

    number: 12,

    category: "special",

    title: "חבילה מספר 12",

    features: ["תיק כיתת חינוך מיוחד", "עד 17 תלמידים"],

    priceAg: 100_000,

    limits: { students: 17 },

  },

];



const METADATA_BY_ID = new Map(PLAN_METADATA.map((plan) => [plan.id, plan]));



export function getStaticPlanMetadata(planId: string): PurchasePlan | null {

  return METADATA_BY_ID.get(planId as PurchasePlanId) ?? null;

}



export function expectedSkuForPlan(

  planId: PurchasePlanId,

  category: PlanCategory

): string {

  return `${category}:${planId}`;

}



const INTEGRATION_PORTFOLIOS_FEATURE = /^עד \d+ תיקי שילוב$/;

/** מאחד «עד X תיקי שילוב» ו«סל אישי» לשורת תיאור אחת. */
export function normalizePlanFeatures(features: string[]): string[] {
  const result: string[] = [];

  for (const feature of features) {
    const trimmed = feature.trim();
    if (!trimmed) continue;

    const previous = result[result.length - 1];
    if (
      trimmed === "סל אישי" &&
      previous &&
      INTEGRATION_PORTFOLIOS_FEATURE.test(previous)
    ) {
      result[result.length - 1] = `${previous} / סל אישי`;
      continue;
    }

    result.push(trimmed);
  }

  return result;
}

export function parseFeaturesFromDescription(description: string): string[] {
  const trimmed = description.trim();

  if (!trimmed) return [];

  const parts = trimmed
    .split(/\n|·|•|\||;/)
    .map((part) => part.trim())
    .filter(Boolean);

  const features = parts.length > 0 ? parts : [trimmed];
  return normalizePlanFeatures(features);
}


