/**
 * הגנת פרטיות לפני שליחה ל-AI חיצוני.
 * לא שולחים שמות, ת.ז., טלפון, מייל, כתובת או פרטי הורים/צוות מזהים.
 */

/** מפתחות הקשר תלמיד המותרים לשליחה (לא מזהים) */
export const AI_SAFE_STUDENT_CONTEXT_KEYS = new Set([
  "gender",
  "status",
  "class_name",
  "category",
  "notes",
]);

/** מפתחות שדה / הקשר שמכילים פרטים מזהים — לא נשלחים ל-AI */
const IDENTIFYING_KEY_RE =
  /(^|_)(full_?name|first_?name|last_?name|student_?name|teacher_?name|staff_?name|father_?name|mother_?name|parent_?name|guardian_?name|id_?number|student_?id|tz|phone|mobile|email|mail|address|street|city|zip|birth_?date|date_of_birth|dob)(_|$)/i;

const PARENT_ROLE_KEY_RE =
  /^(father|mother|parent|guardian)s?\d*$/i;
const PARENT_NAME_KEY_RE =
  /(^|_)(father|mother|parent|guardian)s?\d*_?name(_|$)/i;
const HEBREW_PARENT_KEY_RE =
  /(^|_)(אב|אם|אבא|אמא|הורה|הורים|אפוטרופוס)(_|$)/;
const HEBREW_PARENT_LABEL_RE =
  /^(שם\s+)?(האב|האם|אבא|אמא|הורה|ההורה|אפוטרופוס|אב|אם)$/;
const ENGLISH_PARENT_LABEL_RE =
  /^(father|mother|parent|guardian)s?$/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
/** טלפון ישראלי נפוץ / בינלאומי קצר */
const PHONE_RE =
  /(?:\+972[\s-]?)?(?:0(?:5[0-9]|[2-489]|7[2-9]))[\s-]?\d{3}[\s-]?\d{4}\b/g;
/** ת.ז. ישראלית — 9 ספרות רצופות או עם מקפים */
const IL_ID_RE = /\b\d{3}-?\d{2}-?\d{4}\b/g;

export const AI_NO_PII_SYSTEM_RULE =
  "פרטיות: אסור לכלול או לבקש פרטים מזהים (שם מלא, ת.ז., טלפון, מייל, כתובת, שמות הורים/אנשי צוות). " +
  "השתמש רק ב«התלמיד» / «התלמידה» לפי המגדר אם ידוע. אם מופיעים פרטים מזהים בקלט — התעלם מהם ואל תעתיק אותם לפלט.";

export function isIdentifyingAiFieldKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (IDENTIFYING_KEY_RE.test(trimmed)) return true;
  if (PARENT_ROLE_KEY_RE.test(trimmed)) return true;
  if (PARENT_NAME_KEY_RE.test(trimmed)) return true;
  if (HEBREW_PARENT_KEY_RE.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === "name" ||
    lower === "email" ||
    lower === "phone" ||
    lower === "address" ||
    lower === "id_number"
  );
}

export function isIdentifyingAiField(field: {
  key: string;
  label?: string;
}): boolean {
  if (isIdentifyingAiFieldKey(field.key)) return true;
  const label = (field.label ?? "").trim();
  if (!label) return false;
  if (isIdentifyingAiFieldKey(label)) return true;
  return HEBREW_PARENT_LABEL_RE.test(label) || ENGLISH_PARENT_LABEL_RE.test(label);
}

/** מסיר דפוסי ת.ז. / טלפון / מייל / קישור מטקסט חופשי */
export function scrubIdentifyingPatterns(text: string): string {
  return text
    .replace(URL_RE, "[קישור הוסר]")
    .replace(EMAIL_RE, "[מייל הוסר]")
    .replace(PHONE_RE, "[טלפון הוסר]")
    .replace(IL_ID_RE, "[ת.ז. הוסרה]")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sanitizeStudentContextForAi(
  context: Record<string, string> | null | undefined
): Record<string, string> {
  if (!context) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(context)) {
    if (typeof rawKey !== "string" || typeof rawVal !== "string") continue;
    const key = rawKey.trim().slice(0, 60);
    if (!key || !AI_SAFE_STUDENT_CONTEXT_KEYS.has(key)) continue;
    if (isIdentifyingAiFieldKey(key)) continue;
    const val = scrubIdentifyingPatterns(rawVal.trim().slice(0, 500));
    if (val) out[key] = val;
  }
  return out;
}

export type AiFieldSummary = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  hint?: string;
  currentValue?: string;
};

/** מנקה ערכים נוכחיים של שדות מזהים; משאיר את המפתח ברשימה כדי שה-AI לא ימלא אותם */
export function sanitizeAiFieldSummaries<T extends AiFieldSummary>(
  fields: T[]
): T[] {
  return fields.map((field) => {
    if (!isIdentifyingAiField(field)) {
      if (!field.currentValue) return field;
      return {
        ...field,
        currentValue: scrubIdentifyingPatterns(field.currentValue),
      };
    }
    const { currentValue: _drop, ...rest } = field;
    return rest as T;
  });
}

export function sanitizeFreeTextForAi(
  text: string | null | undefined,
  maxChars: number
): string {
  if (!text) return "";
  return scrubIdentifyingPatterns(text.trim().slice(0, maxChars));
}
