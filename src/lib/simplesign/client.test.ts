import { describe, expect, it } from "vitest";

import {
  serializeMultiSignerSubmissionBody,
  simpleSignSubmissionDownloadUrl,
} from "@/lib/simplesign/client";

describe("serializeMultiSignerSubmissionBody", () => {
  it("sends shared fields in top-level prefill and per-signer fields under signers", () => {
    const body = serializeMultiSignerSubmissionBody({
      documentToken: "a71",
      prefill: { student_name: "נועה כהן", class: "ה׳2" },
      signers: [
        {
          slot: 1,
          signerName: "דנה כהן",
          signerEmail: "dana@example.com",
          prefill: { full_name: "דנה כהן" },
        },
        {
          slot: 2,
          signerName: "יוסי כהן",
          signerEmail: "yossi@example.com",
          prefill: {},
        },
      ],
    });

    expect(body).toEqual({
      lock_prefill: true,
      send_email: false,
      prefill: { student_name: "נועה כהן", class: "ה׳2" },
      signers: [
        {
          slot: 1,
          signer_name: "דנה כהן",
          signer_email: "dana@example.com",
          prefill: { full_name: "דנה כהן" },
        },
        {
          slot: 2,
          signer_name: "יוסי כהן",
          signer_email: "yossi@example.com",
          prefill: {},
        },
      ],
    });
    expect(body).not.toHaveProperty("signer_name");
    expect(body).not.toHaveProperty("signer_email");
    expect(body).not.toHaveProperty("signer_phone");
  });

  it("omits top-level prefill when there are no shared fields", () => {
    const body = serializeMultiSignerSubmissionBody({
      documentToken: "a71",
      signers: [
        {
          slot: 1,
          signerName: "דנה כהן",
          signerEmail: "dana@example.com",
          prefill: { full_name: "דנה כהן" },
        },
      ],
    });

    expect(body).not.toHaveProperty("prefill");
    expect(body.signers[0]?.prefill).toEqual({ full_name: "דנה כהן" });
  });
});

describe("simpleSignSubmissionDownloadUrl", () => {
  it("uses the documented SimpleSign download endpoint", () => {
    expect(simpleSignSubmissionDownloadUrl("4b8token")).toBe(
      "https://simplesign.co.il/api/v1/submissions/4b8token/download"
    );
  });
});
