import { beforeEach, describe, expect, it, vi } from "vitest";

const REQUEST_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const DOC_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STUDENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INST_A = "11111111-1111-1111-1111-111111111111";

const loadPendingExternalSignatureRequest = vi.fn();
const hasValidExternalSignatureOtpSession = vi.fn();
const insertAuditLog = vi.fn();

vi.mock("@/lib/external-signature-otp-server", () => ({
  loadPendingExternalSignatureRequest: (...args: unknown[]) =>
    loadPendingExternalSignatureRequest(...args),
  hasValidExternalSignatureOtpSession: (...args: unknown[]) =>
    hasValidExternalSignatureOtpSession(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  insertAuditLog: (...args: unknown[]) => insertAuditLog(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from: vi.fn(() => updateChain),
  }),
  isServiceRoleConfigured: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: () => true,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ value: "session-token" }),
  })),
}));

vi.mock("@/lib/green-signature", () => ({
  isValidSubmittedSignature: () => true,
}));

let maybeSingleResult: { data: { id: string } | null; error: null };

const updateChain: Record<string, ReturnType<typeof vi.fn>> = {
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
};
updateChain.update.mockReturnValue(updateChain);
updateChain.eq.mockReturnValue(updateChain);
updateChain.select.mockReturnValue(updateChain);
updateChain.maybeSingle.mockImplementation(() => Promise.resolve(maybeSingleResult));

function makeRequest() {
  return new Request("http://localhost/api/external-signature/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "abcdefghijklmnopqrstuvwxyz0123456789abcdefghij",
      signatureData: "sig-data",
    }),
  });
}

describe("POST /api/external-signature/sign", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loadPendingExternalSignatureRequest.mockResolvedValue({
      id: REQUEST_ID,
      student_id: STUDENT_ID,
      document_id: DOC_ID,
      document_name: "TLA",
      institution_id: INST_A,
      signer_label: "הורה",
      expires_at: "2099-01-01T00:00:00Z",
    });
    hasValidExternalSignatureOtpSession.mockResolvedValue(true);
    insertAuditLog.mockResolvedValue(undefined);
    maybeSingleResult = { data: { id: REQUEST_ID }, error: null };
  });

  it("writes audit log when update succeeds", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "external_signature.signed" })
    );
  });

  it("returns 409 without audit when no pending row was updated", async () => {
    maybeSingleResult = { data: null, error: null };
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(insertAuditLog).not.toHaveBeenCalled();
  });
});
