/** העברת תלמיד משילוב לסל אישי — שומר מסמכים, מעדכן סטטוס ושכיחות */

import {
  loadStudentFormFill,
  saveStudentFormFill,
  updateStudent,
} from "@/lib/mock-store";
import type { IntegrationFrequency, Student } from "@/lib/supabase/types";
import { normalizeIntegrationFrequency } from "@/lib/integration-frequency";
import { personalBasketScheduleBase } from "@/lib/staff-schedule-sync";

export type TransferToPersonalBasketError =
  | "not_found"
  | "not_integration"
  | "update_failed";

export type TransferToPersonalBasketResult =
  | { ok: true; student: Student }
  | { ok: false; error: TransferToPersonalBasketError };

export function canTransferToPersonalBasket(
  student: Pick<Student, "status"> | null | undefined
): boolean {
  return student?.status === "integration";
}

function scheduleDataHasCells(data: Record<string, string>): boolean {
  return Object.entries(data).some(
    ([key, value]) => key.startsWith("sched_") && String(value ?? "").trim()
  );
}

/**
 * TZ-75: מעתיק מערכת שעות משילוב (schedule) למערכת האישית של סל אישי.
 * לא דורס תאים שכבר מולאו בטופס האישי.
 */
export async function copyIntegrationScheduleToPersonalBasket(
  studentId: string
): Promise<boolean> {
  const [personal, detailed, simple] = await Promise.all([
    loadStudentFormFill(studentId, "personal-schedule"),
    loadStudentFormFill(studentId, "schedule-detailed"),
    loadStudentFormFill(studentId, "schedule"),
  ]);
  const merged = personalBasketScheduleBase({ personal, detailed, simple });
  if (personal) return false;
  if (!scheduleDataHasCells(merged) && !detailed) return false;

  await saveStudentFormFill({
    studentId,
    formId: "personal-schedule",
    data: merged,
    status: detailed?.status ?? "draft",
  });
  return true;
}

/**
 * מעביר תלמיד משילוב לסל אישי.
 * המסמכים והתיקיות נשארים; כפתורי הטפסים מתעדכנים לפי תבנית סל אישי.
 * TZ-75: מערכת השעות משילוב מועתקת אוטומטית למערכת האישית.
 */
export async function transferStudentToPersonalBasket(
  student: Student,
  frequency: IntegrationFrequency = "high"
): Promise<TransferToPersonalBasketResult> {
  if (!student?.id) return { ok: false, error: "not_found" };
  if (student.status !== "integration") {
    return { ok: false, error: "not_integration" };
  }

  const nextFrequency =
    normalizeIntegrationFrequency(frequency) ??
    normalizeIntegrationFrequency(student.integration_frequency) ??
    "high";

  const updated = await updateStudent(student.id, {
    status: "personal-basket",
    integration_frequency: nextFrequency,
  });

  if (!updated) return { ok: false, error: "update_failed" };

  try {
    await copyIntegrationScheduleToPersonalBasket(student.id);
  } catch {
    // ההעברה הצליחה; סנכרון המערכת הוא השלמה ולא חוסם
  }

  return { ok: true, student: updated };
}
