export function tokensNeedingSimpleSignSync(
  rows: Array<{
    status: string;
    submission_token: string;
    signed_pdf_document_id?: string | null;
  }>
): string[] {
  return [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.status === "pending" ||
            (row.status === "signed" && !row.signed_pdf_document_id)
        )
        .map((row) => row.submission_token)
    ),
  ];
}

/**
 * מצב הקובץ החתום לפי `GET /submissions/{token}` של SimpleSign.
 *
 * מאז 09/2026 התשובה כוללת שדה `pdf` נפרד מ-`status`:
 *   null        — עדיין לא נחתם
 *   processing  — נחתם, הקובץ בהרכבה בשרת (לנסות שוב בעוד דקה)
 *   ready       — הקובץ קיים, `download_url` מלא
 *   failed      — עבר זמן ואין קובץ — לפנות לתמיכה
 *
 * תשובות ישנות (בלי `pdf`) מקבלות `legacy` — אז מנסים להוריד כמו קודם.
 */
export type SimpleSignPdfState =
  | "not_signed"
  | "processing"
  | "ready"
  | "failed"
  | "legacy";

export function resolveSimpleSignPdfState(
  payload: Record<string, unknown>
): SimpleSignPdfState {
  if (!("pdf" in payload)) {
    // API ישן — נסמכים על download_url / status
    return "legacy";
  }
  const raw = payload.pdf;
  if (raw === null || raw === undefined || raw === "") return "not_signed";
  const value = String(raw).trim().toLowerCase();
  if (value === "processing" || value === "ready" || value === "failed") {
    return value;
  }
  return "legacy";
}

/** האם לנסות להוריד את ה-PDF עכשיו (ולא לחכות לסבב הבא) */
export function shouldAttemptSimpleSignPdfDownload(
  payload: Record<string, unknown>
): boolean {
  const state = resolveSimpleSignPdfState(payload);
  if (state === "ready") return true;
  if (state === "legacy") {
    return String(payload.status ?? "").trim() === "signed";
  }
  return false;
}

export function shouldPollSimpleSignSync(
  submissions: Array<{ status: string; signedPdfStored?: boolean }>
): boolean {
  return submissions.some(
    (row) =>
      row.status === "pending" ||
      (row.status === "signed" && !row.signedPdfStored)
  );
}
