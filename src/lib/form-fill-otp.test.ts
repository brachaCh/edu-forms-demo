import { describe, expect, it } from "vitest";
import {
  FORM_FILL_OTP_COOKIE,
  FORM_FILL_TOKEN_RE,
  hashFormFillToken,
  maskRecipientEmail,
  newFormFillOtpSessionToken,
} from "./form-fill-otp";

describe("maskRecipientEmail", () => {
  it("masks the local part and keeps the domain", () => {
    expect(maskRecipientEmail("parent@example.com")).toBe("p***@example.com");
  });

  it("still masks a one-character local part", () => {
    expect(maskRecipientEmail("a@b.co")).toBe("a***@b.co");
  });

  it("returns a generic mask for invalid input", () => {
    expect(maskRecipientEmail("")).toBe("***");
    expect(maskRecipientEmail("not-an-email")).toBe("***");
  });
});

describe("hashFormFillToken", () => {
  it("returns a stable SHA-256 hex digest", async () => {
    const first = await hashFormFillToken("test");
    const second = await hashFormFillToken("test");
    expect(first).toBe(second);
    expect(first).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    );
  });
});

describe("form-fill OTP session token", () => {
  it("uses a dedicated cookie name", () => {
    expect(FORM_FILL_OTP_COOKIE).toBe("form_fill_otp");
  });

  it("generates a high-entropy token matching the fill-token alphabet", () => {
    const token = newFormFillOtpSessionToken();
    expect(token).toMatch(FORM_FILL_TOKEN_RE);
    expect(newFormFillOtpSessionToken()).not.toBe(token);
  });
});
