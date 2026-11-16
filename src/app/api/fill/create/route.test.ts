import { beforeEach, describe, expect, it, vi } from "vitest";

const INST_A = "11111111-1111-1111-1111-111111111111";
const INST_B = "22222222-2222-2222-2222-222222222222";
const FILL_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const STUDENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const requireTenantSession = vi.fn();
const loadFormFillForSigning = vi.fn();
const loadStudentForInstitution = vi.fn();
const assertMemberCanAccessStudent = vi.fn();
const sendFormFillLinkEmail = vi.fn();
const insertAuditLog = vi.fn();
const consumeFormFillCreateRateLimit = vi.fn();
const openEmailRateLimitQuery = vi.fn();
const getFormSchema = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/server-auth", () => ({
  requireTenantSession: (...args: unknown[]) => requireTenantSession(...args),
}));

vi.mock("@/lib/simplesign/server-store", () => ({
  loadFormFillForSigning: (...args: unknown[]) =>
    loadFormFillForSigning(...args),
  loadStudentForInstitution: (...args: unknown[]) =>
    loadStudentForInstitution(...args),
}));

vi.mock("@/lib/server-tenant-data", () => ({
  buildMemberAccessContext: vi.fn(() => ({ kind: "ctx" })),
  assertMemberCanAccessStudent: (...args: unknown[]) =>
    assertMemberCanAccessStudent(...args),
}));

