import { getDocumentRole, getDocumentSlot } from "@/lib/folder-actions";
import {
  getFormSchema,
  getFormSchemaByFolder,
  studentPortfolioFillHref,
} from "@/lib/form-schemas";
import { isFreeAccessMode } from "@/lib/free-access";
import {
  getStudentFormFill,
  getStudentDocuments,
  getStudents,
  loadStudentFormFill,
} from "@/lib/mock-store";
import { hasPaperWaiverScanInDocs } from "@/lib/paper-waiver-scan";
import {
  getDefaultFolderActionLabels,
  getPortfolioFolderButtonDefs,
} from "@/lib/portfolio-folder-templates";
import { isClassCurriculumStudent } from "@/lib/special-ed-mode";
import {
  studentPortfolioFolderHref,
  studentPortfolioFormsHref,
} from "@/lib/student-portfolio";

/** טופס ויתור הסודיות הראשי — חובה לפני שאר הטפסים */
export const CONFIDENTIALITY_WAIVER_FORM_ID = "waiver-confidentiality";
export const CONFIDENTIALITY_WAIVER_LABEL = "טופס ויתור סודיות";
export const CONFIDENTIALITY_WAIVER_LABEL_SIGNED = "טופס ויתור סודיות חתום";
export const CONFIDENTIALITY_WAIVER_GROUP = "ויתור סודיות";
export const EXTRA_DOCUMENTS_FOLDER = "מסמכים נוספים";

function isWaiverFolderLabel(label: string): boolean {
  return (
    label === CONFIDENTIALITY_WAIVER_GROUP ||
    label === CONFIDENTIALITY_WAIVER_LABEL ||
    label === CONFIDENTIALITY_WAIVER_LABEL_SIGNED
  );
}

/**
 * נתיבים שמותרים גם בלי ויתור חתום:
 * כניסה לקבוצת ויתור סודיות + מילוי טופס ויתור הסודיות עצמו.
 */
export function isConfidentialityWaiverExempt(opts: {
  targetLabel?: string;
  formId?: string;
}): boolean {
  const formId = opts.formId?.trim();
  if (formId === CONFIDENTIALITY_WAIVER_FORM_ID) return true;

  const label = (opts.targetLabel ?? "").trim();
  if (!label) return false;
  return isWaiverFolderLabel(label);
}

/** Built-in staff-details table — the only form that skips the waiver. */
export const STUDENT_TEAM_DETAILS_FORM_ID = "student-team-details";

const STAFF_DETAILS_TEMPLATE_PARENT = "אינפורמציה כללית";
const STAFF_DETAILS_TEMPLATE_STATUSES = [
  "personal-basket",
  "special-ed-class",
  "integration",
  null,
] as const;

/**
 * Official tile/folder labels for the built-in staff-details form.
 * Taken from that form's own schema (folder/title) plus official
 * template buttons that open it — not from getFormSchemaByFolder(userLabel).
 */
function officialStaffDetailsLabels(): Set<string> {
  const schema = getFormSchema(STUDENT_TEAM_DETAILS_FORM_ID);
  const labels = new Set<string>();
  if (!schema || schema.id !== STUDENT_TEAM_DETAILS_FORM_ID) return labels;
  if (schema.folder.trim()) labels.add(schema.folder.trim());
  if (schema.title.trim()) labels.add(schema.title.trim());
  for (const status of STAFF_DETAILS_TEMPLATE_STATUSES) {
    for (const label of getDefaultFolderActionLabels(
      STAFF_DETAILS_TEMPLATE_PARENT,
      status
    )) {
      const resolved = getFormSchemaByFolder(label, status);
      if (resolved?.id === STUDENT_TEAM_DETAILS_FORM_ID) {
        labels.add(label);
      }
    }
  }
  return labels;
}

/**
 * Built-in `student-team-details` formId from the schema definition.
 * A custom formId, or a label that is not an official staff-details
 * slot, does not resolve.
 */
export function officialStaffDetailsFormIdForAccess(opts: {
  formId?: string;
  targetLabel?: string;
}): string | undefined {
  const schema = getFormSchema(STUDENT_TEAM_DETAILS_FORM_ID);
  if (!schema || schema.id !== STUDENT_TEAM_DETAILS_FORM_ID) return undefined;
  if (opts.formId?.trim()) {
    return opts.formId.trim() === schema.id ? schema.id : undefined;
  }
  const label = (opts.targetLabel ?? "").trim();
  if (!label) return undefined;
  return officialStaffDetailsLabels().has(label) ? schema.id : undefined;
}

/**
 * TZ-73: טבלת «פרטי צוות תלמיד» אינה מידע סודי —
 * רק הטופס המובנה `student-team-details` נפתח בלי ויתור. תווית התיקייה לא פוטרת.
 */
export function isNonConfidentialStaffDetailsTarget(opts: {
  targetLabel?: string;
  formId?: string;
}): boolean {
  return opts.formId?.trim() === STUDENT_TEAM_DETAILS_FORM_ID;
}

