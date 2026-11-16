import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { POST } from "./route";
import { createUploadTicket } from "@/lib/problem-report/attachments";

const TEST_SECRET = "a-secure-test-secret-key-at-least-32-chars-long";
const TEST_BUG_ID = "bug-2410211200-1";
const TEST_UUID = "01234567-89ab-cdef-0123-456789abcdef";
const TEST_STORAGE_PATH = `${TEST_BUG_ID}/${TEST_UUID}.webm`;

describe("confirm-upload route", () => {
  beforeEach(() => {
    process.env.UPLOAD_TICKET_SECRET = TEST_SECRET;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.UPLOAD_TICKET_SECRET;
  });

  it("returns 503 when UPLOAD_TICKET_SECRET is not configured", async () => {
    delete process.env.UPLOAD_TICKET_SECRET;

    const request = new Request("http://localhost/api/problem-report/confirm-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "recording", uploadTicket: "some-ticket" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(503);

    const data = await response.json();
    expect(data.ok).toBe(false);
  });

  it("returns 400 for invalid upload ticket", async () => {
    const request = new Request("http://localhost/api/problem-report/confirm-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "recording", uploadTicket: "invalid-ticket" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.ok).toBe(false);
  });

  it("returns 400 when ticket is for a different user", async () => {
    const ticketForDifferentUser = createUploadTicket({
      bugId: TEST_BUG_ID,
      storagePath: TEST_STORAGE_PATH,
      mime: "video/webm",
      userId: "different-user-id",
    });

    const request = new Request("http://localhost/api/problem-report/confirm-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "recording", uploadTicket: ticketForDifferentUser }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.ok).toBe(false);
  });
});
