import { afterEach, describe, expect, it, vi } from "vitest";
import type { RateLimitQuery } from "@/lib/email-rate-limit";
import { PROBLEM_REPORT_OWNER_EMAIL } from "@/lib/email-recipients";
import { PROBLEM_REPORT_DESCRIPTION_MAX } from "./constants";
import { submitProblemReport } from "./submit";

function allowQuery(): RateLimitQuery {
  return {
    read: async () => ({ row: null, errorMessage: null }),
    write: async () => ({ errorMessage: null }),
  };
}

function limitedQuery(): RateLimitQuery {
  const nowIso = new Date().toISOString();
  return {
    read: async () => ({
      row: { window_start: nowIso, hit_count: 5 },
      errorMessage: null,
    }),
    write: async () => ({ errorMessage: null }),
  };
}

const baseInput = {
  reporterEmail: "teacher@school.il",
  description: "השמירה נכשלה",
  pagePath: "/personal-area",
  browser: "Mozilla/5.0",
  userId: "user-1",
};

describe("submitProblemReport", () => {
  const originalPlatformAdmins = process.env.PLATFORM_ADMIN_EMAILS;

  afterEach(() => {
    if (originalPlatformAdmins === undefined) {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    } else {
      process.env.PLATFORM_ADMIN_EMAILS = originalPlatformAdmins;
    }
  });

  it("requires a non-empty description (TZ-112 regression)", async () => {
    const createBug = vi.fn();
    const sendMail = vi.fn();

    for (const desc of ["", "   ", "\n\t  "]) {
      const result = await submitProblemReport(
        { ...baseInput, description: desc },
        { rateLimitQuery: allowQuery(), createBug, sendMail }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    }
    expect(createBug).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects invalid-looking traffic via the honeypot without opening a ticket", async () => {
    const createBug = vi.fn();
    const sendMail = vi.fn();
    const result = await submitProblemReport(
      { ...baseInput, website: "http://spam.test" },
      { rateLimitQuery: allowQuery(), createBug, sendMail }
    );
    expect(result).toEqual({ ok: true, ignored: true });
    expect(createBug).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rate-limits after the window is full", async () => {
    const createBug = vi.fn();
    const result = await submitProblemReport(baseInput, {
      rateLimitQuery: limitedQuery(),
      createBug,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(429);
    expect(result.error).toMatch(/יותר מדי/);
    expect(createBug).not.toHaveBeenCalled();
  });

  it("rate-limits per user, not per IP", async () => {
    const read = vi.fn().mockResolvedValue({ row: null, errorMessage: null });
    const write = vi.fn().mockResolvedValue({ errorMessage: null });
    await submitProblemReport(baseInput, {
      rateLimitQuery: { read, write },
      createBug: vi.fn().mockResolvedValue({ ok: true, ticketId: "TZ-1", bugId: "bug-2610210847-1" }),
      sendMail: vi.fn().mockResolvedValue({ sent: true }),
      notifyEmails: [],
    });
    expect(read).toHaveBeenCalledWith("problem-report:user-1");
    expect(write.mock.calls[0]?.[0]).toMatchObject({
      bucket_key: "problem-report:user-1",
    });
  });

  it("fails closed when the rate-limit store is unavailable", async () => {
    const result = await submitProblemReport(baseInput, {
      rateLimitQuery: null,
      createBug: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
  });

  it("sends only the owner copy when the reporter is a platform admin (TZ-121)", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "demo@example.com";
    const createBug = vi.fn().mockResolvedValue({
      ok: true,
      ticketId: "TZ-121",
      bugId: "bug-2610210847-121",
    });
    const sendMail = vi.fn().mockResolvedValue({ sent: true });
    const result = await submitProblemReport(
      {
        ...baseInput,
        reporterEmail: "demo@example.com",
      },
      {
        rateLimitQuery: allowQuery(),
        createBug,
        sendMail,
        notifyEmails: [PROBLEM_REPORT_OWNER_EMAIL],
      }
    );
    expect(result).toEqual({
      ok: true,
      ticketId: "TZ-121",
      bugId: "bug-2610210847-121",
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const ownerCall = sendMail.mock.calls[0]?.[0] as {
      to: string[];
      replyTo?: string;
    };
    expect(ownerCall.to).toEqual([PROBLEM_REPORT_OWNER_EMAIL]);
    expect(ownerCall.replyTo).toBe("demo@example.com");
  });

  it("emails the teacher and protokal when a regular reporter submits (TZ-121)", async () => {
    const createBug = vi.fn().mockResolvedValue({
      ok: true,
      ticketId: "TZ-18",
      bugId: "bug-2610210847-18",
    });
    const sendMail = vi.fn().mockResolvedValue({ sent: true });
    const result = await submitProblemReport(baseInput, {
      rateLimitQuery: allowQuery(),
      createBug,
      sendMail,
      notifyEmails: [PROBLEM_REPORT_OWNER_EMAIL],
    });
    expect(result).toEqual({
      ok: true,
      ticketId: "TZ-18",
      bugId: "bug-2610210847-18",
    });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      to: ["teacher@school.il"],
    });
    expect(sendMail.mock.calls[1]?.[0]).toMatchObject({
      to: [PROBLEM_REPORT_OWNER_EMAIL],
      replyTo: "teacher@school.il",
    });
  });

  it("enriches the Tzavta description with reporter and institution metadata", async () => {
    const createBug = vi.fn().mockResolvedValue({
      ok: true,
      ticketId: "TZ-18",
      bugId: "bug-2610210847-18",
    });
    await submitProblemReport(
      {
        ...baseInput,
        reporterName: "שרה לוי",
        institutionName: "בית ספר",
        institutionCode: "abc",
      },
      {
        rateLimitQuery: allowQuery(),
        createBug,
        sendMail: vi.fn().mockResolvedValue({ sent: true }),
        notifyEmails: [],
      }
    );
    const payload = createBug.mock.calls[0]?.[0] as { description: string };
    expect(payload.description).toContain("שרה לוי");
    expect(payload.description).toContain("בית ספר");
    expect(payload.description).toContain("abc");
    expect(payload.description).toContain("השמירה נכשלה");
  });

  it("sends truncated text to Tzavta RPC and full metadata to contacts", async () => {
    const createBug = vi.fn().mockResolvedValue({
      ok: true,
      ticketId: "TZ-99",
      bugId: "bug-2610210847-99",
    });
    const longDescription = "א".repeat(PROBLEM_REPORT_DESCRIPTION_MAX);
    await submitProblemReport(
      {
        ...baseInput,
        description: longDescription,
        reporterName: "שרה לוי",
        institutionName: "בית ספר",
        institutionCode: "abc",
      },
      {
        rateLimitQuery: allowQuery(),
        createBug,
        sendMail: vi.fn().mockResolvedValue({ sent: true }),
        notifyEmails: [],
      }
    );
    const payload = createBug.mock.calls[0]?.[0] as {
      description: string;
      contactsDescription: string;
    };
    expect(payload.description.length).toBeLessThanOrEqual(3800);
    expect(payload.description).toContain("…(המשך בפרטי הדיווח)");
    expect(payload.contactsDescription).toContain("שרה לוי");
    expect(payload.contactsDescription).toContain("בית ספר");
    expect(payload.contactsDescription).toContain(longDescription);
    expect(payload.contactsDescription).not.toContain("…(המשך בפרטי הדיווח)");
  });

  it("opens a Tzavta ticket and emails the reporter and Giti with the ticket number", async () => {
    const createBug = vi.fn().mockResolvedValue({ ok: true, ticketId: "TZ-18", bugId: "bug-2610210847-18" });
    const sendMail = vi.fn().mockResolvedValue({ sent: true });
    const result = await submitProblemReport(baseInput, {
      rateLimitQuery: allowQuery(),
      createBug,
      sendMail,
      notifyEmails: ["demo@example.com"],
    });
    expect(result).toEqual({ ok: true, ticketId: "TZ-18", bugId: "bug-2610210847-18" });
    expect(createBug).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("השמירה נכשלה"),
        contactsDescription: expect.stringContaining("השמירה נכשלה"),
        reporterEmail: "teacher@school.il",
        pagePath: "/personal-area",
        browser: "Mozilla/5.0",
      })
    );
    expect(sendMail).toHaveBeenCalledTimes(2);
    const reporterCall = sendMail.mock.calls[0]?.[0] as {
      to: string[];
      text: string;
      html: string;
      subject: string;
    };
    const ownerCall = sendMail.mock.calls[1]?.[0] as {
      to: string[];
      text: string;
      replyTo?: string;
    };
    expect(reporterCall.to).toEqual(["teacher@school.il"]);
    expect(reporterCall.subject).toContain("TZ-18");
    expect(reporterCall.text).toContain("TZ-18");
    expect(reporterCall.text).toContain("תודה! הפנייה שלך התקבלה ונמצאת בטיפול");
    expect(reporterCall.text).toContain("השמירה נכשלה");
    expect(reporterCall.html).toContain("TZ-18");
    expect(reporterCall.html).toContain("השמירה נכשלה");
    expect(ownerCall.to).toEqual(["demo@example.com"]);
    expect(ownerCall.text).toContain("TZ-18");
    expect(ownerCall.text).toContain("השמירה נכשלה");
    expect(ownerCall.replyTo).toBe("teacher@school.il");
  });

  it("still returns success when the thank-you email fails to send", async () => {
    const createBug = vi.fn().mockResolvedValue({
      ok: true,
      ticketId: "TZ-55",
      bugId: "bug-2610210847-55",
    });
    const sendMail = vi.fn().mockResolvedValue({ sent: false, detail: "Resend 500" });
    const result = await submitProblemReport(baseInput, {
      rateLimitQuery: allowQuery(),
      createBug,
      sendMail,
      notifyEmails: [],
    });
    expect(result).toEqual({
      ok: true,
      ticketId: "TZ-55",
      bugId: "bug-2610210847-55",
    });
    expect(sendMail).toHaveBeenCalled();
  });

  it("does not email the reporter when the address is missing or invalid", async () => {
    const createBug = vi.fn().mockResolvedValue({
      ok: true,
      ticketId: "TZ-56",
      bugId: "bug-2610210847-56",
    });
    const sendMail = vi.fn().mockResolvedValue({ sent: true });
    const result = await submitProblemReport(
      { ...baseInput, reporterEmail: "not-an-email" },
      {
        rateLimitQuery: allowQuery(),
        createBug,
        sendMail,
        notifyEmails: [PROBLEM_REPORT_OWNER_EMAIL],
      }
    );
    expect(result).toEqual({
      ok: true,
      ticketId: "TZ-56",
      bugId: "bug-2610210847-56",
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      to: [PROBLEM_REPORT_OWNER_EMAIL],
    });
  });

  it("does not send report text if ticket creation fails", async () => {
    const sendMail = vi.fn();
    const result = await submitProblemReport(baseInput, {
      rateLimitQuery: allowQuery(),
      createBug: async () => ({ ok: false, reason: "insert_failed" }),
      sendMail,
    });
    expect(result.ok).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects /fill and /sign paths before saving or emailing", async () => {
    const createBug = vi.fn();
    const sendMail = vi.fn();
    for (const pagePath of [
      "/fill/secret-token",
      "/sign/parent-token",
      "/fill/a/b",
    ]) {
      const result = await submitProblemReport(
        { ...baseInput, pagePath },
        { rateLimitQuery: allowQuery(), createBug, sendMail }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    }
    expect(createBug).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects encoded /fill and /sign paths before rate limit, save, or email", async () => {
    const createBug = vi.fn();
    const sendMail = vi.fn();
    const read = vi.fn().mockResolvedValue({ row: null, errorMessage: null });
    const write = vi.fn().mockResolvedValue({ errorMessage: null });
    for (const pagePath of ["/%66ill/x", "/fill%2Fx", "/SIGN%2Fx"]) {
      const result = await submitProblemReport(
        { ...baseInput, pagePath },
        { rateLimitQuery: { read, write }, createBug, sendMail }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    }
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(createBug).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects /x/../fill/t after normalising dot segments", async () => {
    const createBug = vi.fn();
    const sendMail = vi.fn();
    const result = await submitProblemReport(
      { ...baseInput, pagePath: "/x/../fill/t" },
      { rateLimitQuery: allowQuery(), createBug, sendMail }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(createBug).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("drops a malformed path with a literal % and still accepts the report", async () => {
    const createBug = vi.fn().mockResolvedValue({ ok: true, ticketId: "TZ-18", bugId: "bug-2610210847-18" });
    const sendMail = vi.fn().mockResolvedValue({ sent: true });
    const result = await submitProblemReport(
      {
        ...baseInput,
        pagePath: "/personal-area/students/folder/x/50%",
      },
      { rateLimitQuery: allowQuery(), createBug, sendMail, notifyEmails: [] }
    );
    expect(result).toEqual({ ok: true, ticketId: "TZ-18", bugId: "bug-2610210847-18" });
    expect(createBug).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("השמירה נכשלה"),
        reporterEmail: "teacher@school.il",
        pagePath: null,
        browser: "Mozilla/5.0",
      })
    );
  });

  it("does not store or email an encoded query name or id", async () => {
    const createBug = vi.fn().mockResolvedValue({ ok: true, ticketId: "TZ-18", bugId: "bug-2610210847-18" });
    const sendMail = vi.fn().mockResolvedValue({ sent: true });
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    const result = await submitProblemReport(
      {
        ...baseInput,
        pagePath: `/personal-area%3Fname=${encodeURIComponent("נועה")}`,
      },
      {
        rateLimitQuery: allowQuery(),
        createBug,
        sendMail,
        notifyEmails: ["demo@example.com"],
      }
    );
    expect(result).toEqual({ ok: true, ticketId: "TZ-18", bugId: "bug-2610210847-18" });
    expect(createBug).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("השמירה נכשלה"),
        reporterEmail: "teacher@school.il",
        pagePath: "/personal-area",
        browser: "Mozilla/5.0",
      })
    );
    const ownerCall = sendMail.mock.calls[1]?.[0] as {
      text: string;
      html: string;
    };
    expect(ownerCall.text).not.toContain("נועה");
    expect(ownerCall.html).not.toContain("נועה");
    expect(ownerCall.text).not.toContain(studentId);
  });

  it("redacts student ids before Tzavta and before email", async () => {
    const createBug = vi.fn().mockResolvedValue({ ok: true, ticketId: "TZ-18", bugId: "bug-2610210847-18" });
    const sendMail = vi.fn().mockResolvedValue({ sent: true });
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    const result = await submitProblemReport(
      {
        ...baseInput,
        pagePath: `/personal-area/students/${studentId}`,
      },
      {
        rateLimitQuery: allowQuery(),
        createBug,
        sendMail,
        notifyEmails: ["demo@example.com"],
      }
    );
    expect(result).toEqual({ ok: true, ticketId: "TZ-18", bugId: "bug-2610210847-18" });
    expect(createBug).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("השמירה נכשלה"),
        reporterEmail: "teacher@school.il",
        pagePath: "/personal-area/students/:id",
        browser: "Mozilla/5.0",
      })
    );
    const ownerCall = sendMail.mock.calls[1]?.[0] as {
      text: string;
      html: string;
    };
    expect(ownerCall.text).toContain("/personal-area/students/:id");
    expect(ownerCall.text).not.toContain(studentId);
    expect(ownerCall.html).not.toContain(studentId);
  });
});

