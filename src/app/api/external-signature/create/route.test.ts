import { beforeEach, describe, expect, it, vi } from "vitest";

const INST_A = "11111111-1111-1111-1111-111111111111";
const STUDENT_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const DOC_ID = "7f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c23";
const REQUEST_ID = "8f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c24";

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
  newFormFillOtpSessionToken: vi.fn().mockReturnValue(
    "new-token-abc123def456ghi789jkl012mno345pqr"
  ),
  FORM_FILL_TOKEN_RE: /^[A-Za-z0-9_-]{40,100}$/,
}));

vi.mock("@/lib/app-origin", () => ({
  parentFacingOrigin: () => "https://parents.example.com",
}));

const fromMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
}));

function session() {
  return {
    userId: "user-1",
    institutionId: INST_A,
  };
}

function makeBody() {
  return {
    studentId: STUDENT_ID,
    documentId: DOC_ID,
    documentName: "שם מהלקוח",
    recipientEmail: "parent@example.com",
    signerLabel: "הורה",
  };
}

function queryChain(
  singleResult: { data: unknown; error: unknown } = { data: null, error: null }
) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(singleResult));
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  return chain;
}

describe("POST /api/external-signature/create", () => {
  const insertPayloads: unknown[] = [];
  const updateCalls: unknown[] = [];
  let emailCallIndex = -1;
  let updateCallIndex = 0;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    insertPayloads.length = 0;
    updateCalls.length = 0;
    emailCallIndex = -1;
    updateCallIndex = 0;

    requireTenantSession.mockResolvedValue({ ok: true, session: session() });
    assertMemberCanAccessStudent.mockResolvedValue(true);
    loadStudentForInstitution.mockResolvedValue({
      institution_id: INST_A,
      full_name: "תלמיד מהשרת",
    });
    sendExternalDocumentSignatureLinkEmail.mockImplementation(async () => {
      emailCallIndex = updateCallIndex;
      return { sent: true };
    });
    insertAuditLog.mockResolvedValue(undefined);

    fromMock.mockImplementation((table: string) => {
      if (table === "student_documents") {
        return queryChain({
          data: { id: DOC_ID, name: "תל״א מהשרת", student_id: STUDENT_ID },
          error: null,
        });
      }
      if (table === "external_document_signature_requests") {
        const chain = queryChain();
        chain.insert.mockImplementation((payload: unknown) => {
          insertPayloads.push(payload);
          chain.single = vi.fn(() =>
            Promise.resolve({ data: { id: REQUEST_ID }, error: null })
          );
          return chain;
        });
        chain.update.mockImplementation((payload: unknown) => {
          updateCalls.push(payload);
          updateCallIndex += 1;
          return chain;
        });
        return chain;
      }
      if (table === "external_signature_tokens") {
        const chain = queryChain();
        chain.insert.mockReturnValue(chain);
        return chain;
      }
      return queryChain();
    });
  });

  async function callCreate() {
    const { POST } = await import("./route");
    return POST(
      new Request("http://localhost/api/external-signature/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBody()),
      })
    );
  }

  it("uses server document name and revokes older pendings only after email succeeds", async () => {
    const res = await callCreate();
    expect(res.status).toBe(200);
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({ document_name: "תל״א מהשרת" })
    );
    expect(sendExternalDocumentSignatureLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        documentName: "תל״א מהשרת",
        link: expect.stringContaining("https://parents.example.com/sign-document/"),
      })
    );
    expect(updateCalls).toContainEqual({ status: "revoked" });
    expect(updateCallIndex).toBeGreaterThan(emailCallIndex);
    expect(insertAuditLog).toHaveBeenCalled();
  });

  it("on email failure revokes only the new request and does not revoke siblings", async () => {
    sendExternalDocumentSignatureLinkEmail.mockResolvedValue({ sent: false });
    const neqSpy = vi.fn(() => queryChain());
    fromMock.mockImplementation((table: string) => {
      if (table === "student_documents") {
        return queryChain({
          data: { id: DOC_ID, name: "תל״א מהשרת", student_id: STUDENT_ID },
          error: null,
        });
      }
      if (table === "external_document_signature_requests") {
        const chain = queryChain();
        chain.insert.mockImplementation((payload: unknown) => {
          insertPayloads.push(payload);
          chain.single = vi.fn(() =>
            Promise.resolve({ data: { id: REQUEST_ID }, error: null })
          );
          return chain;
        });
        chain.update.mockImplementation((payload: unknown) => {
          updateCalls.push(payload);
          return chain;
        });
        chain.neq = neqSpy;
        return chain;
      }
      if (table === "external_signature_tokens") {
        return queryChain();
      }
      return queryChain();
    });

    const res = await callCreate();
    expect(res.status).toBe(502);
    expect(neqSpy).not.toHaveBeenCalled();
    expect(insertAuditLog).not.toHaveBeenCalled();
  });
});
