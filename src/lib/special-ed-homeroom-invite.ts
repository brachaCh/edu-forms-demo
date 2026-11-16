/**
 * הזמנת מחנכת לכיתת חינוך מיוחד — לוגיקה טהורה לשיוך / הזמנה.
 * כתיבת teacher_name / homeroom_teacher רק כש-canAssignTeachers (TZ-32).
 */

import { isClassCurriculumStudent } from "@/lib/special-ed-mode";
import {
  normalizeSpecialEdClassName,
  specialEdClassKeyFromStudent,
  specialEdClassMatchKey,
} from "@/lib/special-ed-class-key";
import { personNamesMatch } from "@/lib/person-name";
import { normalizeEmail } from "@/lib/normalize-email";
import { ASCII_EMAIL_RE } from "@/lib/validation/simplesign";
import {
  canAssignStudentsToTeachers,
  canInviteHomeroomTeacher,
} from "@/lib/institution-owner";
import { teacherNameForWrite } from "@/lib/teacher-assignment";
import type { Category, InstitutionMembershipRole, Student } from "@/lib/supabase/types";

export type HomeroomInviteErrorCode =
  | "INVALID_EMAIL"
  | "NAME_REQUIRED"
  | "CLASS_NAME_REQUIRED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "EMAIL_SEND_FAILED"
  | "RATE_LIMITED"
  | "INVITE_UNAVAILABLE"
  | "SERVER_UNAVAILABLE"
  | "REASSIGN_CONFIRMATION_REQUIRED"
  | "OWNER_UPDATE_FAILED";

export type HomeroomInviteAction = "assign_existing_member" | "send_invite";

export type HomeroomInviteDecision =
  | { ok: true; action: HomeroomInviteAction; email: string; teacherName: string }
  | { ok: false; error: HomeroomInviteErrorCode };

export type ReassignStudent = {
  id: string;
  full_name: string;
  teacher_name: string;
};

const HOMEROOM_INVITE_ERROR_MESSAGES: Record<HomeroomInviteErrorCode, string> =
  {
    INVALID_EMAIL: "כתובת המייל אינה תקינה",
    NAME_REQUIRED: "יש להזין שם מחנכת",
    CLASS_NAME_REQUIRED: "חסר שם כיתה",
    UNAUTHORIZED: "יש להתחבר מחדש",
    FORBIDDEN: "רק מנהלת או בעלת המוסד יכולה לשלוח הזמנה למחנכת",
    NOT_FOUND: "הכיתה לא נמצאה",
    EMAIL_SEND_FAILED: "שליחת ההזמנה נכשלה — נסו שוב",
    RATE_LIMITED: "נשלחו יותר מדי הזמנות — נסו שוב בעוד מספר דקות",
    INVITE_UNAVAILABLE: "שליחת ההזמנה נכשלה — נסו שוב",
    SERVER_UNAVAILABLE: "הפעולה נכשלה — נסו שוב",
    REASSIGN_CONFIRMATION_REQUIRED:
      "יש תלמידות שמשויכות למורה אחרת — נדרש אישור לפני שינוי השיוך",
    OWNER_UPDATE_FAILED: "ההזמנה נשלחה, אך שמירת שם המחנכת על הכיתה נכשלה",
  };

export function homeroomInviteErrorMessage(
  code?: HomeroomInviteErrorCode | string
): string {
  if (code && code in HOMEROOM_INVITE_ERROR_MESSAGES) {
    return HOMEROOM_INVITE_ERROR_MESSAGES[code as HomeroomInviteErrorCode];
  }
  return HOMEROOM_INVITE_ERROR_MESSAGES.INVITE_UNAVAILABLE;
}

export function homeroomInviteAssignedMessage(teacherName: string): string {
  const name = teacherName.trim();
  return name
    ? `המחנכת ${name} כבר חברה במוסד — שויכה לכיתה`
    : "המחנכת כבר חברה במוסד — שויכה לכיתה";
}

export function homeroomInviteAlreadyMemberMessage(
  teacherName: string,
  assigned: boolean
): string {
  if (assigned) return homeroomInviteAssignedMessage(teacherName);
  const name = teacherName.trim();
  return name
    ? `המחנכת ${name} כבר חברה במוסד`
    : "המחנכת כבר חברה במוסד";
}

