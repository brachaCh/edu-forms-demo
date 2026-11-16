/**
 * מיסוך שם תלמיד בבקשות /api/ai/fill-form ו־/api/fill/ai לפני בניית ה־payload למודל.
 * השם לא נכנס לפרומפט ולא ל־userPayload; שחזור מקומי בערכי השדות המוחזרים.
 */

import {
  sanitizeAiFieldSummaries,
  sanitizeFreeTextForAi,
  sanitizeStudentContextForAi,
  type AiFieldSummary,
} from "@/lib/ai-privacy";
import {
  createNameMaskContext,
  maskStudentNamesForAi,
  restoreStudentFirstName,
  studentNamePartsForAi,
  studentNameTokenPromptLines,
  type NameRestoreMap,
  type StudentNamePartsForAi,
} from "@/lib/ai-student-placeholder";

const FORM_FULL_NAME_KEYS = new Set([
  "full_name",
  "student_name",
  "name",
]);

export type FillFormNameField = {
  key?: string;
  currentValue?: string;
};

export function resolveFillFormStudentName(input: {
  studentName?: string | null;
  freeAccess?: boolean;
  fields?: FillFormNameField[];
}): string {
  const fromBody = (input.studentName ?? "").trim();
  if (fromBody) return fromBody;
  if (!input.freeAccess || !input.fields?.length) return "";

  let first = "";
  let last = "";
  for (const field of input.fields) {
    const key = (field.key ?? "").trim().toLowerCase();
    const value = (field.currentValue ?? "").trim();
    if (!key || !value) continue;
    if (FORM_FULL_NAME_KEYS.has(key)) return value;
    if (key === "first_name" && !first) first = value;
    if (key === "last_name" && !last) last = value;
  }
  return [first, last].filter(Boolean).join(" ");
}

export function fillFormPlaceholderPromptLines(): string[] {
  return [
    ...studentNameTokenPromptLines(),
    "אל תעתיק שמות או פרטים מזהים מהקלט או מהדוגמה.",
  ];
}

function maskValue(
  text: string,
  parts: StudentNamePartsForAi,
  ctx: ReturnType<typeof createNameMaskContext>
): string {
  if (!text) return text;
  return maskStudentNamesForAi(text, parts, ctx);
}

export type PrepareFillFormForAnthropicInput = {
  studentName?: string | null;
  freeAccess?: boolean;
  teacherNotes?: string | null;
  exampleTemplate?: string | null;
  studentContext?: Record<string, string> | null;
  fieldSummaries: AiFieldSummary[];
  maxNotesChars: number;
  maxExampleChars: number;
};

export type PrepareFillFormForAnthropicResult = {
  teacherNotes: string;
  exampleTemplate: string;
  studentContext: Record<string, string>;
  fields: AiFieldSummary[];
  firstName: string;
  restoreMap: NameRestoreMap;
  teacherLiterals: string[];
  usesPlaceholder: boolean;
  promptLines: string[];
};

/**
 * מנקה טלפון/ת.ז./מייל, ואז ממסך כל מופע שם ב־notes / currentValue / דוגמה
 * לפני בניית ה־payload. השם עצמו לא מוחזר.
 */
export function prepareFillFormForAnthropic(
  input: PrepareFillFormForAnthropicInput
): PrepareFillFormForAnthropicResult {
  const studentName = resolveFillFormStudentName({
    studentName: input.studentName,
    freeAccess: input.freeAccess,
    fields: input.fieldSummaries,
  });
  const parts = studentNamePartsForAi(studentName);
  const usesPlaceholder = Boolean(parts.firstName || parts.lastName);

  const teacherNotesRaw = sanitizeFreeTextForAi(
    input.teacherNotes,
    input.maxNotesChars
  );
  const exampleTemplateRaw = sanitizeFreeTextForAi(
    input.exampleTemplate,
    input.maxExampleChars
  );
  const scrubbedContext = sanitizeStudentContextForAi(input.studentContext);
  const sanitizedFields = sanitizeAiFieldSummaries(input.fieldSummaries);

  const ctx = createNameMaskContext([
    teacherNotesRaw,
    exampleTemplateRaw,
    ...Object.values(scrubbedContext),
    ...sanitizedFields.map((field) => field.currentValue ?? ""),
  ]);

  const teacherNotes = maskValue(teacherNotesRaw, parts, ctx);
  const exampleTemplate = maskValue(exampleTemplateRaw, parts, ctx);

  const studentContext: Record<string, string> = {};
  for (const [key, value] of Object.entries(scrubbedContext)) {
    studentContext[key] = maskValue(value, parts, ctx);
  }

  const fields = sanitizedFields.map((field) => {
    if (!field.currentValue) return field;
    return {
      ...field,
      currentValue: maskValue(field.currentValue, parts, ctx),
    };
  });

  return {
    teacherNotes,
    exampleTemplate,
    studentContext,
    fields,
    firstName: parts.firstName,
    restoreMap: ctx.restoreMap,
    teacherLiterals: [...ctx.teacherLiterals],
    usesPlaceholder,
    promptLines: usesPlaceholder ? fillFormPlaceholderPromptLines() : [],
  };
}

export function restoreFillFormFields(
  fields: Record<string, string>,
  firstName: string,
  restoreMap: NameRestoreMap,
  teacherLiterals?: Iterable<string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = restoreStudentFirstName(
      value,
      firstName,
      restoreMap,
      teacherLiterals
    );
  }
  return out;
}
