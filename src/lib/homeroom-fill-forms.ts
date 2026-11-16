import type { FormSchema } from "@/lib/form-schemas";
import { PARENT_QUESTIONNAIRE_FORM_IDS } from "@/lib/parent-questionnaire-email";

/**
 * טפסים שאפשר לשלוח לאיש צוות (מחנכת / צוות) למילוי בקישור אישי.
 * חייב להיות מסונכרן עם FILL_REQUEST_FORM_IDS ב־/api/fill/create.
 */
export const STAFF_FILL_FORM_IDS = new Set([
  "referral-questionnaire",
  "referral-questionnaire-kindergarten",
  "referral-questionnaire-multidisciplinary",
  "moe-exhaust-options",
  "moe-inclusion-plan",
  "moe-psychologist-recommendation",
  "functional-educational-report",
  "tachi",
  "tachi-integrative",
  "tachi-prep",
  "tla",
  "tla-integrative",
  "tla-prep",
  "tla-presentation",
  "student-questionnaire",
]);

/** @deprecated השתמשו ב־STAFF_FILL_FORM_IDS */
export const HOMEROOM_FILL_FORM_IDS = STAFF_FILL_FORM_IDS;

export function isStaffFillForm(
  schema: Pick<FormSchema, "id"> | null | undefined
): boolean {
  if (!schema) return false;
  return STAFF_FILL_FORM_IDS.has(schema.id);
}

/** @deprecated השתמשו ב־isStaffFillForm */
export function isHomeroomFillForm(
  schema: Pick<FormSchema, "id"> | null | undefined
): boolean {
  return isStaffFillForm(schema);
}

export function isTachiStaffFillForm(formId: string): boolean {
  return (
    formId === "tachi" ||
    formId.startsWith("tachi-") ||
    formId === "tla" ||
    formId.startsWith("tla-")
  );
}

/**
 * טפסים שאפשר ליצור עבורם בקשת מילוי (צוות או שאלון הורים).
 * יצירת הבקשה דורשת סשן צוות + מוסד; המילוי עצמו נשאר ציבורי דרך קישור חתום.
 */
export const FILL_REQUEST_FORM_IDS = new Set([
  ...STAFF_FILL_FORM_IDS,
  ...PARENT_QUESTIONNAIRE_FORM_IDS,
]);

export function isFillRequestForm(
  schema: Pick<FormSchema, "id"> | string | null | undefined
): boolean {
  if (!schema) return false;
  const id = typeof schema === "string" ? schema : schema.id;
  return FILL_REQUEST_FORM_IDS.has(id);
}