export function homeroomInviteSentMessage(email: string): string {
  return `ההזמנה נשלחה לכתובת ${email}`;
}

export function homeroomInvitePartialSendMessage(email: string): string {
  return `כרטיס הצוות נשמר, אך שליחת ההזמנה לכתובת ${email} נכשלה — נסו שוב`;
}

/** Reuses PR #73 normalizeEmail + ASCII_EMAIL_RE. */
export function normalizeHomeroomInviteEmail(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const email = normalizeEmail(String(raw));
  if (!email || email.length < 3 || email.length > 200) return null;
  if (!ASCII_EMAIL_RE.test(email)) return null;
  return email;
}

export function assertCanInviteHomeroomTeacher(input: {
  membershipRole?: InstitutionMembershipRole | null;
  isAdmin?: boolean | null;
  isInstitutionOwner?: boolean | null;
}): HomeroomInviteErrorCode | null {
  return canInviteHomeroomTeacher(input) ? null : "FORBIDDEN";
}

/** TZ-32: owner or system is_admin only — institution admin cannot assign. */
export function canAssignHomeroomTeacher(input: {
  membershipRole?: InstitutionMembershipRole | null;
  isAdmin?: boolean | null;
}): boolean {
  return canAssignStudentsToTeachers(input.membershipRole, input.isAdmin);
}

export function decideHomeroomInvite(input: {
  rawEmail: string | null | undefined;
  teacherName: string | null | undefined;
  isMemberOfInstitution: boolean;
}): HomeroomInviteDecision {
  const teacherName = (input.teacherName ?? "").trim();
  if (!teacherName) {
    return { ok: false, error: "NAME_REQUIRED" };
  }

  const email = normalizeHomeroomInviteEmail(input.rawEmail);
  if (!email) {
    return { ok: false, error: "INVALID_EMAIL" };
  }

  if (input.isMemberOfInstitution) {
    return { ok: true, action: "assign_existing_member", email, teacherName };
  }

  return { ok: true, action: "send_invite", email, teacherName };
}

/** כרטיס צוות קיים במוסד — לפי מייל מדויק או לפי משתמש מקושר. אין ליצור כפילות. */
export function findExistingStaffCard<
  T extends {
    id: string;
    status?: string | null;
    email?: string | null;
    user_profile_id?: string | null;
    full_name?: string | null;
  },
>(
  staffCards: T[],
  opts: { email: string; userId?: string | null }
): T | null {
  const email = normalizeEmail(opts.email);
  const byUser =
    opts.userId &&
    staffCards.find(
      (card) =>
        card.status === "integration-teacher" &&
        card.user_profile_id === opts.userId
    );
  if (byUser) return byUser;

  return (
    staffCards.find(
      (card) =>
        card.status === "integration-teacher" &&
        normalizeEmail(card.email ?? "") === email
    ) ?? null
  );
}

/**
 * שם לשיוך תלמידות הכיתה — אם יש כרטיס צוות קיים משתמשים בשמו
 * כדי שהתאמת teacher_name תמשיך לעבוד אחרי ההזמנה.
 */
export function teacherNameForClassAssignment(
  enteredName: string,
  existingStaffCard: { full_name?: string | null } | null
): string {
  const fromCard = existingStaffCard?.full_name?.trim();
  if (fromCard) return fromCard;
  return enteredName.trim();
}

export function isSpecialEdClassRosterStudent(
  student: Pick<
    Student,
    | "status"
    | "notes"
    | "full_name"
    | "class_name"
    | "teacher_name"
    | "category"
    | "archived_at"
  >,
  className: string,
  category?: Category | null
): boolean {
  if (student.archived_at) return false;
  if (student.status !== "special-ed-class") return false;
  if (isClassCurriculumStudent(student)) return false;
  if (category && student.category !== category) return false;
  return (
    specialEdClassMatchKey(specialEdClassKeyFromStudent(student)) ===
    specialEdClassMatchKey(className)
  );
}

/**
 * מחזיר את תלמידות הכיתה (בלי בעל תל״כ).
 */
export function classStudentsToAssign(
  students: Student[],
  className: string,
  category?: Category | null
): Student[] {
  return students.filter((student) =>
    isSpecialEdClassRosterStudent(student, className, category)
  );
}

export type ClassAssignmentPlan<T extends { teacher_name?: string | null }> = {
  alreadyThisTeacher: T[];
  unassigned: T[];
  wouldReassign: T[];
};

