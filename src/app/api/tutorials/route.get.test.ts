import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthSessionActive = vi.fn();
const verifySessionTokenSignature = vi.fn();
const cookieGet = vi.fn();

const tutorialRow = {
  id: "t1",
  title: "סרטון",
  url: "https://youtu.be/abc",
  audience: "all",
  sort_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieGet(name),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: () => true,
}));

vi.mock("@/lib/auth-sessions", () => ({
  isAuthSessionActive: (...args: unknown[]) => isAuthSessionActive(...args),
}));

vi.mock("@/lib/session", () => ({
  SESSION_COOKIE: "matoah_session",
  verifySessionTokenSignature: (...args: unknown[]) =>
    verifySessionTokenSignature(...args),
}));

vi.mock("@/lib/user-institutions", () => ({
  checkUserInstitutionMembership: vi.fn(),
  getSessionActiveInstitution: vi.fn().mockResolvedValue(null),
  getUserInstitutions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "tutorials") {
        return {
          select: () => ({
            order: () => ({
              order: () =>
                Promise.resolve({ data: [tutorialRow], error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform-admin")>();
  return {
    ...actual,
    isPlatformAdminEmail: () => false,
  };
});

import { GET as tutorialsGet } from "./route";

const validPayload = {
  userId: "user-1",
  email: "teacher@school.example",
  fullName: "Teacher",
  sid: "sid-1",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("GET /api/tutorials auth composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthSessionActive.mockResolvedValue(true);
  });

  it("returns 200 when cookie is valid but user_profiles row is missing", async () => {
    cookieGet.mockImplementation((name: string) =>
      name === "matoah_session" ? { value: "signed-token" } : undefined
    );
    verifySessionTokenSignature.mockResolvedValue(validPayload);
    const response = await tutorialsGet();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tutorials: [
        expect.objectContaining({
          id: "t1",
          title: "סרטון",
        }),
      ],
    });
  });

  it("returns 401 for anonymous requests", async () => {
    cookieGet.mockReturnValue(undefined);
    const response = await tutorialsGet();
    expect(response.status).toBe(401);
    expect(verifySessionTokenSignature).not.toHaveBeenCalled();
  });

  it("returns 403 for demo session", async () => {
    cookieGet.mockImplementation((name: string) =>
      name === "matoah_session" ? { value: "demo-token" } : undefined
    );
    verifySessionTokenSignature.mockResolvedValue({
      ...validPayload,
      userId: "demo-user",
    });
    const response = await tutorialsGet();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "DEMO_SESSION" });
  });
});
