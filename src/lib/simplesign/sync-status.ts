import { createServiceClient } from "@/lib/supabase/admin";
import { asStringRecord } from "@/lib/form-fill-public-data";
import {
  downloadSimpleSignFile,
  getSimpleSignSubmission,
  simpleSignSubmissionDownloadUrl,
  SimpleSignApiError,
} from "@/lib/simplesign/client";
import { getSimpleSignFormConfig } from "@/lib/simplesign/config";
import { getFormSchema } from "@/lib/form-schemas";
import {
  attachSignedPdfToSubmissions,
  findSubmissionByTokenAndSlot,
  findSubmissionsByToken,
  listSimpleSignSubmissions,
  loadStudentForInstitution,
  markSubmissionExpired,
  markSubmissionSigned,
  persistSimpleSignSignatureImages,
  recordSubmissionError,
  storeSignedPdfDocument,
  updateFormFillSignatureFromSimpleSign,
  type SimpleSignSubmissionRow,
} from "@/lib/simplesign/server-store";
import {
  formFillNeedsSimpleSignSignatureBackfill,
  parseSimpleSignSubmissionValues,
} from "@/lib/simplesign/signature-fill-values";
import {
  resolveSimpleSignPdfState,
  shouldAttemptSimpleSignPdfDownload,
  tokensNeedingSimpleSignSync,
} from "@/lib/simplesign/sync-policy";

/** מוצג לצוות בפאנל "המסמך החתום" בזמן שהקובץ עדיין מורכב אצל SimpleSign */
export const PDF_PROCESSING_MESSAGE =
  "SimpleSign מרכיבים את הקובץ החתום — הדף יבדוק שוב בעוד דקה.";

/** SimpleSign דיווחו pdf=failed — הקובץ לא ייווצר בלי התערבות שלהם */
export function pdfFailedMessage(submissionToken: string): string {
  return `SimpleSign מדווחים שהפקת הקובץ החתום נכשלה (pdf=failed). יש לפנות לתמיכה שלהם עם ה-token ${submissionToken.slice(0, 12)}…`;
}

function parseSignerEntries(
  payload: Record<string, unknown>
): Array<{ slot: number; status: string; signedAt: string | null }> {
  const raw = payload.signers;
  if (!Array.isArray(raw)) return [];
  const entries: Array<{ slot: number; status: string; signedAt: string | null }> =
    [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const slot = Number(row.slot);
    if (!Number.isInteger(slot) || slot < 1) continue;
    entries.push({
      slot,
      status: String(row.status ?? "").trim(),
      signedAt: row.signed_at ? String(row.signed_at).trim() : null,
    });
  }
  return entries;
}

