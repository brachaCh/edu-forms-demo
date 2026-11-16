import { beforeEach, describe, expect, it, vi } from "vitest";

const requireInstitutionAdmin = vi.fn();
const fetchAuditLogs = vi.fn();

vi.mock("@/lib/server-auth", () => ({
  requireInstitutionAdmin: (...args: unknown[]) =>
    requireInstitutionAdmin(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  fetchAuditLogs: (...args: unknown[]) => fetchAuditLogs(...args),
}));

import { GET } from "@/app/api/admin/audit-log/route";

describe("institution owner audit log access", () => {
  beforeEach(() => {
    requireInstitutionAdmin.mockReset();
    fetchAuditLogs.mockReset();
  });

  it("lets an institution owner reach logs", async () => {
    requireInstitutionAdmin.mockResolvedValue({
      ok: true,
      session: {
        userId: "owner-1",
        institutionId: "inst-1",
        profile: {
          email: "owner@example.com",
          is_admin: false,
          is_institution_owner: true,
        },
        membershipRole: "owner",
      },
    });
    fetchAuditLogs.mockResolvedValue({ rows: [], total: 0 });

    const response = await GET(
      new Request("http://localhost/api/admin/audit-log")
    );

    expect(response.status).toBe(200);
    expect(fetchAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId: "inst-1" })
    );
    await expect(response.json()).resolves.toEqual({ rows: [], total: 0 });
  });
});
