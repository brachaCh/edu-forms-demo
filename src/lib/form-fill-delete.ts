import { asStringRecord } from "@/lib/form-fill-public-data";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { allSignatureFieldsFilled } from "@/lib/form-signed-archive";
import type { StudentFormFill } from "@/lib/supabase/types";

export type FormFillSimpleSignGuardRow = {
  status?: string | null;
  signed_pdf_document_id?: string | null;
  signedPdfDocumentId?: string | null;
  signedPdfStored?: boolean | null;
};

export const FORM_FILL_SIGNED_DELETE_BLOCKED = "FORM_FILL_SIGNED_DELETE_BLOCKED";
export const FORM_FILL_NOT_FOUND = "FORM_FILL_NOT_FOUND";
export const FORM_FILL_DELETE_NOT_ALLOWED = "FORM_FILL_DELETE_NOT_ALLOWED";

/** טפסי תיקייה שמורשים למחיקת מילוי (תח״י / תל״א וכו׳) */
export const DELETABLE_PORTFOLIO_FORM_IDS = new Set([
  "tachi",
  "tachi-integrative",
  "tla",
  "tla-integrative",
]);

export function isDeletablePortfolioFormId(formId: string): boolean {
  return DELETABLE_PORTFOLIO_FORM_IDS.has(formId);
}

/** מסמך שנשמר כעותק חוקי חתום — לא למחיקה */
export function isSignedArchiveDocumentName(name: string | null | undefined): boolean {
  return String(name ?? "").includes(" — חתום");
}

export function formFillIsLegallySigned(fill: StudentFormFill): boolean {
  const schema = getFormSchema(fill.form_id);
  if (!schema) return false;
  const signatureKeys = listFormFields(schema)
    .filter((field) => field.type === "signature")
    .map((field) => field.key);
  if (signatureKeys.length === 0) return false;
  return allSignatureFieldsFilled(signatureKeys, asStringRecord(fill.data ?? {}));
}

export function simpleSignBlocksFormFillDelete(
  rows: FormFillSimpleSignGuardRow[]
): boolean {
  return rows.some((row) => {
    const status = String(row.status ?? "");
    const pdfId = row.signed_pdf_document_id ?? row.signedPdfDocumentId ?? null;
    return status === "signed" || Boolean(pdfId) || Boolean(row.signedPdfStored);
  });
}

export function portfolioFormFillListLabel(
  formId: string,
  options: { ordinal: number; domain?: string | null }
): string {
  const ordinal = options.ordinal;
  let base: string;
  switch (formId) {
    case "tachi-integrative":
      base = `תח״י אינטגרטיבי ${ordinal}`;
      break;
    case "tla-integrative":
      base = `תל״א אינטגרטיבי ${ordinal}`;
      break;
    case "tla":
      base = `תל״א ${ordinal}`;
      break;
    default:
      base = `תח״י ${ordinal}`;
  }
  const domain = String(options.domain ?? "").trim();
  return domain ? `${base} · ${domain}` : base;
}

export function formFillDeletionBlocked(
  fill: StudentFormFill,
  options?: {
    linkedDocumentName?: string | null;
    linkedDocumentIsPaperWaiver?: boolean | null;
    simpleSignRows?: FormFillSimpleSignGuardRow[];
  }
): boolean {
  if (formFillIsLegallySigned(fill)) return true;
  const docName = options?.linkedDocumentName;
  if (docName && isSignedArchiveDocumentName(docName)) return true;
  if (options?.linkedDocumentIsPaperWaiver === true) return true;
  if (options?.simpleSignRows?.length) {
    return simpleSignBlocksFormFillDelete(options.simpleSignRows);
  }
  return false;
}

export function formFillDeleteErrorMessage(code: string): string {
  switch (code) {
    case FORM_FILL_SIGNED_DELETE_BLOCKED:
      return "לא ניתן למחוק תוכנית חינוכית שכל החתימות הנדרשות כבר נחתמו. עותק חתום נשמר בתיקיית התלמיד.";
    case FORM_FILL_NOT_FOUND:
      return "הטופס לא נמצא.";
    case FORM_FILL_DELETE_NOT_ALLOWED:
      return "לא ניתן למחוק סוג טופס זה מהמערכת.";
    default:
      return "מחיקת התוכנית נכשלה — נסו שוב.";
  }
}