export function isConfidentialityWaiverFormId(
  formId: string | null | undefined
): boolean {
  return (formId ?? "").trim() === CONFIDENTIALITY_WAIVER_FORM_ID;
}

function hasSignedValue(value: string | undefined): boolean {
  // כולל סימון SimpleSign: simplesign:signed:…|submission_token
  return Boolean(String(value ?? "").trim());
}

/**
 * TZ-30: בודק אם התלמיד מסומן כבעל אחראי יחיד (חד הורי / יתום / אפוטרופוס יחיד).
 * כשמסומן TRUE, נדרשת חתימה אחת בלבד לויתור הסודיות.
 */
export function isSingleResponsiblePartyStudent(studentId: string): boolean {
  const student = getStudents().find((s) => s.id === studentId);
  return student?.single_responsible_party === true;
}

/**
 * TZ-30: מספר החתימות שנאספו על טופס ויתור הסודיות.
 */
export function countWaiverSignatures(studentId: string): number {
  const fill = getStudentFormFill(studentId, CONFIDENTIALITY_WAIVER_FORM_ID);
  if (!fill?.data) return 0;
  let count = 0;
  if (hasSignedValue(fill.data.father_signature)) count++;
  if (hasSignedValue(fill.data.mother_signature)) count++;
  return count;
}

/**
 * TZ-30: מספר החתימות הנדרשות לויתור הסודיות.
 * אחראי יחיד → 1, אחרת → 2.
 */
export function requiredWaiverSignatureCount(studentId: string): number {
  return isSingleResponsiblePartyStudent(studentId) ? 1 : 2;
}

/**
 * TZ-30/TZ-22: האם כל החתימות הנדרשות לויתור הסודיות נאספו?
 * משמש גם להתרעת המורה האחראית (TZ-22) וגם לפתיחת שאר הטפסים.
 */
export function hasAllRequiredWaiverSignatures(studentId: string): boolean {
  const required = requiredWaiverSignatureCount(studentId);
  const collected = countWaiverSignatures(studentId);
  return collected >= required;
}

/**
 * שני ההורים חתמו דיגיטלית על טופס ויתור הסודיות.
 * @deprecated Use hasAllRequiredWaiverSignatures instead (TZ-30)
 */
export function hasBothParentWaiverSignatures(studentId: string): boolean {
  const fill = getStudentFormFill(studentId, CONFIDENTIALITY_WAIVER_FORM_ID);
  if (!fill?.data) return false;
  return (
    hasSignedValue(fill.data.father_signature) &&
    hasSignedValue(fill.data.mother_signature)
  );
}

const EXTRA_DOCUMENTS_NUMBERED_RE = /^מסמכים נוספים \(\d+\)$/;

/**
 * יעד ששייך ל«מסמכים נוספים» — התיקייה עצמה, כפתורי התבנית, או טופס עם categoryFolder תואם.
 * לא משתמשים ב־parentFolder מפרמטר URL — רק בשם היעד / categoryFolder של הטופס.
 */
export function isExtraDocumentsTarget(opts: {
  targetLabel?: string;
  formId?: string;
}): boolean {
  const label = (opts.targetLabel ?? "").trim();
  if (label === EXTRA_DOCUMENTS_FOLDER) return true;
  if (EXTRA_DOCUMENTS_NUMBERED_RE.test(label)) return true;

  const formId = opts.formId?.trim();
  if (formId) {
    const byId = getFormSchema(formId);
    if (byId) {
      if (byId.categoryFolder === EXTRA_DOCUMENTS_FOLDER) return true;
      return false;
    }
  }

  if (label) {
    const byFolder = getFormSchemaByFolder(label);
    if (byFolder?.categoryFolder === EXTRA_DOCUMENTS_FOLDER) return true;
  }

  return false;
}

/**
 * העלאת עותק חתום בתיקיית ויתור — רק לחינוך מיוחד כיתתי.
 * לא נחשב ארכיון מילוי דיגיטלי (שנשמר גם בלי חתימות הורים).
 */
function hasSpecialEdSignedWaiverUpload(studentId: string): boolean {
  const student = getStudents().find((s) => s.id === studentId);
  if (student?.status !== "special-ed-class") return false;

  return getStudentDocuments(studentId).some((doc) => {
    const folder = (doc.folder || "").trim();
    const slot = (getDocumentSlot(doc.id) || "").trim();
    if (!isWaiverFolderLabel(folder) && !isWaiverFolderLabel(slot)) {
      return false;
    }
    return (
      getDocumentRole(doc.id) === "upload" &&
      (Boolean(doc.data_url) || Boolean(doc.name?.trim()))
    );
  });
}

/** TZ-99: סריקה חתומה שהועלתה במפורש כוויתור נייר — לכל הסטטוסים. */
export function hasPaperWaiverScan(studentId: string): boolean {
  return hasPaperWaiverScanInDocs(getStudentDocuments(studentId));
}

