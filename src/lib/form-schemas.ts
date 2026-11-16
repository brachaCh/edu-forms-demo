/** סכמות טפסים מובנים — מקור: src/content/forms/*.json */

import type { FormFieldDef } from "@/lib/form-fields";
import {
  normalizeHebrewQuotes,
  sameHebrewFolderName,
} from "@/lib/hebrew-quotes";
import { loadFormSchemas } from "@/lib/form-schema-loader";
import type { Category, StudentStatus } from "@/lib/supabase/types";

export interface FormSection {
  title?: string;
  fields: FormFieldDef[];
  /**
   * פריסת מחוון הוליסטי (דף הכנה לתח"י / תל"א):
   * נתונים סביבתיים למעלה, התלמיד במרכז, מוקדי כוח/רקע מוגבלות בצדדים, מוקדים לחיזוק למטה.
   * class-profile — פרופיל כיתה בתל"כ | learning-clusters — אשכולות לימוד בתל"כ
   */
  layout?:
    | "default"
    | "holistic-profile"
    | "integrative-tachi"
    | "class-profile"
    | "learning-clusters";
}

export interface FormSchema {
  id: string;
  title: string;
  /** שם תיקיית המשנה בתיק (ריבוע) */
  folder: string;
  /** תיקיית אב בקטגוריית תיק */
  categoryFolder: string;
  sections: FormSection[];
}

export const FORM_SCHEMAS: readonly FormSchema[] = loadFormSchemas();

export function getFormSchema(formId: string): FormSchema | undefined {
  return FORM_SCHEMAS.find((f) => f.id === formId);
}

function resolveAliasId(
  name: string,
  aliases: Record<string, string>
): string | undefined {
  if (aliases[name]) return aliases[name];
  const normalized = normalizeHebrewQuotes(name);
  if (aliases[normalized]) return aliases[normalized];
  for (const [key, id] of Object.entries(aliases)) {
    if (sameHebrewFolderName(key, name)) return id;
  }
  return undefined;
}

