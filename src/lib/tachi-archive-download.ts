import { FORM_SCHEMAS } from "@/lib/form-schemas";
import { formSnapshotFileName } from "@/lib/form-snapshot-filename";

const TACHI_ARCHIVE_FILE_NAMES = new Set(
  FORM_SCHEMAS.filter(
    (schema) => schema.id === "tachi" || schema.id === "tachi-integrative"
  ).map((schema) => formSnapshotFileName(schema.title))
);

/** עותק ארכיון פנימי של תח״י (לא כל HTML בתיקייה) */
export function isTachiFormArchiveDocument(doc: { name: string }): boolean {
  return TACHI_ARCHIVE_FILE_NAMES.has(doc.name);
}

/** מזהה טופס לפי שם קובץ ארכיון תח״י */
export function tachiFormIdFromArchiveFileName(
  fileName: string
): "tachi" | "tachi-integrative" | null {
  const schema = FORM_SCHEMAS.find(
    (s) =>
      (s.id === "tachi" || s.id === "tachi-integrative") &&
      formSnapshotFileName(s.title) === fileName
  );
  if (!schema) return null;
  return schema.id === "tachi-integrative" ? "tachi-integrative" : "tachi";
}