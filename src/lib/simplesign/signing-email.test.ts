import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSignedNotificationEmailContent,
  mapResendErrorToHebrew,
  resolveSchoolYearLabel,
  sendSimpleSignSignedNotificationEmail,
  sendSimpleSignSigningEmail,
  type ResendResult,
} from "@/lib/simplesign/signing-email";

describe("resolveSchoolYearLabel", () => {
  it("prefers school_year from form data", () => {
    expect(
      resolveSchoolYearLabel({ school_year: "תשפ״ו" }, 5787)
    ).toBe("תשפ״ו");
  });

  it("falls back to student calendar year", () => {
    expect(resolveSchoolYearLabel({}, 5786)).toBe('תשפ"ו');
  });

  it("accepts year from form data", () => {
    expect(resolveSchoolYearLabel({ year: "תשפ״ז" }, 5786)).toBe("תשפ״ז");
  });
});

describe("buildSignedNotificationEmailContent", () => {
  it("includes form, student, signers and escaped html", () => {
    const mail = buildSignedNotificationEmailContent({
      recipientName: "רבקה",
      formTitle: "ויתור סודיות",
      studentName: 'נועה <script>alert("x")</script>',
      institutionName: "בית ספר",
      signerNames: ["דנה כהן", " יוסי כהן "],
      formUrl: "https://example.com/form",
    });

    expect(mail.subject).toBe("המסמך נחתם: ויתור סודיות");
    expect(mail.text).toContain("שלום רבקה,");
    expect(mail.text).toContain("דנה כהן, יוסי כהן");
    expect(mail.text).toContain("https://example.com/form");
    expect(mail.html).toContain("לצפייה בטופס");
    expect(mail.html).toContain("https://example.com/form");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("omits signer line when names are empty", () => {
    const mail = buildSignedNotificationEmailContent({
      recipientName: "",
      formTitle: "תח״י",
      studentName: "תלמיד",
      institutionName: "",
      signerNames: ["  ", ""],
      formUrl: "https://example.com/form",
    });

    expect(mail.text).toContain("שלום,");
    expect(mail.text).not.toContain("חותמים:");
    expect(mail.html).not.toContain("חותמים:");
  });
});

describe("sendSimpleSignSignedNotificationEmail idempotency keys", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("keeps the legacy requester key and uses a teacher-specific key", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal(
      "fetch",
      fetchMock.mockResolvedValue({ ok: true, text: async () => "" })
    );

    const base = {
      to: "a@example.com",
      recipientName: "שולח",
      formTitle: "טופס",
      studentName: "תלמיד",
      institutionName: "מוסד",
      signerNames: ["חותם"],
      formUrl: "https://example.com/form",
      submissionToken: "tok-xyz",
    };

    await sendSimpleSignSignedNotificationEmail({
      ...base,
      recipientRole: "requester",
    });
    await sendSimpleSignSignedNotificationEmail({
      ...base,
      to: "b@example.com",
      recipientRole: "teacher",
    });

    const keys = fetchMock.mock.calls.map(
      (call) =>
        (call[1] as { headers: Record<string, string> }).headers[
          "Idempotency-Key"
        ]
    );
    expect(keys).toEqual([
      "simplesign-signed/tok-xyz",
      "simplesign-signed/teacher/tok-xyz",
    ]);
  });
});

describe("mapResendErrorToHebrew", () => {
  it("returns empty for successful result", () => {
    expect(mapResendErrorToHebrew({ sent: true })).toBe("");
  });

  it("maps invalid email error (422)", () => {
    const result: ResendResult = {
      sent: false,
      status: 422,
      detail: '{"message":"Invalid `to` field. The email address contains non-ASCII characters"}',
    };
    expect(mapResendErrorToHebrew(result)).toBe(
      "כתובת המייל לא תקינה — יש לעדכן אותה בכרטיס התלמידה"
    );
  });

  it("maps invalid email error (400)", () => {
    const result: ResendResult = {
      sent: false,
      status: 400,
      detail: '{"message":"Invalid `to` field. Invalid email address format"}',
    };
    expect(mapResendErrorToHebrew(result)).toBe(
      "כתובת המייל לא תקינה — יש לעדכן אותה בכרטיס התלמידה"
    );
  });

  it("maps invalid from field to generic error", () => {
    const result: ResendResult = {
      sent: false,
      status: 422,
      detail: '{"message":"Invalid `from` field. Invalid RESEND_FROM_EMAIL"}',
    };
    expect(mapResendErrorToHebrew(result)).toBe(
      "השליחה נכשלה — נסו שוב או פנו לתמיכה"
    );
  });

  it("maps rate limit error (429)", () => {
    const result: ResendResult = {
      sent: false,
      status: 429,
      detail: '{"message":"Too many requests"}',
    };
    expect(mapResendErrorToHebrew(result)).toBe("נסו שוב בעוד דקה");
  });

  it("maps missing API key error (401)", () => {
    const result: ResendResult = {
      sent: false,
      status: 401,
      detail: '{"message":"Unauthorized"}',
    };
    expect(mapResendErrorToHebrew(result)).toBe("שגיאה בהגדרות השרת — פנו לתמיכה");
  });

  it("maps missing API key error (503 missing_api_key)", () => {
    const result: ResendResult = {
      sent: false,
      status: 503,
      detail: "missing_api_key",
    };
    expect(mapResendErrorToHebrew(result)).toBe("שגיאה בהגדרות השרת — פנו לתמיכה");
  });

  it("returns generic error for unknown status", () => {
    const result: ResendResult = {
      sent: false,
      status: 500,
      detail: '{"message":"Internal server error"}',
    };
    expect(mapResendErrorToHebrew(result)).toBe("השליחה נכשלה — נסו שוב או פנו לתמיכה");
  });
});

describe("sendSimpleSignSigningEmail Resend errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  it("logs and returns Resend error with status", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () =>
          '{"message":"Invalid `to` field. The email address contains non-ASCII characters"}',
      })
    );

    const result = await sendSimpleSignSigningEmail({
      to: "אם@example.com",
      signerName: "האם",
      formTitle: "ויתור סודיות",
      studentName: "תלמיד",
      institutionName: "מוסד",
      schoolYearLabel: "תשפ״ו",
      fieldLabel: "חתימת האם",
      signingUrl: "https://sign.example/abc",
    });

    expect(result.sent).toBe(false);
    if (!result.sent) {
      expect(result.status).toBe(422);
      expect(result.detail).toContain("non-ASCII");
    }
    expect(errorSpy).toHaveBeenCalledWith(
      "[simplesign/signing-email] resend failed:",
      422,
      expect.stringContaining("non-ASCII")
    );
  });

  it("returns 503 and logs when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendSimpleSignSigningEmail({
      to: "test@example.com",
      signerName: "חותם",
      formTitle: "טופס",
      studentName: "תלמיד",
      institutionName: "מוסד",
      schoolYearLabel: "תשפ״ו",
      fieldLabel: "חתימה",
      signingUrl: "https://sign.example/abc",
    });

    expect(result.sent).toBe(false);
    if (!result.sent) {
      expect(result.status).toBe(503);
      expect(result.detail).toBe("missing_api_key");
    }
    expect(errorSpy).toHaveBeenCalledWith(
      "[simplesign/signing-email] missing RESEND_API_KEY"
    );
  });
});
