import {
  computeLastSentAtIso,
  isParentFormFilled,
  type StudentParentFormSendStatus,
} from "@/lib/form-parent-send-status";
import type { createServiceClient } from "@/lib/supabase/admin";
import type { FormFillStatus, Student } from "@/lib/supabase/types";
import type { StudentFormFill } from "@/lib/supabase/types";

type ServiceClient = ReturnType<typeof createServiceClient>;

function latestFillPerStudent(
  fills: StudentFormFill[]
): Map<string, StudentFormFill> {
  const byStudent = new Map<string, StudentFormFill>();
  for (const fill of fills) {
    const existing = byStudent.get(fill.student_id);
    if (
      !existing ||
      new Date(fill.updated_at).getTime() >
        new Date(existing.updated_at).getTime()
    ) {
      byStudent.set(fill.student_id, fill);
    }
  }
  return byStudent;
}

export async function fetchStudentParentFormSendStatuses(input: {
  supabase: ServiceClient;
  formId: string;
  studentIds: string[];
  studentsById: Map<string, Student>;
}): Promise<StudentParentFormSendStatus[]> {
  const { supabase, formId, studentIds, studentsById } = input;
  if (studentIds.length === 0) return [];

  const { data: fillRows, error: fillError } = await supabase
    .from("student_form_fills")
    .select("*")
    .eq("form_id", formId)
    .in("student_id", studentIds);
  if (fillError) throw new Error(fillError.message);

  const fills = (fillRows ?? []) as StudentFormFill[];
  const latestByStudent = latestFillPerStudent(fills);
  const fillIds = [...new Set([...latestByStudent.values()].map((f) => f.id))];

  const fillRequestRows =
    fillIds.length === 0
      ? []
      : (
          await supabase
            .from("form_fill_requests")
            .select("form_fill_id, created_at, status")
            .in("form_fill_id", fillIds)
        ).data ?? [];

  const signatureRequestRows =
    fillIds.length === 0
      ? []
      : (
          await supabase
            .from("form_signature_requests")
            .select("form_fill_id, created_at, status")
            .in("form_fill_id", fillIds)
        ).data ?? [];

  const simpleSignRows =
    fillIds.length === 0
      ? []
      : (
          await supabase
            .from("simplesign_submissions")
            .select("form_fill_id, created_at, status")
            .in("form_fill_id", fillIds)
        ).data ?? [];

  const fillRequestsByFillId = new Map<
    string,
    Array<{ created_at: string; status: string }>
  >();
  for (const row of fillRequestRows) {
    const fillId = String(row.form_fill_id);
    const list = fillRequestsByFillId.get(fillId) ?? [];
    list.push({
      created_at: String(row.created_at),
      status: String(row.status),
    });
    fillRequestsByFillId.set(fillId, list);
  }

  const signatureRequestsByFillId = new Map<
    string,
    Array<{ created_at: string; status: string }>
  >();
  for (const row of signatureRequestRows) {
    const fillId = String(row.form_fill_id);
    const list = signatureRequestsByFillId.get(fillId) ?? [];
    list.push({
      created_at: String(row.created_at),
      status: String(row.status),
    });
    signatureRequestsByFillId.set(fillId, list);
  }

  const simpleSignByFillId = new Map<
    string,
    Array<{ created_at: string; status: string }>
  >();
  for (const row of simpleSignRows) {
    const fillId = String(row.form_fill_id);
    const list = simpleSignByFillId.get(fillId) ?? [];
    list.push({
      created_at: String(row.created_at),
      status: String(row.status),
    });
    simpleSignByFillId.set(fillId, list);
  }

  return studentIds.map((studentId) => {
    const fill = latestByStudent.get(studentId) ?? null;
    const student = studentsById.get(studentId);
    const requestRows = fill
      ? [
          ...(fillRequestsByFillId.get(fill.id) ?? []),
          ...(signatureRequestsByFillId.get(fill.id) ?? []),
          ...(simpleSignByFillId.get(fill.id) ?? []),
        ]
      : [];
    const lastSentAt = computeLastSentAtIso(requestRows);
    const filled = isParentFormFilled({
      formId,
      fillStatus: (fill?.status ?? null) as FormFillStatus | null,
      data: fill?.data ?? null,
      singleResponsibleParty: student?.single_responsible_party,
    });
    return {
      studentId,
      formFillId: fill?.id ?? null,
      fillStatus: (fill?.status ?? null) as FormFillStatus | null,
      lastSentAt,
      filled,
    };
  });
}
