import { createServiceClient } from "@/lib/supabase/admin";
import { mergeFormFillData } from "@/lib/form-fill-data-server";
import { asStringRecord } from "@/lib/form-fill-public-data";
import { buildSimpleSignSignedMarker } from "@/lib/simplesign/constants";
import { buildSignatureInkPatchFromSimpleSignValues } from "@/lib/simplesign/signature-fill-values";
import { formatStudentDisplayName, personNamesMatch } from "@/lib/person-name";
import { checkUserInstitutionMembership } from "@/lib/user-institutions";
import type { StudentDocument } from "@/lib/supabase/types";
import { resolveDocumentCalendarYear } from "@/lib/calendar-year";

export interface SimpleSignSubmissionRow {
  id: string;
  form_fill_id: string;
  form_id: string;
  student_id: string;
  institution_id: string | null;
  parent_role: string;
  signature_field_key: string;
  submission_token: string;
  document_token: string;
  signer_slot: number | null;
  status: string;
  signing_url: string | null;
  signer_email: string;
  signer_name: string;
  signed_pdf_document_id: string | null;
  webhook_delivery_id: string | null;
  error_message: string | null;
  created_at: string;
  signed_at: string | null;
  requested_by_user_id: string | null;
  requester_email: string | null;
  requester_notified_at: string | null;
  teacher_notified_at: string | null;
}

export async function insertSimpleSignSubmission(row: {
  formFillId: string;
  formId: string;
  studentId: string;
  institutionId: string | null;
  parentRole: string;
  signatureFieldKey: string;
  submissionToken: string;
  documentToken: string;
  signingUrl: string;
  signerEmail: string;
  signerName: string;
  signerSlot?: number | null;
  requestedByUserId?: string | null;
  requesterEmail?: string | null;
}): Promise<SimpleSignSubmissionRow> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("simplesign_submissions")
    .insert({
      form_fill_id: row.formFillId,
      form_id: row.formId,
      student_id: row.studentId,
      institution_id: row.institutionId,
      parent_role: row.parentRole,
      signature_field_key: row.signatureFieldKey,
      submission_token: row.submissionToken,
      document_token: row.documentToken,
      signing_url: row.signingUrl,
      signer_email: row.signerEmail,
      signer_name: row.signerName,
      signer_slot: row.signerSlot ?? null,
      requested_by_user_id: row.requestedByUserId ?? null,
      requester_email: row.requesterEmail?.trim().toLowerCase() || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "insert simplesign_submissions failed");
  }
  return data as SimpleSignSubmissionRow;
}

export async function listSimpleSignSubmissions(
  formFillId: string
): Promise<SimpleSignSubmissionRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("simplesign_submissions")
    .select("*")
    .eq("form_fill_id", formFillId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SimpleSignSubmissionRow[];
}

export async function findSubmissionByToken(
  submissionToken: string
): Promise<SimpleSignSubmissionRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("simplesign_submissions")
    .select("*")
    .eq("submission_token", submissionToken)
    .order("signer_slot", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as SimpleSignSubmissionRow | null) ?? null;
}

export async function findSubmissionsByToken(
  submissionToken: string
): Promise<SimpleSignSubmissionRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("simplesign_submissions")
    .select("*")
    .eq("submission_token", submissionToken)
    .order("signer_slot", { ascending: true, nullsFirst: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SimpleSignSubmissionRow[];
}

export async function findSubmissionByTokenAndSlot(
  submissionToken: string,
  signerSlot: number
): Promise<SimpleSignSubmissionRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("simplesign_submissions")
    .select("*")
    .eq("submission_token", submissionToken)
    .eq("signer_slot", signerSlot)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as SimpleSignSubmissionRow | null) ?? null;
}

export async function markSubmissionSigned(input: {
  submissionToken: string;
  signerSlot?: number | null;
  webhookDeliveryId: string | null;
  signedAt: string;
  signedPdfDocumentId?: string | null;
}): Promise<SimpleSignSubmissionRow | null> {
  const supabase = createServiceClient();
  let query = supabase
    .from("simplesign_submissions")
    .update({
      status: "signed",
      signed_at: input.signedAt,
      webhook_delivery_id: input.webhookDeliveryId,
      ...(input.signedPdfDocumentId !== undefined
        ? { signed_pdf_document_id: input.signedPdfDocumentId }
        : {}),
    })
    .eq("submission_token", input.submissionToken)
    .eq("status", "pending");

  if (input.signerSlot != null) {
    query = query.eq("signer_slot", input.signerSlot);
  }

  const { data, error } = await query.select("*").maybeSingle();

  if (error) throw new Error(error.message);
  return (data as SimpleSignSubmissionRow | null) ?? null;
}

