import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "A".repeat(40);

const cookiesGet = vi.fn();
const loadPendingFormSignatureRequest = vi.fn();
const hasValidFormSignatureOtpSession = vi.fn();
const isSupabaseConfiguredServer = vi.fn();
const isServiceRoleConfigured = vi.fn();
const mergeFormFillData = vi.fn();
const archiveSignedFormIfComplete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (...args: unknown[]) => cookiesGet(...args),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: (...args: unknown[]) =>
    isSupabaseConfiguredServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: (...args: unknown[]) =>
    isServiceRoleConfigured(...args),
  createServiceClient: () => ({ kind: "service" }),
}));

vi.mock("@/lib/form-signature-otp-server", () => ({
  loadPendingFormSignatureRequest: (...args: unknown[]) =>
    loadPendingFormSignatureRequest(...args),
  hasValidFormSignatureOtpSession: (...args: unknown[]) =>
    hasValidFormSignatureOtpSession(...args),
}));

vi.mock("@/lib/form-fill-data-server", () => ({
  mergeFormFillData: (...args: unknown[]) => mergeFormFillData(...args),
}));

vi.mock("@/lib/form-signed-archive-server", () => ({
  archiveSignedFormIfComplete: (...args: unknown[]) =>
    archiveSignedFormIfComplete(...args),
}));

import { POST } from "./route";

function pendingRequest() {
  return {
    id: "sig-req-1",
    form_fill_id: "fill-1",
    recipient_email: "parent@example.com",
    signature_field_key: "father_signature",
    signature_field_label: "חתימת האב",
    form_title: "ויתור סודיות",
    student_name: "תלמיד בדיקה",
    snapshot_html: "<p>טופס</p>",
    status: "pending",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/signature/public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/signature/public (no staff session)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfiguredServer.mockReturnValue(true);
    isServiceRoleConfigured.mockReturnValue(true);
    cookiesGet.mockReturnValue(undefined);
    loadPendingFormSignatureRequest.mockResolvedValue(pendingRequest());
    hasValidFormSignatureOtpSession.mockResolvedValue(false);
  });

  it("does not require a logged-in staff session for a valid pending token", async () => {
    const response = await POST(
      jsonRequest({ action: "get", token: TOKEN })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "OTP_REQUIRED",
      otpRequired: true,
      maskedEmail: "p***@example.com",
    });
    expect(loadPendingFormSignatureRequest).toHaveBeenCalledWith(
      { kind: "service" },
      TOKEN
    );
    expect(hasValidFormSignatureOtpSession).toHaveBeenCalled();
  });

  it("returns the Hebrew unavailable copy only when the token is missing", async () => {
    loadPendingFormSignatureRequest.mockResolvedValue(null);

    const response = await POST(
      jsonRequest({ action: "get", token: TOKEN })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "הקישור אינו תקין או שפג תוקפו",
    });
    expect(hasValidFormSignatureOtpSession).not.toHaveBeenCalled();
  });
});
