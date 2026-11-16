import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const requireTenantSession = vi.fn();
const runParentFormBulkSend = vi.fn();
const consumeFormFillCreateRateLimit = vi.fn();

vi.mock("@/lib/server-auth", () => ({
  requireTenantSession: () => requireTenantSession(),
}));

vi.mock("@/lib/form-parent-bulk-send-server", () => ({
  runParentFormBulkSend: (...args: unknown[]) => runParentFormBulkSend(...args),
}));

vi.mock("@/lib/form-fill-create-rate-limit", () => ({
  consumeFormFillCreateRateLimit: (...args: unknown[]) =>
    consumeFormFillCreateRateLimit(...args),
  FORM_FILL_CREATE_USER_LIMIT: 60,
  FORM_FILL_CREATE_INSTITUTION_LIMIT: 200,
}));

vi.mock("@/lib/email-rate-limit", () => ({
  openEmailRateLimitQuery: () => ({}),
}));

vi.mock("@/lib/server-tenant-data", () => ({
  buildMemberAccessContext: () => ({}),
  assertMemberCanAccessStudent: async () => true,
}));

vi.mock("@/lib/audit-log", () => ({
  insertAuditLog: async () => undefined,
}));

describe("POST /api/parent-forms/bulk-send rate limit", () => {
  beforeEach(() => {
    requireTenantSession.mockResolvedValue({
      ok: true,
      session: {
        institutionId: "inst-1",
        userId: "user-1",
        profile: { email: "staff@example.com" },
      },
    });
    consumeFormFillCreateRateLimit.mockResolvedValue({ ok: true });
    runParentFormBulkSend.mockImplementation(async (input) => {
      const limited = await input.rateLimit.consumeEmailSlot();
      if (!limited.ok) {
        return {
          sent: [],
          skipped: [],
          failed: [{ studentId: "s1", error: limited.error }],
        };
      }
      return { sent: ["s1"], skipped: [], failed: [] };
    });
  });

  it("returns 429 when rate limit is exceeded", async () => {
    consumeFormFillCreateRateLimit.mockResolvedValueOnce({
      ok: false,
      reason: "limited",
      retryAfterSec: 120,
    });

    const response = await POST(
      new Request("http://localhost/api/parent-forms/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: "parent-questionnaire",
          studentIds: ["00000000-0000-4000-8000-000000000001"],
          skipAlreadySent: true,
          skipAlreadyFilled: true,
        }),
      })
    );

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.failed[0]?.error).toContain("יותר מדי");
  });
});