/**
 * ויתור סודיות הושלם לפתיחת שאר הטפסים:
 * - חתימות דיגיטליות נדרשות (שתיים, או אחת לאחראי יחיד)
 * - TZ-99: סריקה חתומה שהועלתה על ידי צוות (כל סטטוס)
 * - חינוך מיוחד כיתתי: גם העלאת עותק חתום בתיקיית הויתור (לא ארכיון מילוי)
 */
export function isConfidentialityWaiverCompleted(studentId: string): boolean {
  if (hasAllRequiredWaiverSignatures(studentId)) return true;
  if (hasPaperWaiverScan(studentId)) return true;
  return hasSpecialEdSignedWaiverUpload(studentId);
}

/**
 * טוען מילוי ומסמכים מהשרת ואז בודק — מונע דיאלוג שווא לפני שה־cache מתמלא.
 *
 * TZ-99: If the documents fetch fails, we still check digital signatures.
 * A paper scan won't count until documents load successfully, but a completed
 * digital waiver should not be blocked by a transient documents fetch failure.
 */
export async function loadConfidentialityWaiverCompleted(
  studentId: string
): Promise<boolean> {
  const { ensureStudentDocuments } = await import("@/lib/data-cache");
  const documentsPromise = ensureStudentDocuments(studentId).catch(() => {
    // Documents fetch failed — we'll decide based on digital signatures alone.
    // Paper scan won't count until documents load successfully.
  });
  await Promise.all([
    loadStudentFormFill(studentId, CONFIDENTIALITY_WAIVER_FORM_ID),
    documentsPromise,
  ]);
  return isConfidentialityWaiverCompleted(studentId);
}

export function canAccessPortfolioDocuments(
  studentId: string,
  opts: { targetLabel?: string; formId?: string; parentFolder?: string } = {}
): boolean {
  // Uploads stay behind the waiver — staff-details formId never unlocks them.
  const formId =
    opts.formId?.trim() === STUDENT_TEAM_DETAILS_FORM_ID
      ? undefined
      : opts.formId;
  return canAccessPortfolioForm(studentId, {
    targetLabel: opts.targetLabel,
    formId,
    parentFolder: opts.parentFolder,
  });
}

export function canAccessPortfolioForm(
  studentId: string,
  opts: { targetLabel?: string; formId?: string; parentFolder?: string }
): boolean {
  // בכניסה חופשית — לא חוסמים צפייה; רק מציגים הודעה על חתימת שני ההורים
  if (isFreeAccessMode()) return true;
  if (isConfidentialityWaiverExempt(opts)) return true;
  if (isNonConfidentialStaffDetailsTarget(opts)) return true;
  // TZ-162: מסמכים נוספים — פתוח תמיד בלי ויתור סודיות
  if (isExtraDocumentsTarget(opts)) return true;
  // תל"כ כיתתי — לא דורש ויתור סודיות של תלמיד
  const student = getStudents().find((s) => s.id === studentId);
  if (student && isClassCurriculumStudent(student)) return true;
  // כרטיס איש צוות — מערכת שעות צוות ללא ויתור סודיות
  if (
    student?.status === "integration-teacher" &&
    opts.formId?.trim() === "staff-schedule"
  ) {
    return true;
  }
  return isConfidentialityWaiverCompleted(studentId);
}

export async function loadCanAccessPortfolioForm(
  studentId: string,
  opts: { targetLabel?: string; formId?: string; parentFolder?: string }
): Promise<boolean> {
  if (isFreeAccessMode()) return true;
  if (isConfidentialityWaiverExempt(opts)) return true;
  if (isNonConfidentialStaffDetailsTarget(opts)) return true;
  // TZ-162: מסמכים נוספים — פתוח תמיד בלי ויתור סודיות
  if (isExtraDocumentsTarget(opts)) return true;
  const student = getStudents().find((s) => s.id === studentId);
  if (student && isClassCurriculumStudent(student)) return true;
  if (
    student?.status === "integration-teacher" &&
    opts.formId?.trim() === "staff-schedule"
  ) {
    return true;
  }
  await loadConfidentialityWaiverCompleted(studentId);
  return canAccessPortfolioForm(studentId, opts);
}

export function confidentialityWaiverFormsHref(studentId: string): string {
  const student = getStudents().find((s) => s.id === studentId);
  if (student?.status === "special-ed-class") {
    return studentPortfolioFormsHref(
      studentId,
      CONFIDENTIALITY_WAIVER_LABEL_SIGNED
    );
  }
  return studentPortfolioFormsHref(studentId, CONFIDENTIALITY_WAIVER_LABEL);
}

export function confidentialityWaiverFillHref(studentId: string): string {
  return studentPortfolioFillHref(studentId, CONFIDENTIALITY_WAIVER_FORM_ID);
}

export function confidentialityWaiverGroupHref(studentId: string): string {
  return studentPortfolioFolderHref(studentId, CONFIDENTIALITY_WAIVER_GROUP);
}
