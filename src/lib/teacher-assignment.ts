/**
 * TZ-32: Helpers for assigning students to teachers (students.teacher_name).
 * Only institution owner or system is_admin may write this field.
 */

/** Prefill for the wizard teacher field. Non-owners never inherit defaultTeacher. */
export function teacherNamePrefill(
  defaultTeacher: string | null | undefined,
  canAssignTeachers: boolean
): string {
  if (!canAssignTeachers) return "";
  return defaultTeacher?.trim() || "";
}

/**
 * Value to send on create (wizard / Excel import / תל״כ).
 * Non-owners always omit assignment — even when the form or file has a name.
 */
export function teacherNameForWrite(
  proposed: string | null | undefined,
  canAssignTeachers: boolean
): string | null {
  if (!canAssignTeachers) return null;
  const trimmed = proposed?.trim();
  return trimmed || null;
}

/**
 * Wizard create: admin/member with a prefilled defaultTeacher still omit teacher_name.
 */
export function teacherNameForWizardCreate(options: {
  formTeacherName?: string | null;
  defaultTeacher?: string | null;
  canAssignTeachers: boolean;
}): string | null {
  if (!options.canAssignTeachers) return null;
  return (
    options.formTeacherName?.trim() ||
    options.defaultTeacher?.trim() ||
    null
  );
}

/** Excel import (Student / Frequency dialogs): omit teacher_name for non-owners. */
export function teacherNameForExcelImport(
  rowTeacherName: string | null | undefined,
  canAssignTeachers: boolean
): string | null {
  return teacherNameForWrite(rowTeacherName, canAssignTeachers);
}

/** TZ-32 forbidden codes that the tenant data route must return as 403 (not 500). */
export const TENANT_FORBIDDEN_ERRORS = new Set([
  "MEMBER_CANNOT_CREATE_STUDENT",
  "MEMBER_CANNOT_DELETE_STUDENT",
  "MEMBER_CANNOT_CHANGE_TEACHER",
  "MEMBER_CANNOT_EDIT_FIELD",
  "ADMIN_CANNOT_ASSIGN_TEACHER",
]);

export function isTenantForbiddenError(message: string): boolean {
  return TENANT_FORBIDDEN_ERRORS.has(message);
}