export function getFormSchemaByFolder(
  folderName: string,
  status?: StudentStatus | null,
  category?: Category | string | null
): FormSchema | undefined {
  const name = folderName.trim();
  if (!name) return undefined;
  const byFormId = getFormSchema(name);
  if (byFormId) return byFormId;
  const isKindergarten = category === "kindergartens";
  const referralFormId = isKindergarten
    ? "referral-questionnaire-kindergarten"
    : "referral-questionnaire";
  const aliases: Record<string, string> = {
    "ויתור סודיות": "waiver-confidentiality",
    "טופס ויתור סודיות": "waiver-confidentiality",
    "ויתור סודיות לוועדת אפיון וזכאות": "waiver-eligibility-characterization",
    "ויתור סודיות לצוות רב מקצועי": "waiver-multidisciplinary-team",
    "ויתור סודיות לוועדת השגה": "waiver-appeal-committee",
    "שאלון הפניה": referralFormId,
    "שאלון הפנייה": referralFormId,
    "שאלון הפניה ופרוטוקול": referralFormId,
    "לדיון בוועדת אפיון וזכאות": referralFormId,
    "לדיון בצוות רב מקצועי": "referral-questionnaire-multidisciplinary",
    "שאלון הפניה לצוות רב מקצועי": "referral-questionnaire-multidisciplinary",
    "שאלון הפנייה לוועדת אפיון וזכאות": "referral-questionnaire-kindergarten",
    "הדרכת מומחה תחום": "expert-guidance",
    "הדרכת מומחית תחום": "expert-guidance",
    'תל"א אינטגרטיבי': "tla-integrative",
    'תל"א אינטגרטיבי (בקובץ נפרד)': "tla-integrative",
    'תל"א (בקובץ נפרד)': "tla",
    "כרטיס תלמיד סל אישי": "personal-basket-card",
    "מידע על התלמיד": "student-info",
    'תח"י (בקובץ נפרד)': "tachi",
    'תח"י אינטגרטיבי': "tachi-integrative",
    // -------- כיתות חינוך מיוחד / תל"כ (שמות מדויקים לפי התרשים) --------
    "פרטי זיהוי": "student-info",
    "פרטי זיהוי (שם, ת.ז., לידה)": "student-info",
    "פרטי זיהוי (שם, ת.ז., לידה, רחוב)": "student-info",
    "טופס ויתור סודיות חתום": "waiver-confidentiality",
    "פרטי צוות תלמיד (תפקיד וטלפון)": "student-team-details",
    "רשימת תלמידים (אפיון ותיאור תפקוד)": "class-student-list",
    "רשימת תלמידים": "class-student-list",
    "אסטרטגיות לימוד": "learning-clusters",
    "אשכולות לימוד": "learning-clusters",
    "פרוטוקול כיתה (מוקדי כוח, חיזוק ומטרות)": "class-profile",
    "פרוטוקול כיתה": "class-profile",
    "פרופיל כיתה (מוקדי כח, חיזוק ומטרות)": "class-profile",
    "פרופיל כיתה": "class-profile",
    "טופס ריכוז תוכנית לימודים כיתתית": "tlk-summary",
    'טופס ריכוז תל"כ': "tlk-summary",
    "תוכנית לימודים מותאמת וספרי לימוד": "adapted-curriculum",
    "תוכנית הלימודים בכיתה בהלימה לתוכנית הלימודים": "adapted-curriculum",
    "תוכנית הוראה כיתתית": "class-teaching-plan",
    "תוכנית הוראה כיתתית (מטרות ודרכי הוראה)": "class-teaching-plan",
    "מערכת שעות שבועית": "weekly-schedule",
    "מערכת שעות פרא-רפואית": "paramedical-schedule",
    "מערכת טיפול פרא-רפואית": "paramedical-schedule",
    "מערכת שילוב": "inclusion-schedule",
    "מערכת שעות אישית":
      status === "special-ed-class"
        ? "tlk-personal-schedule"
        : "personal-schedule",
    "מערכת אישית כיתתית":
      status === "special-ed-class"
        ? "tlk-personal-schedule"
        : "personal-schedule",
    "מערכת שילוב אישית": "personal-schedule",
    'מערכת שילוב (מהתל"כ)': "inclusion-schedule",
    'מערכת שעות אישית (מהתל"כ)': "tlk-personal-schedule",
    'דף הצגת תל"א (מוקדי כוח וחוזק)': "tla-presentation",
    'דף הכנה לתל"א': "tla-prep",
    'דף הכנה לתח"י': "tachi-prep",
    'דף הכנה לתח"י (היעזרי במחוון)': "tachi-prep",
    "שאלון הורים (לימודי, חברתי, רגשי)": "parent-questionnaire-tla",
    'שאלון הורים בניית תל"א': "parent-questionnaire-tla",
    "שאלון תלמיד": "student-questionnaire",
    "שאלון תלמיד (ציפיות וקשיים)": "student-questionnaire",
    "שאלות לתלמיד": "student-questionnaire",
    "שאלון תצפית ופרוטוקול": referralFormId,
    "הדרכת מנהלת תחום": "expert-guidance",
    "הדרכה מומחית תחום": "expert-guidance",
    "סיכומי ישיבות צוות": "staff-meetings",
    "ישיבות צוות": "staff-meetings",
    "תיעוד שיחות עם הורים": "parent-conversations",
    "תיעוד קשר עם הורים": "parent-conversations",
    "שיחות עם הורים": "parent-conversations",
    "תכתובות עם גורמים חיצוניים": "external-correspondence",
    "התכתבות עם גורמים חיצוניים": "external-correspondence",
    'תכתובות עם גורמים מטפלים מחוץ לביה"ס': "external-correspondence",
    "תכתובות עם גורמים מחוץ לבית הספר": "external-correspondence",
    "תיעוד ישיבות שילוב (מחנכת ומורה משלבת)": "inclusion-meetings",
    "תיעוד ישיבות שילוב": "inclusion-meetings",
    "הערכה מעצבת סיכום מילולי": "formative-assessment-verbal",
    "הערכה מעצבת מילולי": "formative-assessment-verbal",
    "הערכה מסכמת סיכום מילולי": "summative-assessment-verbal",
    "הערכה מסכמת מילולי": "summative-assessment-verbal",
    "הערכת מסכמת טבלה": "summative-assessment-table",
    'שאלון הורים בנית תח"י': "parent-questionnaire",
    // -------- טפסים תחת "מסמכים נוספים" --------
    "נספח 8": "moe-psychologist-recommendation",
    "המלצת פסיכולוג לשינוי קוד אפיון": "moe-psychologist-code-change",
    "אישור הורים לוועדת אפיון וזכאות ללא נוכחות הורים":
      "moe-parent-approval-committee-no-presence",
    "טופס לקבלת הסכמת הורה / אפוטרופוס לפעילות באתר בית הספר/ פרסום תמונות":
      "moe-school-website-photo-consent",
    "חידוש הזכאות לשירותי חינוך מיוחדים": "moe-eligibility-renewal",
    "נספח 6.11": "moe-eligibility-renewal",
    "מיצוי אפשרויות": "moe-exhaust-options",
    "שאלון להורים": "moe-parent-questionnaire-alt",
    הכלה: "moe-inclusion-plan",
    "דוח חינוכי תפקודי - למילוי והשלמה מהיעוץ":
      "functional-educational-report",
    "דוח חינוכי תפקודי": "functional-educational-report",
    // מערכת שעות פשוטה — רק לשילוב; סל אישי → מערכת אישית (detailed + בכיתה/אחר)
    "מערכת שעות":
      status === "personal-basket" ? "personal-schedule" : "schedule",
  };
  const byId = resolveAliasId(name, aliases);
  if (byId) return FORM_SCHEMAS.find((f) => f.id === byId);
  return FORM_SCHEMAS.find(
    (f) => f.folder === name || sameHebrewFolderName(f.folder, name)
  );
}

