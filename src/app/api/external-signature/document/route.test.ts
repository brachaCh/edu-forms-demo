import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghij";
const REQUEST_ID = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";
const DOC_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INST_A = "11111111-1111-1111-1111-111111111111";
const STORAGE_PATH = `${INST_A}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/doc.pdf`;

const loadPendingExternalSignatureRequest = vi.fn();
const hasValidExternalSignatureOtpSession = vi.fn();
const fetchStudentDocumentObjectBytes = vi.fn();

vi.mock("@/lib/external-signature-otp-server", () => ({
  loadPendingExternalSignatureRequest: (...args: unknown[]) =>
    loadPendingExternalSignatureRequest(...args),
  hasValidExternalSignatureOtpSession: (...args: unknown[]) =>
    hasValidExternalSignatureOtpSession(...args),
}));

vi.mock("@/lib/student-document-storage", () => ({
  fetchStudentDocumentObjectBytes: (...args: unknown[]) =>
    fetchStudentDocumentObjectBytes(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from: vi.fn(() => singleChain),
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

const singleChain: Record<string, ReturnType<typeof vi.fn>> = {
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
};
singleChain.select.mockReturnValue(singleChain);
singleChain.eq.mockReturnValue(singleChain);
singleChain.single.mockResolvedValue({
  data: {
    id: DOC_ID,
    data_url: `storage://student-documents/${STORAGE_PATH}`,
  },
  error: null,
});

function makeRequest(token = TOKEN) {
  return new Request(
    `http://localhost/api/external-signature/document?token=${encodeURIComponent(token)}`
  );
}

describe("GET /api/external-signature/document", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loadPendingExternalSignatureRequest.mockResolvedValue({
      id: REQUEST_ID,
      document_id: DOC_ID,
      document_name: "TLA",
      institution_id: INST_A,
      expires_at: "2099-01-01T00:00:00Z",
    });
    hasValidExternalSignatureOtpSession.mockResolvedValue(true);
    fetchStudentDocumentObjectBytes.mockResolvedValue({
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      contentType: "application/pdf",
    });
  });

  it("returns 401 without valid OTP session", async () => {
    hasValidExternalSignatureOtpSession.mockResolvedValue(false);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("streams PDF when OTP session is valid", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0x25);
    expect(fetchStudentDocumentObjectBytes).toHaveBeenCalledWith(
      STORAGE_PATH,
      INST_A
    );
  });
});
