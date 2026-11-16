/** שאלון הורים — שליחה למייל במקום מילוי על ידי הצוות */

import type { FormSchema } from "@/lib/form-schemas";
import { interpolateFormStaticLabel } from "@/lib/form-fields";

/** Fields that belong to staff and should be hidden from parents in the public fill page */
export const STAFF_ONLY_FIELD_KEYS = new Set([
  "homeroom_signature",
  "homeroom_sign_name",
  "homeroom_sign_date",
  "filled_at",
  "homeroom_teacher",
]);

export const PARENT_QUESTIONNAIRE_FORM_IDS = new Set([
  "parent-questionnaire",
  "parent-questionnaire-tla",
  "moe-parent-questionnaire-alt",
]);

export function isParentQuestionnaireForm(
  schema: Pick<FormSchema, "id"> | null | undefined
): boolean {
  if (!schema) return false;
  return PARENT_QUESTIONNAIRE_FORM_IDS.has(schema.id);
}

/** האם ההורים כבר שמרו והחזירו את השאלון הממולא */
export function parentQuestionnaireLooksReturned(
  fills: Array<{
    status?: string;
    data?: Record<string, string> | null;
  }>
): boolean {
  // רק סטטוס «הושלם» — טיוטה שנוצרה לשליחה למייל לא נחשבת החזרה
  return fills.some((fill) => fill.status === "completed");
}

export type ParentQuestionnaireQuestion = {
  section: string;
  label: string;
};

export function buildParentQuestionnaireEmailPayload(
  schema: FormSchema,
  data: Record<string, string>
): {
  formTitle: string;
  intro: string;
  questions: ParentQuestionnaireQuestion[];
} {
  let intro = "";
  const questions: ParentQuestionnaireQuestion[] = [];

  for (const section of schema.sections) {
    const sectionTitle = section.title?.trim() ?? "";
    for (const field of section.fields) {
      const type = field.type ?? "text";
      if (type === "static") {
        const text = interpolateFormStaticLabel(field.label, data).trim();
        if (!intro && text) intro = text;
        continue;
      }
      if (type === "signature") continue;
      if (!field.label?.trim()) continue;
      questions.push({
        section: sectionTitle,
        label: field.label.trim(),
      });
    }
  }

  return {
    formTitle: schema.title,
    intro,
    questions,
  };
}
