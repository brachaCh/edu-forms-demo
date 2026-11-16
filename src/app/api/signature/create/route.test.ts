import { beforeEach, describe, expect, it, vi } from "vitest";

const INST_A = "11111111-1111-1111-1111-111111111111";
const INST_B = "22222222-2222-2222-2222-222222222222";
const FILL_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const STUDENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const requireTenantSession = vi.fn();
const loadFormFillForSigning = vi.fn();
const loadStudentForInstitution = vi.fn();
const assertMemberCanAccessStudent = vi.fn();
const sendFormSignatureLinkEmail = vi.fn();
const insertAuditLog = vi.fn();
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

vi.mock("@/lib/form-signature-otp-email", () => ({
  sendFormSignatureLinkEmail: (...args: unknown[]) =>
    sendFormSignatureLinkEmail(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  insertAuditLog: (...args: unknown[]) => insertAuditLog(...args),
}));

vi.mock("@/lib/form-schemas", () => ({
  getFormSchema: vi.fn(() => ({ id: "confidentiality-waiver" })),
  listFormFields: vi.fn(() => [
    { type: "signature", key: "father_signature" },
  ]),
}));

vi.mock("@/lib/simplesign/config", () => ({
  formSupportsSimpleSign: vi.fn(() => false),
  isSimpleSignSignerField: vi.fn(() => false),
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

function validBody() {
  return {
    formFillId: FILL_ID,
    formTitle: "ויתור סודיות",
    studentName: "תלמיד בדיקה",
    snapshotHtml: "<html><body>x</body></html>",
    assignments: [
      {
        email: "parent@example.com",
        fieldKey: "father_signature",
        fieldLabel: "חתימת האב",
      },
    ],
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/signature/create", {
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

describe("POST /api/signature/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue(query());
    sendFormSignatureLinkEmail.mockResolvedValue({ sent: true });
    insertAuditLog.mockResolvedValue(undefined);
    loadFormFillForSigning.mockResolvedValue({
      id: FILL_ID,
      student_id: STUDENT_ID,
      form_id: "confidentiality-waiver",
      data: {},
      status: "draft",
    });
    loadStudentForInstitution.mockResolvedValue({
      id: STUDENT_ID,
      institution_id: INST_A,
      full_name: "תלמיד בדיקה",
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

  it("creates the signature request when the session matches the tenant", async () => {
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
    expect(fromMock).toHaveBeenCalledWith("form_signature_requests");
    expect(sendFormSignatureLinkEmail).toHaveBeenCalledTimes(1);
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: INST_A,
        actorUserId: "user-1",
        action: "signature.request",
        entityId: FILL_ID,
      })
    );
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
        new Request("https://demo-app.vercel.app/api/signature/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            host: "demo-app.vercel.app",
          },
          body: JSON.stringify(validBody()),
        })
      );
      expect(response.status).toBe(200);
      expect(sendFormSignatureLinkEmail).toHaveBeenCalledTimes(1);
      expect(sendFormSignatureLinkEmail.mock.calls[0]?.[0]?.link).toMatch(
        /^https:\/\/protokal\.sh-k\.co\.il\/sign\//
      );
      expect(sendFormSignatureLinkEmail.mock.calls[0]?.[0]?.link).not.toContain(
        "vercel.app"
      );
    } finally {
      if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    }
  });
});
