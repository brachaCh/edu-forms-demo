import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const INST_A = "11111111-1111-1111-1111-111111111111";
const REQUEST_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const STUDENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOC_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const requireTenantSession = vi.fn();
const assertMemberCanAccessStudent = vi.fn();
const loadStudentForInstitution = vi.fn();
const sendExternalDocumentSignatureLinkEmail = vi.fn();
const insertAuditLog = vi.fn();

vi.mock("@/lib/server-auth", () => ({
  requireTenantSession: (...args: unknown[]) => requireTenantSession(...args),
}));

vi.mock("@/lib/server-tenant-data", () => ({
  buildMemberAccessContext: vi.fn(() => ({ kind: "ctx" })),
  assertMemberCanAccessStudent: (...args: unknown[]) =>
    assertMemberCanAccessStudent(...args),
}));

vi.mock("@/lib/simplesign/server-store", () => ({
  loadStudentForInstitution: (...args: unknown[]) =>
    loadStudentForInstitution(...args),
}));

vi.mock("@/lib/external-document-signature-email", () => ({
  sendExternalDocumentSignatureLinkEmail: (...args: unknown[]) =>
    sendExternalDocumentSignatureLinkEmail(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  insertAuditLog: (...args: unknown[]) => insertAuditLog(...args),
}));

vi.mock("@/lib/form-fill-otp", () => ({
  hashFormFillToken: vi.fn().mockResolvedValue("hashed-token"),
  newFormFillOtpSessionToken: vi.fn().mockReturnValue("new-token-abc123def456ghi789jkl012mno345pqr"),
  FORM_FILL_TOKEN_RE: /^[A-Za-z0-9_-]{40,100}$/,
}));

vi.mock("@/lib/app-origin", () => ({
  parentFacingOrigin: () => "https://parents.example.com",
}));

const supabaseSingleResult = vi.fn();
const supabaseUpdateResult = vi.fn();
const supabaseInsertResult = vi.fn();
const supabaseDeleteResult = vi.fn();
let updateStatusValue: string | null = null;

function createChainMock() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => supabaseSingleResult());
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn((val: { status?: string }) => {
    if (val?.status) updateStatusValue = val.status;
    return chain;
  });
  chain.delete = vi.fn(() => chain);
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => {
    const chain = createChainMock();
    return { from: vi.fn(() => chain) };
  },
}));

function makeAuthOk() {
  return {
    ok: true,
    session: {
      institutionId: INST_A,
      userId: "user-1",
    },
  };
}

function makePendingRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    student_id: STUDENT_ID,
    document_id: DOC_ID,
    document_name: "Test Doc",
    recipient_email: "parent@example.com",
    signer_label: "הורה",
    status: "pending",
    institution_id: INST_A,
    expires_at: "2099-01-15T10:00:00Z",
    ...overrides,
  };
}

async function callResend(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  const req = new Request(
    "https://test.example.com/api/external-signature/resend",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return POST(req);
}

describe("POST /api/external-signature/resend", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    updateStatusValue = null;
    requireTenantSession.mockResolvedValue(makeAuthOk());
    assertMemberCanAccessStudent.mockResolvedValue(true);
    loadStudentForInstitution.mockResolvedValue({ full_name: "Test Student" });
    sendExternalDocumentSignatureLinkEmail.mockResolvedValue({ sent: true });
    insertAuditLog.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 409 when request is expired and marks status as expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T10:00:00Z"));

    const expiredRequest = makePendingRequest({
      expires_at: "2026-01-15T10:00:00Z",
    });

    supabaseSingleResult.mockResolvedValue({
      data: expiredRequest,
      error: null,
    });

    const res = await callResend({ requestId: REQUEST_ID });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("תוקף הבקשה פג");
    expect(updateStatusValue).toBe("expired");
    expect(sendExternalDocumentSignatureLinkEmail).not.toHaveBeenCalled();
  });

  it("returns 409 when status is not pending", async () => {
    const signedRequest = makePendingRequest({ status: "signed" });

    supabaseSingleResult.mockResolvedValue({
      data: signedRequest,
      error: null,
    });

    const res = await callResend({ requestId: REQUEST_ID });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(sendExternalDocumentSignatureLinkEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when request not found", async () => {
    supabaseSingleResult.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    });

    const res = await callResend({ requestId: REQUEST_ID });

    expect(res.status).toBe(404);
  });

  it("sends email when request is pending and not expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T10:00:00Z"));

    const pendingRequest = makePendingRequest({
      expires_at: "2026-01-15T10:00:00Z",
    });

    supabaseSingleResult
      .mockResolvedValueOnce({ data: pendingRequest, error: null })
      .mockResolvedValueOnce({ data: { id: "token-1" }, error: null });

    const res = await callResend({ requestId: REQUEST_ID });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(sendExternalDocumentSignatureLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        expiryDays: 5,
      })
    );
  });
});