export async function attachSignedPdfToSubmissions(
  submissionToken: string,
  signedPdfDocumentId: string | null
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("simplesign_submissions")
    .update({ signed_pdf_document_id: signedPdfDocumentId, error_message: null })
    .eq("submission_token", submissionToken);

  if (error) throw new Error(error.message);
}

/**
 * שומר את סיבת הכישלון של הורדת/שמירת ה-PDF החתום, כדי שהיא תהיה גלויה
 * לצוות ובבדיקות — ולא רק ב-console של השרת.
 */
export async function recordSubmissionError(
  submissionToken: string,
  message: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("simplesign_submissions")
    .update({ error_message: message.slice(0, 500) })
    .eq("submission_token", submissionToken);

  if (error) {
    console.error("[simplesign] recordSubmissionError failed", error.message);
  }
}

export async function loadFormFillForSigning(formFillId: string): Promise<{
  id: string;
  student_id: string;
  form_id: string;
  data: Record<string, string>;
  status: string;
} | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("student_form_fills")
    .select("id, student_id, form_id, data, status")
    .eq("id", formFillId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    student_id: String(data.student_id),
    form_id: String(data.form_id),
    data: (data.data as Record<string, string>) ?? {},
    status: String(data.status ?? "draft"),
  };
}

export async function loadInstitutionDisplayName(
  institutionId: string
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("institutions")
    .select("name, school_name")
    .eq("id", institutionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const schoolName = String(data.school_name ?? "").trim();
  const name = String(data.name ?? "").trim();
  return schoolName || name || null;
}

export async function loadStudentForInstitution(
  studentId: string
): Promise<{
  id: string;
  institution_id: string | null;
  full_name: string | null;
  father_name: string | null;
  mother_name: string | null;
  email: string | null;
  calendar_year: number | null;
  single_responsible_party: boolean | null;
  teacher_name: string | null;
} | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, institution_id, full_name, father_name, mother_name, email, calendar_year, single_responsible_party, teacher_name"
    )
    .eq("id", studentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as {
    id: string;
    institution_id: string | null;
    full_name: string | null;
    father_name: string | null;
    mother_name: string | null;
    email: string | null;
    calendar_year: number | null;
    single_responsible_party: boolean | null;
    teacher_name: string | null;
  };
}

/** כרטיס צוות במוסד ששם המלא שלו תואם ל־teacher_name בתלמיד */
export async function findStaffCardForTeacherName(
  institutionId: string,
  teacherName: string
): Promise<{
  id: string;
  full_name: string | null;
  user_profile_id: string | null;
} | null> {
  const needle = teacherName.trim();
  if (!needle) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, user_profile_id")
    .eq("institution_id", institutionId)
    .eq("status", "integration-teacher")
    .is("archived_at", null);

  if (error) throw new Error(error.message);
  const cards = (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    user_profile_id: string | null;
  }>;
  const matches = cards.filter((card) =>
    personNamesMatch(formatStudentDisplayName(card.full_name), needle)
  );

  if (matches.length !== 1) {
    if (matches.length > 1) {
      console.warn(
        "[simplesign/staff-card] multiple staff cards matched responsible teacher lookup"
      );
    } else {
      console.warn(
        "[simplesign/staff-card] no staff card matched responsible teacher lookup"
      );
    }
    return null;
  }

  const match = matches[0]!;
  const userId = match.user_profile_id?.trim();
  if (!userId) return null;

  const membership = await checkUserInstitutionMembership(userId, institutionId);
  if (!membership.isMember || membership.dbError) {
    return null;
  }

  return match;
}

export async function updateFormFillSignatureFromSimpleSign(input: {
  formFillId: string;
  signatureFieldKey: string;
  submissionToken: string;
  signedAt: string;
}): Promise<void> {
  const supabase = createServiceClient();
  // מיזוג אטומי — שני webhooks של חותמים שונים לא דורסים זה את זה
  await mergeFormFillData(supabase, input.formFillId, {
    [input.signatureFieldKey]: buildSimpleSignSignedMarker(
      input.submissionToken,
      input.signedAt
    ),
  });
}

