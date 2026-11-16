import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockClaimGrantNonce = vi.fn();
const mockCreateSignedUploadUrl = vi.fn();

vi.mock("@/lib/app-request-origin", () => ({
  assertAllowedAppOrigin: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock("@/lib/platform-admin", () => ({
  requireAuthSession: vi.fn().mockResolvedValue({
    ok: true,
    session: { userId: "test-user-id", profile: { email: "test@example.com" } },
  }),
}));

vi.mock("@/lib/email-rate-limit", () => ({
  consumeEmailRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  openEmailRateLimitQuery: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createPublicServiceClient: vi.fn().mockReturnValue({}),
  isServiceRoleConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/problem-report/attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/problem-report/attachments")>();
  return {
    ...actual,
    claimGrantNonce: (...args: unknown[]) => mockClaimGrantNonce(...args),
    createSignedUploadUrl: (...args: unknown[]) => mockCreateSignedUploadUrl(...args),
  };
});

import { POST } from "./route";
import { createRecordingGrant } from "@/lib/problem-report/attachments";

const TEST_SECRET = "a-secure-test-secret-key-at-least-32-chars-long";

describe("upload-url route", () => {
  beforeEach(() => {
    process.env.UPLOAD_TICKET_SECRET = TEST_SECRET;
    vi.clearAllMocks();
    mockClaimGrantNonce.mockResolvedValue({ ok: true });
    mockCreateSignedUploadUrl.mockResolvedValue({
      ok: true,
      signedUrl: "https://example.com/upload",
      storagePath: "bug-123/abc.webm",
      uploadTicket: "test-ticket",
    });
  });

  afterEach(() => {
    delete process.env.UPLOAD_TICKET_SECRET;
  });

  it("returns 503 when UPLOAD_TICKET_SECRET is not configured", async () => {
    delete process.env.UPLOAD_TICKET_SECRET;

    const request = new Request("http://localhost/api/problem-report/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingGrant: "some-grant" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(503);

    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.signedUrl).toBeUndefined();
  });

  it("returns 403 for invalid/malformed recording grant", async () => {
    const request = new Request("http://localhost/api/problem-report/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingGrant: "invalid-grant-token" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.signedUrl).toBeUndefined();
  });

  it("returns 403 when grant is for a different user", async () => {
    const grantForDifferentUser = createRecordingGrant({
      bugId: "bug-2410211200-1",
      userId: "different-user-id",
      mime: "video/webm",
    });

    const request = new Request("http://localhost/api/problem-report/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingGrant: grantForDifferentUser }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.signedUrl).toBeUndefined();
  });

  it("returns 403 when grant nonce is already used (23505)", async () => {
    mockClaimGrantNonce.mockResolvedValue({ ok: false, error: "already_used" });

    const validGrant = createRecordingGrant({
      bugId: "bug-2410211200-2",
      userId: "test-user-id",
      mime: "video/webm",
    });

    const request = new Request("http://localhost/api/problem-report/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingGrant: validGrant }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.signedUrl).toBeUndefined();
  });

  it("returns 503 when grant nonce claim fails with DB error", async () => {
    mockClaimGrantNonce.mockResolvedValue({ ok: false, error: "unavailable" });

    const validGrant = createRecordingGrant({
      bugId: "bug-2410211200-3",
      userId: "test-user-id",
      mime: "video/webm",
    });

    const request = new Request("http://localhost/api/problem-report/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingGrant: validGrant }),
    });

    const response = await POST(request);
    expect(response.status).toBe(503);

    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.signedUrl).toBeUndefined();
  });

  it("returns signed URL when grant is valid and claim succeeds", async () => {
    const validGrant = createRecordingGrant({
      bugId: "bug-2410211200-4",
      userId: "test-user-id",
      mime: "video/webm",
    });

    const request = new Request("http://localhost/api/problem-report/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingGrant: validGrant }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.signedUrl).toBe("https://example.com/upload");
    expect(data.uploadTicket).toBeDefined();
  });
});