export function planClassTeacherAssignment<
  T extends { teacher_name?: string | null; class_name?: string | null },
>(students: T[], teacherName: string): ClassAssignmentPlan<T> {
  const name = teacherName.trim();
  const alreadyThisTeacher: T[] = [];
  const unassigned: T[] = [];
  const wouldReassign: T[] = [];
  for (const student of students) {
    const current = student.teacher_name?.trim() ?? "";
    const classNameMissing =
      "class_name" in student && !student.class_name?.trim();
    if (!current || classNameMissing) {
      unassigned.push(student);
    } else if (personNamesMatch(current, name)) {
      alreadyThisTeacher.push(student);
    } else {
      wouldReassign.push(student);
    }
  }
  return { alreadyThisTeacher, unassigned, wouldReassign };
}

export function studentsEligibleToAssign<
  T extends { teacher_name?: string | null },
>(plan: ClassAssignmentPlan<T>, confirmReassign: boolean): T[] {
  if (confirmReassign) return [...plan.unassigned, ...plan.wouldReassign];
  return plan.unassigned;
}

export function reassignStudentViews(
  students: Array<Pick<Student, "id" | "full_name" | "teacher_name">>
): ReassignStudent[] {
  return students.map((student) => ({
    id: student.id,
    full_name: student.full_name,
    teacher_name: student.teacher_name?.trim() || "",
  }));
}

/**
 * TZ-32: כותב teacher_name רק כש-canAssignTeachers (owner / is_admin).
 */
export function assignedTeacherNameForClass(
  proposed: string,
  canAssign: boolean
): string | null {
  return teacherNameForWrite(proposed, canAssign);
}

/** Patch for the class-curriculum row — never includes email. */
export function ownerHomeroomPatch(
  teacherName: string,
  canAssign: boolean
): { homeroom_teacher: string } | null {
  if (!canAssign) return null;
  const name = teacherName.trim();
  if (!name) return null;
  return { homeroom_teacher: name };
}

export function applyTeacherNameToClassStudents<
  T extends { teacher_name?: string | null },
>(students: T[], teacherName: string): T[] {
  const name = teacherName.trim();
  return students.map((student) => ({ ...student, teacher_name: name }));
}

export async function sendHomeroomInvite(input: {
  className: string;
  category?: Category;
  teacherName: string;
  email: string;
  confirmReassign?: boolean;
}): Promise<{
  ok: boolean;
  action?: HomeroomInviteAction;
  message?: string;
  error?: HomeroomInviteErrorCode;
  studentsToReassign?: ReassignStudent[];
  partial?: boolean;
}> {
  try {
    const response = await fetch("/api/special-ed-classes/homeroom-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        className: input.className,
        category: input.category,
        teacherName: input.teacherName,
        email: input.email,
        confirmReassign: input.confirmReassign === true,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      action?: HomeroomInviteAction;
      message?: string;
      error?: HomeroomInviteErrorCode;
      studentsToReassign?: ReassignStudent[];
      partial?: boolean;
    };

    if (response.ok && payload.ok) {
      return {
        ok: true,
        action: payload.action,
        message: payload.message,
        partial: payload.partial,
      };
    }

    return {
      ok: false,
      error: payload.error ?? "INVITE_UNAVAILABLE",
      message: payload.message ?? homeroomInviteErrorMessage(payload.error),
      studentsToReassign: payload.studentsToReassign,
      partial: payload.partial,
    };
  } catch {
    return { ok: false, error: "INVITE_UNAVAILABLE" };
  }
}

export function resolveClassHomeroomTeacher(input: {
  owner?: Pick<Student, "homeroom_teacher"> | null;
  students: Array<Pick<Student, "teacher_name">>;
  staffCards: Array<Pick<Student, "full_name" | "email">>;
}): { name: string; email: string } {
  const fromOwnerName = input.owner?.homeroom_teacher?.trim() ?? "";
  const assigned =
    fromOwnerName ||
    input.students.find((s) => s.teacher_name?.trim())?.teacher_name?.trim() ||
    "";
  if (!assigned) return { name: "", email: "" };

  const staff = input.staffCards.find((card) =>
    personNamesMatch(card.full_name, assigned)
  );
  return { name: assigned, email: staff?.email?.trim() ?? "" };
}
