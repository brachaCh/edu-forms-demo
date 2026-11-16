import { describe, expect, it } from "vitest";
import { hashFormFillToken, maskRecipientEmail } from "@/lib/form-fill-otp";
import {
  FORM_SIGNATURE_OTP_COOKIE,
  FORM_SIGNATURE_TOKEN_RE,
  newFormSignatureOtpSessionToken,
} from "./form-signature-otp";

describe("form-signature OTP helpers", () => {
  it("reuses fill-token hashing and email masking", async () => {
    expect(await hashFormFillToken("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    );
    expect(maskRecipientEmail("parent@example.com")).toBe("p***@example.com");
  });

  it("uses a dedicated cookie name", () => {
    expect(FORM_SIGNATURE_OTP_COOKIE).toBe("form_signature_otp");
  });

  it("generates a high-entropy session token", () => {
    const token = newFormSignatureOtpSessionToken();
    expect(token).toMatch(FORM_SIGNATURE_TOKEN_RE);
    expect(newFormSignatureOtpSessionToken()).not.toBe(token);
  });
});
