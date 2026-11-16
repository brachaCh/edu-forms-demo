import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthSession = vi.fn();
const submitProblemReport = vi.fn();

vi.mock("@/lib/platform-admin", () => ({
  requireAuthSession: (...args: unknown[]) => requireAuthSession(...args),
}));

vi.mock("@/lib/problem-report/submit", () => ({
  submitProblemReport: (...args: unknown[]) => submitProblemReport(...args),
}));

const resolveReporterInstitutionId = vi.fn();
const loadReporterInstitution = vi.fn();

vi.mock("@/lib/problem-report/reporter-institution", () => ({
  resolveReporterInstitutionId: (...args: unknown[]) =>
    resolveReporterInstitutionId(...args),
  loadReporterInstitution: (...args: unknown[]) =>
    loadReporterInstitution(...args),
}));

import { POST } from "./route";

function jsonRequest(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost/api/problem-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  description: "השמירה נכשלה",
  pagePath: "/personal-area",
  browser: "Mozilla/5.0",
};

const session = {
  userId: "user-1",
  profile: {
    email: "teacher@school.il",
    institution_id: "profile-inst",
    institution_code: "profile-code",
  },
};

describe("POST /api/problem-report", () => {
  beforeEach(() => {
    requireAuthSession.mockReset();
    submitProblemReport.mockReset();
    resolveReporterInstitutionId.mockReset();
    loadReporterInstitution.mockReset();
    resolveReporterInstitutionId.mockResolvedValue("active-inst");
    loadReporterInstitution.mockResolvedValue({
      name: "בית ספר לדוגמה",
      code: "demo",
    });
    process.env.ALLOWED_ORIGINS = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("rejects anonymous callers", async () => {
    requireAuthSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "UNAUTHORIZED",
    });
    const response = await POST(jsonRequest(validBody));
    expect(response.status).toBe(401);
    expect(submitProblemReport).not.toHaveBeenCalled();
  });

  it("rejects a client email that differs from the session", async () => {
    requireAuthSession.mockResolvedValue({ ok: true, session });
    const response = await POST(
      jsonRequest({ ...validBody, reporterEmail: "other@school.il" })
    );
    expect(response.status).toBe(400);
    expect(submitProblemReport).not.toHaveBeenCalled();
  });

  it("rejects an invalid client email", async () => {
    requireAuthSession.mockResolvedValue({ ok: true, session });
    const response = await POST(
      jsonRequest({ ...validBody, reporterEmail: "not-an-email" })
    );
    expect(response.status).toBe(400);
    expect(submitProblemReport).not.toHaveBeenCalled();
  });

  it("rejects when the session has no email", async () => {
    requireAuthSession.mockResolvedValue({
      ok: true,
      session: { userId: "user-1", profile: { email: "" } },
    });
    const response = await POST(jsonRequest(validBody));
    expect(response.status).toBe(400);
    expect(submitProblemReport).not.toHaveBeenCalled();
  });

  it("rejects an empty description", async () => {
    requireAuthSession.mockResolvedValue({ ok: true, session });
    const response = await POST(jsonRequest({ ...validBody, description: "   " }));
    expect(response.status).toBe(400);
    expect(submitProblemReport).not.toHaveBeenCalled();
  });

  it("returns 429 when the submit layer is rate limited", async () => {
    requireAuthSession.mockResolvedValue({ ok: true, session });
    submitProblemReport.mockResolvedValue({
      ok: false,
      status: 429,
      error: "נשלחו יותר מדי הודעות. נסו שוב בעוד כמה דקות.",
      retryAfterSec: 90,
    });
    const response = await POST(jsonRequest(validBody));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/יותר מדי/);
    expect(submitProblemReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterEmail: "teacher@school.il",
        userId: "user-1",
      })
    );
  });

  it("loads institution via active session, not profile alone", async () => {
    requireAuthSession.mockResolvedValue({ ok: true, session });
    submitProblemReport.mockResolvedValue({ ok: true, ticketId: "TZ-18" });
    const response = await POST(jsonRequest(validBody));
    expect(response.status).toBe(200);
    expect(resolveReporterInstitutionId).toHaveBeenCalledWith(
      "user-1",
      "profile-inst"
    );
    expect(loadReporterInstitution).toHaveBeenCalledWith("active-inst");
  });

  it("uses the session email and ignores an omitted client value", async () => {
    requireAuthSession.mockResolvedValue({ ok: true, session });
    submitProblemReport.mockResolvedValue({ ok: true, ticketId: "TZ-18" });
    const response = await POST(jsonRequest(validBody));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; ticketId: string };
    expect(body).toEqual({ ok: true, ticketId: "TZ-18" });
    expect(submitProblemReport).toHaveBeenCalledWith({
      reporterEmail: "teacher@school.il",
      description: "השמירה נכשלה",
      pagePath: "/personal-area",
      browser: "Mozilla/5.0",
      website: undefined,
      userId: "user-1",
      reporterName: undefined,
      institutionName: "בית ספר לדוגמה",
      institutionCode: "demo",
    });
  });

  it("returns no recordingGrant when recordingMime is not provided", async () => {
    requireAuthSession.mockResolvedValue({ ok: true, session });
    submitProblemReport.mockResolvedValue({
      ok: true,
      ticketId: "TZ-19",
      bugId: "bug-2410211500-1",
    });
    const response = await POST(jsonRequest(validBody));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      ticketId: string;
      bugId: string;
      recordingGrant?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.ticketId).toBe("TZ-19");
    expect(body.bugId).toBe("bug-2410211500-1");
    expect(body.recordingGrant).toBeUndefined();
  });
});