/** מחליף סימון SimpleSign בחתימת ink/svg מתוך values של SimpleSign (webhook או GET submission) */
export async function persistSimpleSignSignatureImages(input: {
  formFillId: string;
  formId: string;
  values: Record<string, string> | null;
}): Promise<void> {
  if (!input.values || Object.keys(input.values).length === 0) return;

  const supabase = createServiceClient();
  const { data: fill, error } = await supabase
    .from("student_form_fills")
    .select("data")
    .eq("id", input.formFillId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!fill) return;

  const patch = await buildSignatureInkPatchFromSimpleSignValues(
    input.formId,
    input.values,
    asStringRecord(fill.data)
  );
  if (Object.keys(patch).length === 0) return;
  await mergeFormFillData(supabase, input.formFillId, patch);
}

export async function storeSignedPdfDocument(input: {
  studentId: string;
  folder: string;
  fileName: string;
  pdfBytes: ArrayBuffer;
  calendarYear?: number | null;
}): Promise<StudentDocument> {
  const supabase = createServiceClient();
  const bytes = new Uint8Array(input.pdfBytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = btoa(binary);
  const dataUrl = `data:application/pdf;base64,${base64}`;
  const calendarYear = resolveDocumentCalendarYear({
    calendar_year: input.calendarYear ?? null,
    fallbackYear: input.calendarYear ?? null,
  });

  const base = {
    student_id: input.studentId,
    name: input.fileName,
    folder: input.folder,
    mime_type: "application/pdf",
    size: bytes.length,
    data_url: dataUrl,
    calendar_year: calendarYear,
    archived_at: null,
  };

  const { data, error } = await supabase
    .from("student_documents")
    .insert(base)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "insert signed pdf failed");
  }
  return data as StudentDocument;
}

/** מחזיר את ה-PDF החתום ש-SimpleSign החזיר (מתיקיית המסמכים של התלמיד) */
export async function loadSignedPdfDocument(
  documentId: string
): Promise<{ name: string; bytes: Uint8Array; studentId: string } | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("student_documents")
    .select("id, student_id, name, mime_type, data_url")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const dataUrl = String(data.data_url ?? "");
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) return null;
  const meta = dataUrl.slice(5, comma);
  if (!meta.includes(";base64")) return null;
  const bytes = new Uint8Array(Buffer.from(dataUrl.slice(comma + 1), "base64"));
  if (bytes.length === 0) return null;

  return {
    name: String(data.name ?? "signed.pdf"),
    bytes,
    studentId: String(data.student_id),
  };
}

export async function loadUserProfileContact(
  userId: string
): Promise<{ email: string | null; fullName: string } | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    email: typeof data.email === "string" ? data.email : null,
    fullName: String(data.full_name ?? "").trim(),
  };
}

/** מסמן שהתרעה נשלחה — רק אם עדיין לא סומנה, כדי למנוע כפילות */
export async function claimRequesterNotification(
  submissionToken: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("simplesign_submissions")
    .update({ requester_notified_at: new Date().toISOString() })
    .eq("submission_token", submissionToken)
    .is("requester_notified_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function clearRequesterNotificationClaim(
  submissionToken: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("simplesign_submissions")
    .update({ requester_notified_at: null })
    .eq("submission_token", submissionToken);

  if (error) throw new Error(error.message);
}

/** מסמן שהתרעה למורה האחראית נשלחה — רק אם עדיין לא סומנה */
export async function claimTeacherNotification(
  submissionToken: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("simplesign_submissions")
    .update({ teacher_notified_at: new Date().toISOString() })
    .eq("submission_token", submissionToken)
    .is("teacher_notified_at", null)
    .select("id");

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function clearTeacherNotificationClaim(
  submissionToken: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("simplesign_submissions")
    .update({ teacher_notified_at: null })
    .eq("submission_token", submissionToken);

  if (error) throw new Error(error.message);
}

export async function markSubmissionExpired(
  submissionToken: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("simplesign_submissions")
    .update({ status: "expired" })
    .eq("submission_token", submissionToken)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
}

export async function replaceExpiredSubmission(input: {
  oldSubmissionToken: string;
  newSubmissionToken: string;
  newSigningUrl: string;
  signatureFieldKey: string;
}): Promise<SimpleSignSubmissionRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("simplesign_submissions")
    .update({
      submission_token: input.newSubmissionToken,
      signing_url: input.newSigningUrl,
      status: "pending",
      error_message: null,
      renewing_started_at: null,
    })
    .eq("submission_token", input.oldSubmissionToken)
    .eq("signature_field_key", input.signatureFieldKey)
    .in("status", ["expired", "pending", "renewing"])
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as SimpleSignSubmissionRow | null) ?? null;
}

