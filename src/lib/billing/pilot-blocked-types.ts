/**
 * רשימת סוגי מוסדות שחסומים מהרשמה/הגדרה בשלב הפיילוט.
 * החסימה חלה רק על בחירת סוג מוסד בשלב ההגדרה הראשונית —
 * לא על רכישה או תשלום (שנשארים פתוחים לכל סוגי המוסדות).
 *
 * כדי לבטל את החסימה — לרוקן את הרשימה או למחוק את הקריאות לפונקציה.
 */

import type { Category } from "@/lib/supabase/types";

/** סוגי מוסדות החסומים מהגדרה ראשונית (לא מרכישה) בשלב הפיילוט */
export const PILOT_BLOCKED_INSTITUTION_TYPES: ReadonlyArray<
  Exclude<Category, "tutorials">
> = ["kindergartens", "high-schools"];

/** הודעת שגיאה למשתמש (עברית) - הרשמה/הגדרת סוג מוסד */
export const PILOT_BLOCKED_SETUP_MESSAGE =
  "המערכת אינה זמינה כרגע לגנים ותיכונים. לפרטים נוספים צרו קשר.";

/** קוד שגיאה לתגובות API */
export const PILOT_BLOCKED_ERROR_CODE = "PILOT_BLOCKED_INSTITUTION_TYPE";

/**
 * בודק אם סוג המוסד מופיע ברשימת הסוגים החסומים.
 * מחזיר `true` רק אם הסוג הוא בדיוק "kindergartens" או "high-schools".
 * מחזיר `false` עבור null, undefined, או כל סוג אחר (כולל "schools").
 */
export function isPilotBlockedInstitutionType(
  institutionType: Exclude<Category, "tutorials"> | null | undefined
): boolean {
  if (!institutionType) return false;
  return PILOT_BLOCKED_INSTITUTION_TYPES.includes(institutionType);
}

/**
 * בודק אם בחירת סוג מוסד חדש חסומה בשלב הפיילוט (להרשמה/הגדרה בלבד).
 * חוסם רק כאשר:
 * 1. הסוג החדש הוא בדיוק "kindergartens" או "high-schools"
 * 2. המוסד עדיין לא הוגדר עם סוג חסום (לא חוסם עריכת הגדרות אחרות למוסד קיים מסוג חסום)
 * 3. אין מנוי פעיל (מוסדות עם מנוי פעיל לא יחסמו)
 *
 * מחזיר `false` עבור null, undefined, ערך ריק, או כל סוג שאינו חסום (כולל "schools").
 */
export function isSetupBlockedForInstitutionType(
  newInstitutionType: Exclude<Category, "tutorials"> | null | undefined,
  currentInstitutionType: Exclude<Category, "tutorials"> | null | undefined,
  subscriptionStatus: string | null | undefined
): boolean {
  if (subscriptionStatus === "active") return false;
  if (!isPilotBlockedInstitutionType(newInstitutionType)) return false;
  if (isPilotBlockedInstitutionType(currentInstitutionType)) return false;
  return true;
}
