/**
 * Fill empty schedule header fields from the student card / fill timestamp (TZ-103).
 * Teachers often leave שם התלמיד/ה / כיתה / תאריך blank because they already
 * appear in the portfolio header — print still has to show those three values.
 *
 * Privacy: only those three keys, and only on schedule forms. Never copy
 * ID / birth date / address / phone / parents / notes onto a printed form.
 */

import type { FormSchema } from "@/lib/form-schemas";
import { resolveSchedulePrintLayout } from "@/lib/form-snapshot";
import { formatStudentDisplayName } from "@/lib/person-name";
import type { Student, StudentFormFill } from "@/lib/supabase/types";

export type PrintStudentPrefill = Pick<Student, "full_name" | "class_name">;

export function mergePrintFormDataWithStudent(
  schema: FormSchema,
  data: Record<string, string>,
  student?: PrintStudentPrefill | null,
  fill?: Pick<StudentFormFill, "updated_at" | "created_at"> &
    Partial<Pick<StudentFormFill, "document_id">> | null
): Record<string, string> {
  if (!resolveSchedulePrintLayout(schema).isSchedule) return data;
  // Signed / archived fills keep the snapshot the parent or teacher already saw.
  if (fill?.document_id) return data;
  if (!student && !fill) return data;
  const next = { ...data };

  const name = formatStudentDisplayName(student?.full_name ?? "").trim();
  if (name && !String(next.full_name ?? "").trim()) {
    next.full_name = name;
  }
  const className = String(student?.class_name ?? "").trim();
  if (className && !String(next.class_name ?? "").trim()) {
    next.class_name = className;
  }
  if (!String(next.filled_at ?? "").trim()) {
    const raw = fill?.updated_at || fill?.created_at || "";
    if (raw) next.filled_at = raw.slice(0, 10);
  }
  return next;
}
