/** העברת תיק תלמיד שלם לארכיון / שחזור */

import {
  archiveStudentDocument,
  getStudentDocuments,
  updateStudent,
} from "@/lib/mock-store";
import type { Student } from "@/lib/supabase/types";

export type ArchiveStudentFileError =
  | "not_found"
  | "staff_not_allowed"
  | "already_archived"
  | "not_archived"
  | "update_failed";

export type ArchiveStudentFileResult =
  | { ok: true; student: Student }
  | { ok: false; error: ArchiveStudentFileError };

export function isStudentFileArchived(
  student: Pick<Student, "archived_at"> | null | undefined
): boolean {
  return Boolean(student?.archived_at);
}

export function canArchiveStudentFile(
  student: Pick<Student, "status" | "archived_at"> | null | undefined
): boolean {
  if (!student) return false;
  if (student.status === "integration-teacher") return false;
  if (isStudentFileArchived(student)) return false;
  return true;
}

export function canRestoreStudentFile(
  student: Pick<Student, "archived_at"> | null | undefined
): boolean {
  return isStudentFileArchived(student);
}

/**
 * מעביר תיק תלמיד לארכיון: מסמן את התלמיד ומעביר את כל המסמכים הפעילים לארכיון.
 */
export async function archiveStudentFile(
  student: Student
): Promise<ArchiveStudentFileResult> {
  if (!student?.id) return { ok: false, error: "not_found" };
  if (student.status === "integration-teacher") {
    return { ok: false, error: "staff_not_allowed" };
  }
  if (isStudentFileArchived(student)) {
    return { ok: false, error: "already_archived" };
  }

  const archivedAt = new Date().toISOString();
  let updated: Student | null = null;
  try {
    updated = await updateStudent(student.id, { archived_at: archivedAt });
  } catch {
    return { ok: false, error: "update_failed" };
  }
  if (!updated) return { ok: false, error: "update_failed" };
  // אם השרת עדיין בלי העמודה — נוודא שהחותמת המקומית מוחזרת
  if (!updated.archived_at) {
    updated = { ...updated, archived_at: archivedAt };
  }

  try {
    const docs = getStudentDocuments(student.id);
    for (const doc of docs) {
      if (doc.archived_at) continue;
      await archiveStudentDocument(doc.id);
    }
  } catch {
    // התלמיד כבר בארכיון — כשל במסמך בודד לא מבטל את ההעברה
  }

  return { ok: true, student: updated };
}

/**
 * מחזיר תלמיד לרשימות פעילות. מסמכים נשארים בארכיון התיקיות.
 */
export async function restoreStudentFile(
  student: Student
): Promise<ArchiveStudentFileResult> {
  if (!student?.id) return { ok: false, error: "not_found" };
  if (!isStudentFileArchived(student)) {
    return { ok: false, error: "not_archived" };
  }

  let updated: Student | null = null;
  try {
    updated = await updateStudent(student.id, { archived_at: null });
  } catch {
    return { ok: false, error: "update_failed" };
  }
  if (!updated) return { ok: false, error: "update_failed" };
  return { ok: true, student: { ...updated, archived_at: null } };
}
