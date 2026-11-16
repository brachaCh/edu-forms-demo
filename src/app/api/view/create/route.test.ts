import { beforeEach, describe, expect, it, vi } from "vitest";

const INST_A = "11111111-1111-1111-1111-111111111111";
const FILL_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const STUDENT_ID = "12345678-1234-4123-8123-123456789abc";

const requireTenantSession = vi.fn();
const loadFormFillForSigning = vi.fn();
const loadStudentForInstitution = vi.fn();
const assertMemberCanAccessStudent = vi.fn();
const sendFormViewLinkEmail = vi.fn();
const insertAuditLog = vi.fn();
const consumeFormFillCreateRateLimit = vi.fn();
const openEmailRateLimitQuery = vi.fn();
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

vi.mock("@/lib/form-view-email", () => ({
  sendFormViewLinkEmail: (...args: unknown[]) => sendFormViewLinkEmail(...args),
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

vi.mock("@/lib/green-signature", () => ({
  stripScriptsForView: (html: string) => html,
}));

vi.mock("@/lib/form-fill-otp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/form-fill-otp")>();
  return {
    ...actual,
    newFormFillOtpSessionToken: () => "A".repeat(48),
    hashFormFillToken: vi.fn(async () => "hash"),
  };
});

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
    formId: "weekly-schedule",
    formTitle: "מערכת שעות",
    studentName: "נועה דמו",
    studentId: STUDENT_ID,
    snapshotHtml: `<html><body>${"x".repeat(120)}</body></html>`,
    recipients: [{ email: "parent@example.com", role: "parent" }],
    ...overrides,
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/view/create", {
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
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise<unknown>;
  } = {
    update: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  q.update.mockReturnValue(q);
  q.insert.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  return q;
}

describe("POST /api/view/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation(() => query());
    consumeFormFillCreateRateLimit.mockResolvedValue({ ok: true });
    openEmailRateLimitQuery.mockReturnValue({ kind: "rate-query" });
    sendFormViewLinkEmail.mockResolvedValue({ sent: true });
    insertAuditLog.mockResolvedValue(undefined);
    loadFormFillForSigning.mockResolvedValue({
      id: FILL_ID,
      student_id: STUDENT_ID,
      form_id: "weekly-schedule",
      data: {},
      status: "draft",
    });
    loadStudentForInstitution.mockResolvedValue({
      id: STUDENT_ID,
      institution_id: INST_A,
      full_name: "נועה דמו",
    });
    assertMemberCanAccessStudent.mockResolvedValue(true);
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: session(INST_A),
    });
  });

  it("returns 401 when there is no authenticated session", async () => {
    requireTenantSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "UNAUTHORIZED",
    });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(401);
    expect(loadFormFillForSigning).not.toHaveBeenCalled();
  });

  it("returns 400 when the form is not viewable", async () => {
    const response = await POST(
      jsonRequest(validBody({ formId: "waiver-confidentiality" }))
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "טופס זה אינו תומך בשליחה לצפייה",
    });
    expect(loadFormFillForSigning).not.toHaveBeenCalled();
  });

  it("returns 403 when the member cannot access the student", async () => {
    assertMemberCanAccessStudent.mockResolvedValue(false);

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "אין הרשאה לטופס זה",
    });
  });

  it("returns 429 when the per-user rate limit is exceeded", async () => {
    consumeFormFillCreateRateLimit.mockResolvedValueOnce({
      ok: false,
      reason: "limited",
      retryAfterSec: 30,
    });

    const response = await POST(jsonRequest(validBody()));
    expect(response.status).toBe(429);
    expect(consumeFormFillCreateRateLimit).toHaveBeenCalledWith(
      { kind: "rate-query" },
      "form-view-create:user:user-1",
      60
    );
    expect(loadFormFillForSigning).not.toHaveBeenCalled();
  });
});
