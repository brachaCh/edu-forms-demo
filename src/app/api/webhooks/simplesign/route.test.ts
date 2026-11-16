import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyRequesterDocumentSigned: vi.fn(),
  findSubmissionsByToken: vi.fn(),
  markSubmissionSigned: vi.fn(),
  updateFormFillSignatureFromSimpleSign: vi.fn(),
  findSubmissionByTokenAndSlot: vi.fn(),
  storeSignedPdf: vi.fn(),
  getSimpleSignSubmission: vi.fn(),
}));

const {
  notifyRequesterDocumentSigned,
  findSubmissionsByToken,
  markSubmissionSigned,
  updateFormFillSignatureFromSimpleSign,
  findSubmissionByTokenAndSlot,
  storeSignedPdf,
  getSimpleSignSubmission,
} = mocks;

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: () => true,
}));

vi.mock("@/lib/simplesign/signed-notification", () => ({
  notifyRequesterDocumentSigned: mocks.notifyRequesterDocumentSigned,
}));

vi.mock("@/lib/simplesign/server-store", () => ({
  findSubmissionsByToken: mocks.findSubmissionsByToken,
  findSubmissionByTokenAndSlot: mocks.findSubmissionByTokenAndSlot,
  markSubmissionSigned: mocks.markSubmissionSigned,
  updateFormFillSignatureFromSimpleSign:
    mocks.updateFormFillSignatureFromSimpleSign,
  persistSimpleSignSignatureImages: vi.fn().mockResolvedValue(undefined),
  attachSignedPdfToSubmissions: vi.fn(),
}));

vi.mock("@/lib/simplesign/sync-status", () => ({
  storeSignedPdf: mocks.storeSignedPdf,
}));

vi.mock("@/lib/simplesign/client", () => ({
  simpleSignSubmissionDownloadUrl: (token: string) =>
    `https://simplesign.test/download/${token}`,
  getSimpleSignSubmission: mocks.getSimpleSignSubmission,
  SimpleSignApiError: class SimpleSignApiError extends Error {},
}));

import { POST } from "@/app/api/webhooks/simplesign/route";

const WEBHOOK_SECRET = "test-webhook-secret";

function signBody(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function signedRequest(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  return new Request("https://app.test/api/webhooks/simplesign", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": signBody(raw),
    },
    body: raw,
  });
}

const submissionRow = {
  id: "sub-1",
  form_fill_id: "fill-1",
  form_id: "waiver",
  student_id: "student-1",
  institution_id: "inst-1",
  parent_role: "father",
  signature_field_key: "sig",
  submission_token: "tok-webhook",
  document_token: "doc",
  signer_slot: null,
  status: "pending",
  signing_url: null,
  signer_email: "parent@example.com",
  signer_name: "הורה",
  signed_pdf_document_id: "pdf-doc",
  webhook_delivery_id: null,
  error_message: null,
  created_at: "2026-01-01T00:00:00Z",
  signed_at: null,
  requested_by_user_id: "user-1",
  requester_email: null,
  requester_notified_at: null,
  teacher_notified_at: null,
};

describe("SimpleSign webhook POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SIMPLESIGN_WEBHOOK_SECRET = WEBHOOK_SECRET;
    findSubmissionsByToken.mockResolvedValue([submissionRow]);
    markSubmissionSigned.mockResolvedValue(submissionRow);
    updateFormFillSignatureFromSimpleSign.mockResolvedValue(undefined);
    storeSignedPdf.mockResolvedValue(null);
    notifyRequesterDocumentSigned.mockResolvedValue(undefined);
    getSimpleSignSubmission.mockResolvedValue({ values: null });
  });

  it("does not notify on submission.signer_signed", async () => {
    findSubmissionByTokenAndSlot.mockResolvedValue({
      ...submissionRow,
      signer_slot: 1,
      status: "pending",
    });

    const response = await POST(
      signedRequest({
        event: "submission.signer_signed",
        submission_token: "tok-webhook",
        signed_at: "2026-01-02T00:00:00Z",
        signer: { slot: 1 },
      })
    );

    expect(response.status).toBe(200);
    expect(notifyRequesterDocumentSigned).not.toHaveBeenCalled();
  });

  it("notifies once per submission.signed delivery", async () => {
    const response = await POST(
      signedRequest({
        event: "submission.signed",
        submission_token: "tok-webhook",
        signed_at: "2026-01-02T00:00:00Z",
        pdf: "ready",
        download_url: "https://simplesign.test/file.pdf",
      })
    );

    expect(response.status).toBe(200);
    expect(notifyRequesterDocumentSigned).toHaveBeenCalledTimes(1);
    expect(notifyRequesterDocumentSigned).toHaveBeenCalledWith("tok-webhook");
  });

  it("calls notify on each submission.signed webhook (idempotency in notify layer)", async () => {
    await POST(
      signedRequest({
        event: "submission.signed",
        submission_token: "tok-webhook",
        signed_at: "2026-01-02T00:00:00Z",
        pdf: "ready",
        download_url: "https://simplesign.test/file.pdf",
      })
    );
    await POST(
      signedRequest({
        event: "submission.signed",
        submission_token: "tok-webhook",
        signed_at: "2026-01-02T00:00:00Z",
        pdf: "ready",
        download_url: "https://simplesign.test/file.pdf",
      })
    );

    expect(notifyRequesterDocumentSigned).toHaveBeenCalledTimes(2);
  });

  it("fetches from API when webhook payload is missing signature field keys", async () => {
    findSubmissionsByToken.mockResolvedValue([
      { ...submissionRow, form_id: "waiver-confidentiality" },
    ]);
    getSimpleSignSubmission.mockResolvedValue({
      values: { father_signature: "ink1|100|40|1 1,2 2" },
    });

    await POST(
      signedRequest({
        event: "submission.signed",
        submission_token: "tok-webhook",
        signed_at: "2026-01-02T00:00:00Z",
        pdf: "ready",
        download_url: "https://simplesign.test/file.pdf",
        values: { some_field: "value" },
      })
    );

    expect(getSimpleSignSubmission).toHaveBeenCalledWith("tok-webhook");
  });

  it("does not fetch from API when webhook payload has signature field keys", async () => {
    findSubmissionsByToken.mockResolvedValue([
      { ...submissionRow, form_id: "waiver-confidentiality" },
    ]);

    await POST(
      signedRequest({
        event: "submission.signed",
        submission_token: "tok-webhook",
        signed_at: "2026-01-02T00:00:00Z",
        pdf: "ready",
        download_url: "https://simplesign.test/file.pdf",
        values: { father_signature: "ink1|100|40|1 1,2 2", mother_signature: "ink1|100|40|3 3" },
      })
    );

    expect(getSimpleSignSubmission).not.toHaveBeenCalled();
  });
});
