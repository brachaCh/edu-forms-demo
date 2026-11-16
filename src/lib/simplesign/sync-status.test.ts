import { describe, expect, it } from "vitest";

import {
  resolveSimpleSignPdfState,
  shouldAttemptSimpleSignPdfDownload,
  shouldPollSimpleSignSync,
  tokensNeedingSimpleSignSync,
} from "@/lib/simplesign/sync-policy";

describe("resolveSimpleSignPdfState", () => {
  it("maps the documented pdf values", () => {
    expect(resolveSimpleSignPdfState({ pdf: null })).toBe("not_signed");
    expect(resolveSimpleSignPdfState({ pdf: "processing" })).toBe("processing");
    expect(resolveSimpleSignPdfState({ pdf: "ready" })).toBe("ready");
    expect(resolveSimpleSignPdfState({ pdf: "failed" })).toBe("failed");
  });

  it("falls back to legacy when the pdf field is missing or unknown", () => {
    expect(resolveSimpleSignPdfState({ status: "signed" })).toBe("legacy");
    expect(resolveSimpleSignPdfState({ pdf: "something-new" })).toBe("legacy");
  });
});

describe("shouldAttemptSimpleSignPdfDownload", () => {
  it("downloads only when the file is ready", () => {
    expect(
      shouldAttemptSimpleSignPdfDownload({
        status: "signed",
        pdf: "ready",
        download_url: "https://simplesign.co.il/api/v1/submissions/t/download",
      })
    ).toBe(true);
  });

  it("waits while SimpleSign is still assembling the file", () => {
    expect(
      shouldAttemptSimpleSignPdfDownload({
        status: "signed",
        pdf: "processing",
        download_url: null,
      })
    ).toBe(false);
  });

  it("does not hammer the download endpoint after a reported failure", () => {
    expect(
      shouldAttemptSimpleSignPdfDownload({
        status: "signed",
        pdf: "failed",
        download_url: null,
      })
    ).toBe(false);
  });

  it("keeps the old behaviour for responses without a pdf field", () => {
    expect(shouldAttemptSimpleSignPdfDownload({ status: "signed" })).toBe(true);
    expect(shouldAttemptSimpleSignPdfDownload({ status: "pending" })).toBe(false);
  });
});

describe("tokensNeedingSimpleSignSync", () => {
  it("retries signed submissions that never stored a PDF", () => {
    expect(
      tokensNeedingSimpleSignSync([
        {
          status: "signed",
          submission_token: "tok-1",
          signed_pdf_document_id: null,
        },
        {
          status: "signed",
          submission_token: "tok-1",
          signed_pdf_document_id: null,
        },
      ])
    ).toEqual(["tok-1"]);
  });

  it("skips signed submissions that already have a PDF", () => {
    expect(
      tokensNeedingSimpleSignSync([
        {
          status: "signed",
          submission_token: "tok-ready",
          signed_pdf_document_id: "doc-1",
        },
      ])
    ).toEqual([]);
  });

  it("still syncs pending tokens", () => {
    expect(
      tokensNeedingSimpleSignSync([
        {
          status: "pending",
          submission_token: "tok-pending",
          signed_pdf_document_id: null,
        },
      ])
    ).toEqual(["tok-pending"]);
  });
});

describe("shouldPollSimpleSignSync", () => {
  it("keeps polling after both signers finish until the PDF is stored", () => {
    expect(
      shouldPollSimpleSignSync([
        { status: "signed", signedPdfStored: false },
        { status: "signed", signedPdfStored: false },
      ])
    ).toBe(true);
  });

  it("stops polling once the signed PDF is stored", () => {
    expect(
      shouldPollSimpleSignSync([
        { status: "signed", signedPdfStored: true },
        { status: "signed", signedPdfStored: true },
      ])
    ).toBe(false);
  });
});
