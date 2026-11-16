import { describe, expect, it } from "vitest";
import {
  buildFormFillLinkEmailBodies,
  buildFormFillOtpEmailBodies,
} from "./form-fill-otp-email";

describe("buildFormFillOtpEmailBodies", () => {
  it("includes the 6-digit code and form-fill wording, not login copy", () => {
    const { text, html } = buildFormFillOtpEmailBodies("123456");
    expect(text).toContain("123456");
    expect(html).toContain("123456");
    expect(text).toMatch(/מילוי/);
    expect(text).not.toMatch(/קוד הכניסה שלכם לפרוטוקל/);
    expect(html).not.toMatch(/קוד הכניסה שלכם לפרוטוקל/);
  });
});

describe("buildFormFillLinkEmailBodies", () => {
  it("includes the personal fill link and expiry, not login copy", () => {
    const { subject, text, html } = buildFormFillLinkEmailBodies({
      formTitle: "שאלון הורים",
      studentName: "הדס",
      note: "נא למלא",
      link: "https://example.com/fill/token",
      expiryDays: 14,
    });
    expect(subject).toMatch(/שאלון הורים/);
    expect(text).toContain("https://example.com/fill/token");
    expect(html).toContain("https://example.com/fill/token");
    expect(html).toContain("הדס");
    expect(html).toContain("נא למלא");
    expect(text).toMatch(/14/);
    expect(text).not.toMatch(/קוד הכניסה שלכם לפרוטוקל/);
  });
});