const RENEWING_TIMEOUT_MS = 5 * 60 * 1000;

export async function markSubmissionRenewing(
  submissionToken: string,
  signatureFieldKey: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const staleThreshold = new Date(Date.now() - RENEWING_TIMEOUT_MS).toISOString();

  const { data: expiredData, error: expiredError } = await supabase
    .from("simplesign_submissions")
    .update({ status: "renewing", renewing_started_at: new Date().toISOString() })
    .eq("submission_token", submissionToken)
    .eq("signature_field_key", signatureFieldKey)
    .eq("status", "expired")
    .select("id");

  if (expiredError) throw new Error(expiredError.message);
  if (expiredData && expiredData.length > 0) return true;

  const { data: staleData, error: staleError } = await supabase
    .from("simplesign_submissions")
    .update({ status: "renewing", renewing_started_at: new Date().toISOString() })
    .eq("submission_token", submissionToken)
    .eq("signature_field_key", signatureFieldKey)
    .eq("status", "renewing")
    .or(`renewing_started_at.is.null,renewing_started_at.lt.${staleThreshold}`)
    .select("id");

  if (staleError) throw new Error(staleError.message);
  return (staleData?.length ?? 0) > 0;
}

export async function markAllSubmissionsRenewing(
  submissionToken: string,
  signatureFieldKeys: string[]
): Promise<string[]> {
  const markedKeys: string[] = [];
  for (const key of signatureFieldKeys) {
    const marked = await markSubmissionRenewing(submissionToken, key);
    if (marked) markedKeys.push(key);
  }
  return markedKeys;
}

export async function revertRenewingToExpired(
  submissionToken: string,
  signatureFieldKey: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("simplesign_submissions")
    .update({ status: "expired", renewing_started_at: null })
    .eq("submission_token", submissionToken)
    .eq("signature_field_key", signatureFieldKey)
    .eq("status", "renewing");

  if (error) {
    console.error("[simplesign] revertRenewingToExpired failed:", error.message);
  }
}

export async function revertAllRenewingToExpired(
  submissionToken: string,
  signatureFieldKeys: string[]
): Promise<void> {
  for (const key of signatureFieldKeys) {
    await revertRenewingToExpired(submissionToken, key);
  }
}

export function isStaleRenewing(row: { status: string; renewing_started_at?: string | null }): boolean {
  if (row.status !== "renewing") return false;
  if (!row.renewing_started_at) return true;
  const startedAt = new Date(row.renewing_started_at).getTime();
  return Date.now() - startedAt > RENEWING_TIMEOUT_MS;
}

export async function replaceExpiredSubmissionMultiSigner(input: {
  oldSubmissionToken: string;
  newSubmissionToken: string;
  signerUpdates: Array<{ signatureFieldKey: string; signingUrl: string; signerSlot: number }>;
  lockedKeys: string[];
}): Promise<number> {
  const supabase = createServiceClient();
  let updatedCount = 0;

  for (const update of input.signerUpdates) {
    if (!input.lockedKeys.includes(update.signatureFieldKey)) {
      continue;
    }
    const { data, error } = await supabase
      .from("simplesign_submissions")
      .update({
        submission_token: input.newSubmissionToken,
        signing_url: update.signingUrl,
        signer_slot: update.signerSlot,
        status: "pending",
        error_message: null,
        renewing_started_at: null,
      })
      .eq("submission_token", input.oldSubmissionToken)
      .eq("signature_field_key", update.signatureFieldKey)
      .eq("status", "renewing")
      .select("id");

    if (error) throw new Error(error.message);
    if (data && data.length > 0) updatedCount += 1;
  }

  return updatedCount;
}
