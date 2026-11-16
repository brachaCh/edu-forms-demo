/**
 * מיפוי שדות לפי משמעות — אותו נתון עם מפתחות שונים בין טפסים.
 * מאפשר מילוי אוטומטי גם כש־key אינו זהה.
 */

import { joinPersonName, splitPersonName } from "@/lib/person-name";

/** קבוצות מפתחות שמייצגים את אותו תוכן */
export const SEMANTIC_FIELD_GROUPS: readonly (readonly string[])[] = [
  ["full_name", "student_name"],
  ["first_name"],
  ["last_name"],
  ["id_number", "student_id_number"],
  ["birth_date"],
  ["gender"],
  ["home_address"],
  ["city"],
  ["email"],
  ["phone", "family_phone"],
  ["father_name", "parent1_name"],
  ["mother_name", "parent2_name"],
  ["father_mobile", "parent1_phone"],
  ["mother_mobile", "parent2_phone"],
  ["class_name", "class_level", "class_or_gan_level"],
  ["teacher_name"],
  ["homeroom_teacher"],
  ["notes"],
  ["siblings_count"],
  ["birth_order"],
  ["father_occupation"],
  ["mother_occupation"],
  ["school_year"],
  [
    "integration_start_date",
    "integration_entry_date",
    "shiluv_start_date",
  ],
  ["school_name"],
  ["school_code", "institution_code"],
  ["guardian_name"],
  ["birth_country"],
  ["home_languages"],
  ["characterization"],
  ["family_status", "marital_status"],
  ["background"],
  ["aide_name"],
  ["accompanying_teacher"],
  ["domain_specialist", "domain_expertise"],
  ["basket_hours_teaching"],
  ["basket_hours_aide"],
  ["basket_hours_therapy"],
  /** מצב נוכחי — תח"י ↔ הערכה מעצבת/מסכמת */
  ["current_status"],
  /** קו בסיס / מצב התחלתי */
  ["baseline", "initial_status"],
  /**
   * מטרות: תח"י (מטרת על) / תח"י אינטגרטיבי (מטרות על) ↔
   * הערכה מעצבת (מטרות להמשך השנה) / מסכמת (מטרות ותהליך)
   */
  ["main_goal", "main_goals", "goals_rest_of_year", "goals_and_process"],
  ["recommendations", "table_recommendations"],
  ["year_changes", "significant_changes"],
  ["domain", "topic"],
];

const CANONICAL_BY_KEY: Record<string, string> = {};
const ALIASES_BY_CANONICAL: Record<string, string[]> = {};

for (const group of SEMANTIC_FIELD_GROUPS) {
  const canonical = group[0];
  ALIASES_BY_CANONICAL[canonical] = [...group];
  for (const key of group) {
    CANONICAL_BY_KEY[key] = canonical;
  }
}

export function getCanonicalFieldKey(key: string): string {
  return CANONICAL_BY_KEY[key] ?? key;
}

export function getFieldKeyAliases(key: string): string[] {
  const canonical = getCanonicalFieldKey(key);
  return ALIASES_BY_CANONICAL[canonical] ?? [key];
}

/**
 * בונה מאגר ערכים מכל הטפסים לפי מפתח מדויק + מפתחות נרדפים.
 * ערכים חדשים יותר (לפי סדר הקלט) גוברים רק אם המפתח/קנוני עדיין ריק.
 */
export function buildSemanticValuePool(
  entries: Array<{ key: string; value: string }>
): Record<string, string> {
  const byExact: Record<string, string> = {};
  const byCanonical: Record<string, string> = {};

  for (const { key, value } of entries) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (!(key in byExact)) byExact[key] = normalized;
    const canonical = getCanonicalFieldKey(key);
    if (!(canonical in byCanonical)) byCanonical[canonical] = normalized;
  }

  // first/last ↔ full_name
  const full =
    byCanonical.full_name ||
    joinPersonName(byCanonical.first_name ?? "", byCanonical.last_name ?? "");
  if (full) {
    if (!byCanonical.full_name) byCanonical.full_name = full;
    const parts = splitPersonName(full);
    if (!byCanonical.first_name && parts.first_name) {
      byCanonical.first_name = parts.first_name;
    }
    if (!byCanonical.last_name && parts.last_name) {
      byCanonical.last_name = parts.last_name;
    }
  }

  const pool: Record<string, string> = { ...byExact };
  for (const [canonical, value] of Object.entries(byCanonical)) {
    if (!(canonical in pool)) pool[canonical] = value;
    for (const alias of getFieldKeyAliases(canonical)) {
      if (!(alias in pool)) pool[alias] = value;
    }
  }

  return pool;
}

/** שליפת ערך לשדה לפי מפתח מדויק או נרדף */
export function lookupSemanticValue(
  pool: Record<string, string>,
  key: string
): string {
  const direct = (pool[key] ?? "").trim();
  if (direct) return direct;
  const canonical = getCanonicalFieldKey(key);
  const byCanonical = (pool[canonical] ?? "").trim();
  if (byCanonical) return byCanonical;
  for (const alias of getFieldKeyAliases(key)) {
    const value = (pool[alias] ?? "").trim();
    if (value) return value;
  }
  return "";
}
