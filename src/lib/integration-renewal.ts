import { addYears, isValid, parseISO, startOfDay, subDays } from "date-fns";
import type { Student, StudentStatus } from "@/lib/supabase/types";

/**
 * TZ-141: שילוב מחייב חידוש כל 3 שנים מתאריך הכניסה.
 * קבוע יחיד וברור — קל לעדכן כשהלקוחה תענה כמה זמן מראש להציג התראה.
 */
export const INTEGRATION_RENEWAL_PERIOD_YEARS = 3;

/** כמה ימים לפני תום 3 השנים להציג התראה בתוך המערכת (ברירת מחדל 60). */
export const INTEGRATION_RENEWAL_ALERT_LEAD_DAYS = 60;

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDateOnly(
  value: string | null | undefined
): Date | null {
  const raw = (value ?? "").trim().slice(0, 10);
  if (!ISO_DATE_ONLY.test(raw)) return null;
  const date = parseISO(raw);
  if (!isValid(date)) return null;
  return startOfDay(date);
}

export function integrationRenewalDueDate(
  entryDate: string | null | undefined
): Date | null {
  const start = parseIsoDateOnly(entryDate);
  if (!start) return null;
  return addYears(start, INTEGRATION_RENEWAL_PERIOD_YEARS);
}

export function integrationRenewalAlertStartDate(
  entryDate: string | null | undefined
): Date | null {
  const due = integrationRenewalDueDate(entryDate);
  if (!due) return null;
  return subDays(due, INTEGRATION_RENEWAL_ALERT_LEAD_DAYS);
}

export function formatIsoDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** תצוגה עברית: 2026-05-14 → 14/05/2026 */
export function formatIntegrationDateForDisplay(
  value: string | Date | null | undefined
): string {
  if (value instanceof Date) {
    if (!isValid(value)) return "";
    const [y, m, d] = formatIsoDateOnly(value).split("-");
    return `${d}/${m}/${y}`;
  }
  const date = parseIsoDateOnly(value);
  if (!date) return "";
  const [y, m, d] = formatIsoDateOnly(date).split("-");
  return `${d}/${m}/${y}`;
}

function isIntegrationStudentStatus(
  status: StudentStatus | null | undefined
): boolean {
  return status === "integration";
}

/**
 * האם להציג התראת חידוש שילוב.
 * בלי תאריך כניסה — אין התראה. תלמיד בארכיון — לא.
 * רק סטטוס שילוב (לא סל אישי / כיתה). קל להרחיב אם הלקוחה תבקש.
 */
export function studentNeedsIntegrationRenewalAlert(
  student: Pick<Student, "status" | "integration_start_date" | "archived_at">,
  today: Date = new Date()
): boolean {
  if (student.archived_at) return false;
  if (!isIntegrationStudentStatus(student.status)) return false;
  const alertStart = integrationRenewalAlertStartDate(
    student.integration_start_date
  );
  if (!alertStart) return false;
  return startOfDay(today).getTime() >= alertStart.getTime();
}

export function studentIntegrationRenewalIsOverdue(
  student: Pick<Student, "status" | "integration_start_date" | "archived_at">,
  today: Date = new Date()
): boolean {
  if (!studentNeedsIntegrationRenewalAlert(student, today)) return false;
  const due = integrationRenewalDueDate(student.integration_start_date);
  if (!due) return false;
  return startOfDay(today).getTime() >= due.getTime();
}

/** מסנן לפי הרשימה שכבר הורשתה למשתמש (מורה רואה רק את שלה, מנהלת את כולן). */
export function studentsNeedingIntegrationRenewal(
  students: Array<
    Pick<
      Student,
      "id" | "full_name" | "status" | "integration_start_date" | "archived_at"
    >
  >,
  today: Date = new Date()
): Array<
  Pick<
    Student,
    "id" | "full_name" | "status" | "integration_start_date" | "archived_at"
  >
> {
  return students.filter((student) =>
    studentNeedsIntegrationRenewalAlert(student, today)
  );
}
