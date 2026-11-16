import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hashFormFillToken = vi.fn();

vi.mock("@/lib/form-fill-otp", () => ({
  hashFormFillToken: (...args: unknown[]) => hashFormFillToken(...args),
}));

const supabaseMaybeSingleResult = vi.fn();
let updateWasCalled = false;
let updateStatusValue: string | null = null;

function createChainMock() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => supabaseMaybeSingleResult());
  chain.update = vi.fn((val: { status?: string }) => {
    updateWasCalled = true;
    if (val?.status) updateStatusValue = val.status;
    return chain;
  });
  return chain;
}

function makeSupabaseMock() {
  const chain = createChainMock();
  return { from: vi.fn(() => chain) };
}

describe("loadPendingExternalSignatureRequest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    updateWasCalled = false;
    updateStatusValue = null;
    hashFormFillToken.mockResolvedValue("hashed-token");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when token is not found", async () => {
    const supabase = makeSupabaseMock();
    supabaseMaybeSingleResult.mockResolvedValueOnce({ data: null, error: null });

    const { loadPendingExternalSignatureRequest } = await import(
      "./external-signature-otp-server"
    );
    const result = await loadPendingExternalSignatureRequest(
      supabase as never,
      "invalid-token"
    );

    expect(result).toBeNull();
    expect(hashFormFillToken).toHaveBeenCalledWith("invalid-token");
  });

  it("returns null when request status is not pending (signed)", async () => {
    const supabase = makeSupabaseMock();
    supabaseMaybeSingleResult
      .mockResolvedValueOnce({
        data: { request_id: "req-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "req-1",
          student_id: "student-1",
          document_id: "doc-1",
          document_name: "Test Doc",
          recipient_email: "test@example.com",
          signer_label: "Parent",
          status: "signed",
          expires_at: "2099-01-15T10:00:00Z",
          institution_id: "inst-1",
        },
        error: null,
      });

    const { loadPendingExternalSignatureRequest } = await import(
      "./external-signature-otp-server"
    );
    const result = await loadPendingExternalSignatureRequest(
      supabase as never,
      "valid-token"
    );

    expect(result).toBeNull();
  });

  it("returns null when request status is revoked", async () => {
    const supabase = makeSupabaseMock();
    supabaseMaybeSingleResult
      .mockResolvedValueOnce({
        data: { request_id: "req-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "req-1",
          student_id: "student-1",
          document_id: "doc-1",
          document_name: "Test Doc",
          recipient_email: "test@example.com",
          signer_label: "Parent",
          status: "revoked",
          expires_at: "2099-01-15T10:00:00Z",
          institution_id: "inst-1",
        },
        error: null,
      });

    const { loadPendingExternalSignatureRequest } = await import(
      "./external-signature-otp-server"
    );
    const result = await loadPendingExternalSignatureRequest(
      supabase as never,
      "valid-token"
    );

    expect(result).toBeNull();
  });

  it("marks request as expired and returns null when expires_at is in the past", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T10:00:00Z"));

    const supabase = makeSupabaseMock();
    supabaseMaybeSingleResult
      .mockResolvedValueOnce({
        data: { request_id: "req-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "req-1",
          student_id: "student-1",
          document_id: "doc-1",
          document_name: "Test Doc",
          recipient_email: "test@example.com",
          signer_label: "Parent",
          status: "pending",
          expires_at: "2026-01-15T10:00:00Z",
          institution_id: "inst-1",
        },
        error: null,
      });

    const { loadPendingExternalSignatureRequest } = await import(
      "./external-signature-otp-server"
    );
    const result = await loadPendingExternalSignatureRequest(
      supabase as never,
      "valid-token"
    );

    expect(result).toBeNull();
    expect(updateWasCalled).toBe(true);
    expect(updateStatusValue).toBe("expired");
  });

  it("returns request when status is pending and not expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T10:00:00Z"));

    const supabase = makeSupabaseMock();
    supabaseMaybeSingleResult
      .mockResolvedValueOnce({
        data: { request_id: "req-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "req-1",
          student_id: "student-1",
          document_id: "doc-1",
          document_name: "Test Doc",
          recipient_email: "TEST@Example.COM",
          signer_label: "Parent",
          status: "pending",
          expires_at: "2026-01-15T10:00:00Z",
          institution_id: "inst-1",
        },
        error: null,
      });

    const { loadPendingExternalSignatureRequest } = await import(
      "./external-signature-otp-server"
    );
    const result = await loadPendingExternalSignatureRequest(
      supabase as never,
      "valid-token"
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe("req-1");
    expect(result?.status).toBe("pending");
    expect(result?.recipient_email).toBe("test@example.com");
    expect(updateWasCalled).toBe(false);
  });
});
