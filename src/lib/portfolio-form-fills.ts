import { getFolderActionButtons } from "@/lib/folder-actions";
import {
  getFormSchema,
  studentPortfolioFillHref,
  type FormSchema,
} from "@/lib/form-schemas";
import { studentPortfolioFormsHref } from "@/lib/student-portfolio";
import { getStudentFormFills } from "@/lib/mock-store";
import type { StudentFormFill, StudentStatus } from "@/lib/supabase/types";

export function formAllowsMultipleFills(formId: string): boolean {
  return formId === "tachi" || formId === "tachi-integrative";
}

/** עמוד טפסים בתיקייה + מילוי חדש ריק (תח״י וגם תל״א) */
export function portfolioFormsAllowsAnotherFill(formId: string): boolean {
  return (
    formId === "tachi" ||
    formId === "tla" ||
    formId === "tachi-integrative"
  );
}

/** מילוי חדש בתיקייה — כל הטפסים חוץ מהטופס הנוכחי (לפריל מצטבר, בלי לשכפל מילוי קודם של אותו טופס). */
export function fillsForPortfolioCreateNew(
  formId: string,
  allFills: StudentFormFill[],
  createNew: boolean
): StudentFormFill[] {
  if (!createNew || !portfolioFormsAllowsAnotherFill(formId)) {
    return allFills;
  }
  return allFills.filter((fill) => fill.form_id !== formId);
}

/** מעבר למילוי או לעמוד הטפסים כשיש כבר תח״י/תל״א שמור — כדי לא לפתוח בטעות את התוכנית האחרונה. */
export function portfolioStructuredFillHref(options: {
  studentId: string;
  schema: Pick<FormSchema, "id" | "folder">;
  navFrom?: string;
  parentFolder: string;
  existingFills: StudentFormFill[];
}): string {
  const hasSaved = options.existingFills.some(
    (fill) => fill.form_id === options.schema.id
  );
  if (formAllowsMultipleFills(options.schema.id) && hasSaved) {
    return studentPortfolioFormsHref(
      options.studentId,
      options.schema.folder,
      options.navFrom,
      options.parentFolder
    );
  }
  return studentPortfolioFillHref(
    options.studentId,
    options.schema.id,
    options.navFrom,
    { parentFolder: options.parentFolder }
  );
}

export function formBelongsToPortfolioFolder(
  schema: FormSchema,
  folderName: string,
  actionLabels: string[]
): boolean {
  if (schema.categoryFolder === folderName) return true;
  return actionLabels.includes(schema.folder);
}

export type PortfolioFolderFillEntry = {
  fill: StudentFormFill;
  schema: FormSchema;
  label: string;
};

export function listPortfolioFolderFormFills(
  studentId: string,
  folderName: string,
  studentStatus?: StudentStatus | null
): PortfolioFolderFillEntry[] {
  const actions = getFolderActionButtons(studentId, folderName, studentStatus);
  const fills = getStudentFormFills(studentId);
  const multi: PortfolioFolderFillEntry[] = [];
  const latestSingleByForm = new Map<string, StudentFormFill>();

  for (const fill of fills) {
    const schema = getFormSchema(fill.form_id);
    if (!schema) continue;
    if (!formBelongsToPortfolioFolder(schema, folderName, actions)) continue;

    if (formAllowsMultipleFills(fill.form_id)) {
      const domain = (fill.data.domain ?? "").trim();
      multi.push({
        fill,
        schema,
        label: domain ? `${schema.title} · ${domain}` : schema.title,
      });
      continue;
    }

    const prev = latestSingleByForm.get(fill.form_id);
    if (!prev || new Date(fill.updated_at) > new Date(prev.updated_at)) {
      latestSingleByForm.set(fill.form_id, fill);
    }
  }

  const singles: PortfolioFolderFillEntry[] = [];
  for (const fill of latestSingleByForm.values()) {
    const schema = getFormSchema(fill.form_id);
    if (!schema) continue;
    singles.push({
      fill,
      schema,
      label: schema.folder || schema.title,
    });
  }

  return [...multi, ...singles].sort(
    (a, b) =>
      new Date(b.fill.updated_at).getTime() -
      new Date(a.fill.updated_at).getTime()
  );
}

export { formFillStatusLabel } from "@/lib/form-fill-status";