export function listFormFields(schema: FormSchema): FormFieldDef[] {
  return schema.sections.flatMap((s) => s.fields);
}

const VOICE_RECORDING_DISABLED_FORM_IDS = new Set([
  "tachi",
  "tachi-integrative",
  "tla-integrative",
  "learning-clusters",
]);

const VOICE_TABLE_FORM_IDS = new Set([
  "class-teaching-plan",
  "adapted-curriculum",
  "expert-guidance",
  "staff-meetings",
  "parent-conversations",
  "external-correspondence",
]);

/** שמירת טיוטה אוטומטית אחרי סיום תמלול קולי */
export const VOICE_AUTO_SAVE_FORM_IDS = new Set([
  "expert-guidance",
  "staff-meetings",
  "parent-conversations",
  "external-correspondence",
]);

export function formSupportsVoiceAutoSave(
  schema: Pick<FormSchema, "id"> | null | undefined
): boolean {
  return Boolean(schema && VOICE_AUTO_SAVE_FORM_IDS.has(schema.id));
}

/** באנר/כפתורי הקלטה — textarea רגילים, או טבלאות עם עמודות מוגדרות להקלטה */
export function formSupportsVoiceRecording(
  schema: Pick<FormSchema, "id" | "sections"> | null | undefined
): boolean {
  if (!schema) return false;
  if (VOICE_RECORDING_DISABLED_FORM_IDS.has(schema.id)) return false;
  if (VOICE_TABLE_FORM_IDS.has(schema.id)) return true;
  return schema.sections.some((section) =>
    section.fields.some((field) => field.type === "textarea")
  );
}

export function studentPortfolioFillHref(
  studentId: string,
  formId: string,
  backHref?: string,
  options?: { fillId?: string; createNew?: boolean; parentFolder?: string }
): string {
  const base = `/personal-area/students/fill/${studentId}/${encodeURIComponent(formId)}`;
  const params = new URLSearchParams();
  if (backHref) params.set("from", backHref);
  if (options?.fillId) params.set("fillId", options.fillId);
  if (options?.createNew) params.set("new", "1");
  if (options?.parentFolder) params.set("fromFolder", options.parentFolder);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
