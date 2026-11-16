import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  getSimpleSignSubmission,
  simpleSignSubmissionDownloadUrl,
  SimpleSignApiError,
} from "@/lib/simplesign/client";
import {
  attachSignedPdfToSubmissions,
  findSubmissionByTokenAndSlot,
  findSubmissionsByToken,
  markSubmissionSigned,
  persistSimpleSignSignatureImages,
  updateFormFillSignatureFromSimpleSign,
} from "@/lib/simplesign/server-store";
import {
  parseSimpleSignSubmissionValues,
  simpleSignSignatureFieldKeys,
} from "@/lib/simplesign/signature-fill-values";
import { notifyRequesterDocumentSigned } from "@/lib/simplesign/signed-notification";
import { storeSignedPdf } from "@/lib/simplesign/sync-status";
import { resolveSimpleSignPdfState } from "@/lib/simplesign/sync-policy";

export const runtime = "nodejs";

function verifySimpleSignWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.SIMPLESIGN_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = (signatureHeader ?? "").trim();
  if (!got || expected.length !== got.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}

function parseSignerSlot(payload: Record<string, unknown>): number | null {
  const signer = payload.signer;
  if (!signer || typeof signer !== "object" || Array.isArray(signer)) return null;
  const slot = Number((signer as Record<string, unknown>).slot);
  return Number.isInteger(slot) && slot > 0 ? slot : null;
}

async function loadSimpleSignSubmissionValues(
  submissionToken: string,
  formId: string,
  payload: Record<string, unknown>
): Promise<Record<string, string> | null> {
  const fromWebhook = parseSimpleSignSubmissionValues(payload.values);
  const signatureKeys = simpleSignSignatureFieldKeys(formId);
  const missingSignatureKeys =
    signatureKeys.length > 0 &&
    signatureKeys.some((key) => !fromWebhook?.[key]);

  if (fromWebhook && !missingSignatureKeys) return fromWebhook;

  try {
    const remote = await getSimpleSignSubmission(submissionToken);
    const fromApi = parseSimpleSignSubmissionValues(remote.values);
    if (!fromApi) return fromWebhook;
    return fromWebhook ? { ...fromWebhook, ...fromApi } : fromApi;
  } catch (err) {
    console.warn("[simplesign/webhook] could not load submission values", err);
    return fromWebhook;
  }
}

async function persistSimpleSignSignatureImagesForToken(
  submissionToken: string,
  row: { form_fill_id: string; form_id: string },
  payload: Record<string, unknown>
): Promise<void> {
  const values = await loadSimpleSignSubmissionValues(
    submissionToken,
    row.form_id,
    payload
  );
  await persistSimpleSignSignatureImages({
    formFillId: row.form_fill_id,
    formId: row.form_id,
    values,
  });
}

async function processSignerSignedWebhook(
  payload: Record<string, unknown>,
  webhookDeliveryId: string | null
): Promise<void> {
  const submissionToken = String(payload.submission_token ?? "").trim();
  const signedAt = String(payload.signed_at ?? new Date().toISOString()).trim();
  const slot = parseSignerSlot(payload);
  if (!submissionToken || slot == null) return;

  const row = await findSubmissionByTokenAndSlot(submissionToken, slot);
  if (!row) {
    console.warn(
      "[simplesign/webhook] unknown multi-signer submission",
      submissionToken,
      slot
    );
    return;
  }
  if (row.status === "signed") return;

  await markSubmissionSigned({
    submissionToken,
    signerSlot: slot,
    webhookDeliveryId,
    signedAt,
  });

  await updateFormFillSignatureFromSimpleSign({
    formFillId: row.form_fill_id,
    signatureFieldKey: row.signature_field_key,
    submissionToken,
    signedAt,
  });
}

