import { createServiceClient } from "@/lib/supabase/admin";
import { resolveDocumentCalendarYear } from "@/lib/calendar-year";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { formatStudentDisplayName } from "@/lib/person-name";
import { formSupportsSimpleSign } from "@/lib/simplesign/config";
import { storeSignedPdfDocument } from "@/lib/simplesign/server-store";
import { asStringRecord } from "@/lib/form-fill-public-data";
import {
  allSignatureFieldsFilled,
  signedArchiveFileName,
} from "@/lib/form-signed-archive";
import { buildSignedFormPdf } from "@/lib/form-signed-pdf";

export async function archiveSignedFormIfComplete(
  formFillId: string
): Promise<{ archived: boolean; skipped?: string }> {
  const supabase = createServiceClient();
  const { data: fill, error: fillError } = await supabase
    .from("student_form_fills")
    .select("id, student_id, form_id, data")
    .eq("id", formFillId)
    .maybeSingle();

  if (fillError) throw new Error(fillError.message);
  if (!fill) return { archived: false, skipped: "missing_fill" };

  const formId = String(fill.form_id ?? "");
  // רק כשהטופס באמת נחתם ב-SimpleSign (מפתח API + document_token מוגדרים) ה-PDF
  // מגיע מה-webhook. טופס מהרשימה בלי הגדרות SimpleSign נחתם במתוה — ומארכבים כאן.
  if (formSupportsSimpleSign(formId)) {
    return { archived: false, skipped: "simplesign" };
  }

  const schema = getFormSchema(formId);
  if (!schema) return { archived: false, skipped: "missing_schema" };

  const signatureKeys = listFormFields(schema)
    .filter((field) => field.type === "signature")
    .map((field) => field.key);
  const data = asStringRecord(fill.data);
  if (!allSignatureFieldsFilled(signatureKeys, data)) {
    return { archived: false, skipped: "incomplete" };
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, full_name, calendar_year")
    .eq("id", fill.student_id)
    .maybeSingle();
  if (studentError) throw new Error(studentError.message);
  if (!student) return { archived: false, skipped: "missing_student" };

  const studentName = formatStudentDisplayName(student.full_name);
  const fileName = signedArchiveFileName(schema.title, studentName);
  const folder = schema.categoryFolder || schema.folder;
  const calendarYear = resolveDocumentCalendarYear({
    calendar_year: student.calendar_year ?? null,
    fallbackYear: student.calendar_year ?? null,
  });

  const { data: existing, error: existingError } = await supabase
    .from("student_documents")
    .select("id")
    .eq("student_id", student.id)
    .eq("folder", folder)
    .eq("name", fileName)
    .eq("calendar_year", calendarYear)
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  if (existing && existing.length > 0) return { archived: false, skipped: "exists" };

  const pdfBytes = await buildSignedFormPdf({ schema, data, studentName });
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  await storeSignedPdfDocument({
    studentId: student.id,
    folder,
    fileName,
    pdfBytes: copy.buffer,
    calendarYear: student.calendar_year ?? calendarYear,
  });
  return { archived: true };
}