export async function storeSignedPdf(
  row: SimpleSignSubmissionRow,
  downloadUrl: string
): Promise<string | null> {
  const config = getSimpleSignFormConfig(row.form_id);
  const schema = getFormSchema(row.form_id);
  const student = await loadStudentForInstitution(row.student_id);
  const folder =
    config?.signedPdfFolder ?? schema?.folder ?? schema?.categoryFolder ?? "מסמכים";
  const studentLabel = (student?.full_name ?? "תלמיד").trim() || "תלמיד";

  try {
    const pdfBytes = await downloadSimpleSignFile(downloadUrl);
    const fileName = `${schema?.title ?? row.form_id} — ${studentLabel} — SimpleSign.pdf`;
    const doc = await storeSignedPdfDocument({
      studentId: row.student_id,
      folder,
      fileName,
      pdfBytes,
      calendarYear: student?.calendar_year ?? null,
    });
    return doc.id;
  } catch (err) {
    // 409 not_signed = הקובץ עדיין בהרכבה אצל SimpleSign (השרת שלהם מפיק אותו
    // אחרי שהדפדפן של החותם לא הצליח). זו לא שגיאה — הסנכרון ינסה שוב.
    if (err instanceof SimpleSignApiError && err.status === 409) {
      console.info("[simplesign/sync] pdf not ready yet (409)", row.submission_token);
      await recordSubmissionError(row.submission_token, PDF_PROCESSING_MESSAGE);
      return null;
    }
    console.error("[simplesign/sync] pdf download/store failed", err);
    const detail =
      err instanceof SimpleSignApiError
        ? `SimpleSign ${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    await recordSubmissionError(
      row.submission_token,
      `הורדת המסמך החתום נכשלה — ${detail}`
    );
    return null;
  }
}

async function applySignedSigner(
  submissionToken: string,
  slot: number,
  signedAt: string
): Promise<void> {
  const row = await findSubmissionByTokenAndSlot(submissionToken, slot);
  if (!row || row.status === "signed") return;

  await markSubmissionSigned({
    submissionToken,
    signerSlot: slot,
    webhookDeliveryId: null,
    signedAt,
  });

  await updateFormFillSignatureFromSimpleSign({
    formFillId: row.form_fill_id,
    signatureFieldKey: row.signature_field_key,
    submissionToken,
    signedAt,
  });
}

async function syncSubmissionToken(submissionToken: string): Promise<void> {
  const payload = await getSimpleSignSubmission(submissionToken);
  const multiSigner = payload.multi_signer === true;
  const overallStatus = String(payload.status ?? "").trim();
  const downloadUrl = String(payload.download_url ?? "").trim();

  if (multiSigner) {
    for (const entry of parseSignerEntries(payload)) {
      if (entry.status === "signed" && entry.signedAt) {
        await applySignedSigner(submissionToken, entry.slot, entry.signedAt);
      }
    }
  }

  if (overallStatus === "expired") {
    await markSubmissionExpired(submissionToken);
    return;
  }

  if (!multiSigner && overallStatus === "signed") {
    const rows = await findSubmissionsByToken(submissionToken);
    const row = rows[0];
    if (!row || row.status === "signed") {
      // already handled
    } else {
      const signedAt =
        String(payload.signed_at ?? new Date().toISOString()).trim();
      await markSubmissionSigned({
        submissionToken,
        webhookDeliveryId: null,
        signedAt,
      });
      await updateFormFillSignatureFromSimpleSign({
        formFillId: row.form_fill_id,
        signatureFieldKey: row.signature_field_key,
        submissionToken,
        signedAt,
      });
    }
  }

  if (overallStatus === "signed") {
    const rows = await findSubmissionsByToken(submissionToken);
    const row = rows[0];

    const values = parseSimpleSignSubmissionValues(payload.values);
    if (row) {
      await persistSimpleSignSignatureImages({
        formFillId: row.form_fill_id,
        formId: row.form_id,
        values,
      });
    }

    if (row && !rows.every((item) => item.signed_pdf_document_id)) {
      const pdfState = resolveSimpleSignPdfState(payload);

      if (pdfState === "processing") {
        await recordSubmissionError(submissionToken, PDF_PROCESSING_MESSAGE);
        return;
      }
      if (pdfState === "failed") {
        await recordSubmissionError(
          submissionToken,
          pdfFailedMessage(submissionToken)
        );
        return;
      }
      if (!shouldAttemptSimpleSignPdfDownload(payload)) {
        return;
      }

      const url =
        downloadUrl || simpleSignSubmissionDownloadUrl(submissionToken);
      const pdfId = await storeSignedPdf(row, url);
      if (pdfId) {
        await attachSignedPdfToSubmissions(submissionToken, pdfId);
      } else {
        const signerSummary = parseSignerEntries(payload)
          .map((s) => `${s.slot}:${s.status}`)
          .join(",");
        const fresh = await findSubmissionsByToken(submissionToken);
        const baseMessage =
          (fresh.find((r) => r.error_message)?.error_message ?? "").split(" | ")[0];
        if (baseMessage === PDF_PROCESSING_MESSAGE) {
          return;
        }
        await recordSubmissionError(
          submissionToken,
          [
            baseMessage || "הורדת המסמך החתום נכשלה",
            `SimpleSign status=${overallStatus}`,
            `pdf=${String(payload.pdf ?? "n/a")}`,
            `multi_signer=${multiSigner}`,
            `download_url=${downloadUrl ? "yes" : "null"}`,
            `signed_at=${String(payload.signed_at ?? "null")}`,
            signerSummary ? `signers=${signerSummary}` : "",
          ]
            .filter(Boolean)
            .join(" | ")
        );
      }
    }
  }
}

/** מסנכרן מול SimpleSign API כש-webhook לא הגיע (למשל פיתוח מקומי) */
export async function syncPendingSimpleSignSubmissions(
  formFillId: string
): Promise<void> {
  const rows = await listSimpleSignSubmissions(formFillId);
  const pendingTokens = tokensNeedingSimpleSignSync(rows);

  for (const token of pendingTokens) {
    try {
      await syncSubmissionToken(token);
    } catch (err) {
      if (err instanceof SimpleSignApiError) {
        console.warn("[simplesign/sync]", token, err.message);
      } else {
        console.error("[simplesign/sync]", token, err);
      }
    }
  }

  const sample = rows[0];
  if (!sample) return;

  const supabase = createServiceClient();
  const { data: fill, error: fillError } = await supabase
    .from("student_form_fills")
    .select("data")
    .eq("id", formFillId)
    .maybeSingle();
  if (fillError) {
    console.error("[simplesign/sync] load fill for signature backfill", fillError);
    return;
  }
  if (
    !fill ||
    !formFillNeedsSimpleSignSignatureBackfill(
      sample.form_id,
      asStringRecord(fill.data)
    )
  ) {
    return;
  }

  for (const token of new Set(
    rows.filter((row) => row.status === "signed").map((row) => row.submission_token)
  )) {
    if (pendingTokens.includes(token)) continue;
    try {
      const payload = await getSimpleSignSubmission(token);
      await persistSimpleSignSignatureImages({
        formFillId,
        formId: sample.form_id,
        values: parseSimpleSignSubmissionValues(payload.values),
      });
    } catch (err) {
      if (err instanceof SimpleSignApiError) {
        console.warn("[simplesign/sync] signature backfill", token, err.message);
      } else {
        console.error("[simplesign/sync] signature backfill", token, err);
      }
    }
  }
}
