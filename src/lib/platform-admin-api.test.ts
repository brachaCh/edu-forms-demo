import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePlatformAdmin = vi.fn();
const requireLoggedInSession = vi.fn();

vi.mock("@/lib/platform-admin", () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
  isPlatformAdminEmail: () => false,
}));

vi.mock("@/lib/server-auth", () => ({
  requireLoggedInSession: (...args: unknown[]) => requireLoggedInSession(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: () => true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          order: () => Promise.resolve({ data: [], error: null, count: 0 }),
        }),
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

import { GET as dashboardGet } from "@/app/api/platform-admin/dashboard/route";
import { GET as tutorialsGet, POST as tutorialsPost } from "@/app/api/tutorials/route";
import { PATCH as institutionPricesPatch } from "@/app/api/platform-admin/institution-prices/route";

describe("platform-admin API permissions", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    requireLoggedInSession.mockReset();
  });

  it("rejects non-admin dashboard access", async () => {
    requirePlatformAdmin.mockResolvedValue({
      ok: false,
      status: 403,
      error: "FORBIDDEN",
    });
    const response = await dashboardGet();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("rejects unauthenticated tutorial reads", async () => {
    requireLoggedInSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: "UNAUTHORIZED",
    });
    const response = await tutorialsGet();
    expect(response.status).toBe(401);
  });

  it("returns tutorials for authenticated viewer", async () => {
    requireLoggedInSession.mockResolvedValue({
      ok: true,
      session: {
        userId: "user-1",
        profile: { id: "user-1", email: "owner@school.example" },
      },
    });
    const response = await tutorialsGet();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tutorials: [] });
  });

  it("rejects tutorial writes without platform admin", async () => {
    requirePlatformAdmin.mockResolvedValue({
      ok: false,
      status: 403,
      error: "FORBIDDEN",
    });
    const response = await tutorialsPost(
      new Request("http://localhost/api/tutorials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "סרטון",
          url: "https://youtu.be/abc",
        }),
      })
    );
    expect(response.status).toBe(403);
  });

  it("rejects special-price updates without platform admin", async () => {
    requirePlatformAdmin.mockResolvedValue({
      ok: false,
      status: 403,
      error: "FORBIDDEN",
    });
    const response = await institutionPricesPatch(
      new Request("http://localhost/api/platform-admin/institution-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution_id: "11111111-1111-1111-1111-111111111111",
          special_price_agorot: 5000,
        }),
      })
    );
    expect(response.status).toBe(403);
  });
});