vi.mock("@/lib/form-fill-otp-email", () => ({
  sendFormFillLinkEmail: (...args: unknown[]) => sendFormFillLinkEmail(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  insertAuditLog: (...args: unknown[]) => insertAuditLog(...args),
}));

vi.mock("@/lib/email-rate-limit", () => ({
  openEmailRateLimitQuery: (...args: unknown[]) =>
    openEmailRateLimitQuery(...args),
}));

vi.mock("@/lib/form-fill-create-rate-limit", () => ({
  consumeFormFillCreateRateLimit: (...args: unknown[]) =>
    consumeFormFillCreateRateLimit(...args),
  FORM_FILL_CREATE_USER_LIMIT: 60,
  FORM_FILL_CREATE_INSTITUTION_LIMIT: 200,
}));

vi.mock("@/lib/form-schemas", () => ({
  getFormSchema: (...args: unknown[]) => getFormSchema(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
}));

import { POST } from "./route";

function session(institutionId = INST_A) {
  return {
    userId: "user-1",
    institutionId,
    profile: { id: "user-1", institution_id: institutionId },
    membershipRole: "owner" as const,
    hasMultipleInstitutions: false,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    formFillId: FILL_ID,
    formId: "parent-questionnaire",
    formTitle: "כותרת מהלקוח",
    studentName: "שם מהלקוח",
    recipientEmail: "parent@example.com",
    ...overrides,
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/fill/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function query(result: unknown = { error: null }) {
  const q: {
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    neq: ReturnType<typeof vi.fn>;
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise<unknown>;
  } = {
    update: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  q.update.mockReturnValue(q);
  q.insert.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.neq.mockReturnValue(q);
  return q;
}

describe("POST /api/fill/create", () => {
  const insertPayloads: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    insertPayloads.length = 0;
    fromMock.mockImplementation(() => {
      const q = query();
      q.insert.mockImplementation((payload: unknown) => {
        insertPayloads.push(payload);
        return q;
      });
      return q;
    });
    consumeFormFillCreateRateLimit.mockResolvedValue({ ok: true });
    openEmailRateLimitQuery.mockReturnValue({ kind: "rate-query" });
    getFormSchema.mockReturnValue({
      id: "parent-questionnaire",
      title: "כותרת מהסכמה",
    });
    sendFormFillLinkEmail.mockResolvedValue({ sent: true });
    insertAuditLog.mockResolvedValue(undefined);
    loadFormFillForSigning.mockResolvedValue({
      id: FILL_ID,
      student_id: STUDENT_ID,
      form_id: "parent-questionnaire",
      data: {},
      status: "draft",
    });
    loadStudentForInstitution.mockResolvedValue({
      id: STUDENT_ID,
      institution_id: INST_A,
      full_name: "שם מהשרת",
    });
    assertMemberCanAccessStudent.mockResolvedValue(true);
  });

  it("returns 401 when there is no authenticated session", async () => {
    requireTenantSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "UNAUTHORIZED",
    });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "UNAUTHORIZED",
    });
    expect(loadFormFillForSigning).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(consumeFormFillCreateRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 when the per-user rate limit is exceeded", async () => {
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });
    consumeFormFillCreateRateLimit.mockResolvedValueOnce({
      ok: false,
      reason: "limited",
      retryAfterSec: 42,
    });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toEqual({
      ok: false,
      error: "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.",
    });
    expect(consumeFormFillCreateRateLimit).toHaveBeenCalledWith(
      { kind: "rate-query" },
      "form-fill-create:user:user-1",
      60
    );
    expect(loadFormFillForSigning).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the per-institution rate limit is exceeded", async () => {
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });
    consumeFormFillCreateRateLimit
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        reason: "limited",
        retryAfterSec: 15,
      });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      ok: false,
      error: "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.",
    });
    expect(consumeFormFillCreateRateLimit).toHaveBeenCalledWith(
      { kind: "rate-query" },
      `form-fill-create:institution:${INST_A}`,
      200
    );
    expect(loadFormFillForSigning).not.toHaveBeenCalled();
  });

  it("returns 403 when the form belongs to another institution", async () => {
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });
    loadStudentForInstitution.mockResolvedValue({
      id: STUDENT_ID,
      institution_id: INST_B,
      full_name: "תלמיד מוסד אחר",
    });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "אין הרשאה לטופס זה",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a member cannot access the student", async () => {
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });
    assertMemberCanAccessStudent.mockResolvedValue(false);

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "אין הרשאה לטופס זה",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("creates the request using server title and student name, not the client values", async () => {
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      sentTo: ["parent@example.com"],
    });
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({
        form_title: "כותרת מהסכמה",
        student_name: "שם מהשרת",
      })
    );
    expect(insertPayloads[0]).not.toEqual(
      expect.objectContaining({
        form_title: "כותרת מהלקוח",
        student_name: "שם מהלקוח",
      })
    );
    expect(sendFormFillLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        formTitle: "כותרת מהסכמה",
        studentName: "שם מהשרת",
        to: "parent@example.com",
      })
    );
    expect(consumeFormFillCreateRateLimit).toHaveBeenCalledWith(
      { kind: "rate-query" },
      "form-fill-create:user:user-1",
      60
    );
    expect(consumeFormFillCreateRateLimit).toHaveBeenCalledWith(
      { kind: "rate-query" },
      `form-fill-create:institution:${INST_A}`,
      200
    );
    expect(fromMock).toHaveBeenCalledWith("form_fill_requests");
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: INST_A,
        actorUserId: "user-1",
        action: "form_fill.request",
        entityId: FILL_ID,
        summary: "נשלח למילוי: כותרת מהסכמה — שם מהשרת",
      })
    );
  });

  it("revokes only the new row when email send fails and does not revoke the old pending link", async () => {
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });
    sendFormFillLinkEmail.mockResolvedValue({ sent: false, detail: "resend down" });

    const updateCalls: Array<Record<string, unknown>> = [];
    fromMock.mockImplementation(() => {
      const q = query();
      q.insert.mockImplementation((payload: unknown) => {
        insertPayloads.push(payload);
        return q;
      });
      q.update.mockImplementation((payload: unknown) => {
        updateCalls.push(payload as Record<string, unknown>);
        return q;
      });
      q.eq.mockImplementation((column: string, value: unknown) => {
        updateCalls.push({ eq: column, value });
        return q;
      });
      q.neq.mockImplementation((column: string, value: unknown) => {
        updateCalls.push({ neq: column, value });
        return q;
      });
      return q;
    });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: "שליחת המייל נכשלה",
    });
    expect(insertPayloads).toHaveLength(1);
    expect(updateCalls).toContainEqual({ status: "revoked" });
    expect(updateCalls.some((c) => "neq" in c)).toBe(false);
    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("returns a generic Hebrew error and never leaks exception text", async () => {
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });
    loadFormFillForSigning.mockRejectedValue(
      new Error("relation form_fill_requests does not exist")
    );

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "שגיאת שרת",
    });
  });

  it("emails the public custom domain when NEXT_PUBLIC_APP_URL is a Vercel host", async () => {
    const prevApp = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://demo-app.vercel.app";
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });

    try {
      const response = await POST(
        new Request("https://demo-app.vercel.app/api/fill/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            host: "demo-app.vercel.app",
          },
          body: JSON.stringify(validBody()),
        })
      );
      expect(response.status).toBe(200);
      expect(sendFormFillLinkEmail).toHaveBeenCalledTimes(1);
      expect(sendFormFillLinkEmail.mock.calls[0]?.[0]?.link).toMatch(
        /^https:\/\/protokal\.sh-k\.co\.il\/fill\//
      );
      expect(sendFormFillLinkEmail.mock.calls[0]?.[0]?.link).not.toContain(
        "vercel.app"
      );
    } finally {
      if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    }
  });
});