async function processFormSignedWebhook(
  payload: Record<string, unknown>,
  webhookDeliveryId: string | null
): Promise<void> {
  const submissionToken = String(payload.submission_token ?? "").trim();
  const signedAt = String(payload.signed_at ?? new Date().toISOString()).trim();
  const downloadUrl = String(payload.download_url ?? "").trim();
  if (!submissionToken) return;

  const rows = await findSubmissionsByToken(submissionToken);
  if (rows.length === 0) {
    console.warn("[simplesign/webhook] unknown submission", submissionToken);
    return;
  }

  const isMultiSigner =
    rows.some((row) => row.signer_slot != null) || rows.length > 1;

  // אידמפוטנטי: SimpleSign שולח webhooks חוזרים — אם ה-PDF כבר נשמר, לא מורידים
  // ולא יוצרים מסמך כפול בתיקיית התלמיד.
  let signedPdfDocumentId: string | null =
    rows.find((row) => row.signed_pdf_document_id)?.signed_pdf_document_id ??
    null;
  // אם ה-webhook מדווח במפורש שהקובץ עדיין בהרכבה (pdf=processing) או שאין
  // download_url — לא מנסים להוריד עכשיו; הסנכרון בטעינת הטופס ישלים כשיהיה מוכן.
  const pdfState = resolveSimpleSignPdfState(payload);
  const pdfMayBeReady =
    pdfState === "ready" ||
    // webhook ישן בלי שדה pdf: download_url=null פירושו "אין עדיין מה להוריד"
    (pdfState === "legacy" &&
      (Boolean(downloadUrl) || !("download_url" in payload)));
  if (!signedPdfDocumentId && pdfMayBeReady) {
    const pdfUrl =
      downloadUrl || simpleSignSubmissionDownloadUrl(submissionToken);
    signedPdfDocumentId = await storeSignedPdf(rows[0]!, pdfUrl);
  }
  if (
    signedPdfDocumentId &&
    rows.some((row) => row.signed_pdf_document_id !== signedPdfDocumentId)
  ) {
    await attachSignedPdfToSubmissions(submissionToken, signedPdfDocumentId);
  }

  if (!isMultiSigner) {
    const row = rows[0]!;
    if (row.status !== "signed") {
      await markSubmissionSigned({
        submissionToken,
        webhookDeliveryId,
        signedAt,
        signedPdfDocumentId,
      });

      await updateFormFillSignatureFromSimpleSign({
        formFillId: row.form_fill_id,
        signatureFieldKey: row.signature_field_key,
        submissionToken,
        signedAt,
      });
    }
    await persistSimpleSignSignatureImagesForToken(submissionToken, row, payload);
    await notifyRequesterDocumentSigned(submissionToken);
    return;
  }

  // רב-חותמים: `submission.signed` אומר שכולם חתמו. אם webhook של `signer_signed`
  // הוחמץ, משלימים כאן את הסימון של החותמים שעדיין pending.
  for (const row of rows) {
    if (row.status === "signed" || row.signer_slot == null) continue;
    await markSubmissionSigned({
      submissionToken,
      signerSlot: row.signer_slot,
      webhookDeliveryId,
      signedAt,
    });
    await updateFormFillSignatureFromSimpleSign({
      formFillId: row.form_fill_id,
      signatureFieldKey: row.signature_field_key,
      submissionToken,
      signedAt,
    });
  }

  await persistSimpleSignSignatureImagesForToken(
    submissionToken,
    rows[0]!,
    payload
  );

  await notifyRequesterDocumentSigned(submissionToken);
}

async function processSignedWebhook(
  payload: Record<string, unknown>,
  webhookDeliveryId: string | null
): Promise<void> {
  const event = String(payload.event ?? "").trim();

  if (event === "submission.signer_signed") {
    await processSignerSignedWebhook(payload, webhookDeliveryId);
    return;
  }

  if (event === "submission.signed") {
    await processFormSignedWebhook(payload, webhookDeliveryId);
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  if (!verifySimpleSignWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const deliveryId = request.headers.get("x-delivery-id")?.trim() ?? null;

  try {
    await processSignedWebhook(payload, deliveryId);
  } catch (err) {
    if (err instanceof SimpleSignApiError) {
      console.error("[simplesign/webhook]", err.message);
    } else {
      console.error("[simplesign/webhook]", err);
    }
  }

  return NextResponse.json({ ok: true });
}
