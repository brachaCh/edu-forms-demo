/**
 * תח"י/תל"א אינטגרטיבי — מפתחות עמודות כותרת ותוויות ברירת מחדל.
 * מיובא גם ברכיב העריכה וגם ביצירת HTML להדפסה.
 */

export const INTEGRATIVE_COL_TEACHER_KEY = "tachi_integrative_col_teacher";
export const INTEGRATIVE_COL_AIDE_KEY = "tachi_integrative_col_aide";
export const INTEGRATIVE_COL_OTHER_KEY = "tachi_integrative_col_other";

export const DEFAULT_COL_TEACHER = "מורה";
export const DEFAULT_COL_AIDE = "סייעת";
export const DEFAULT_COL_OTHER = "אחר";

const LABEL_DEFAULTS: Record<string, string> = {
  [INTEGRATIVE_COL_TEACHER_KEY]: DEFAULT_COL_TEACHER,
  [INTEGRATIVE_COL_AIDE_KEY]: DEFAULT_COL_AIDE,
  [INTEGRATIVE_COL_OTHER_KEY]: DEFAULT_COL_OTHER,
};

/** תווית עמודה לתצוגה/הדפסה — ריק או רווחים חוזרים לברירת המחדל. */
export function resolveIntegrativeColumnLabel(
  key: string,
  raw: string | undefined
): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed) return trimmed;
  return LABEL_DEFAULTS[key] ?? "";
}
