import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMaybeSingle = vi.fn();
const isAuthSessionActive = vi.fn();
const verifySessionTokenSignature = vi.fn();
const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieGet(name),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: () => true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockMaybeSingle(),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/auth-sessions", () => ({
  isAuthSessionActive: (...args: unknown[]) => isAuthSessionActive(...args),
}));

vi.mock("@/lib/session", () => ({
  SESSION_COOKIE: "matoah_session",
  verifySessionTokenSignature: (...args: unknown[]) =>
    verifySessionTokenSignature(...args),
}));

import { requireAuthSession } from "./platform-admin";

describe("requireAuthSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieGet.mockReturnValue({ value: "signed-token" });
    verifySessionTokenSignature.mockResolvedValue({
      userId: "user-1",
      email: "teacher@school.example",
      fullName: "Teacher",
      sid: "sid-1",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    isAuthSessionActive.mockResolvedValue(true);
  });

  it("rejects missing session cookie", async () => {
    cookieGet.mockReturnValue(undefined);
    const result = await requireAuthSession();
    expect(result).toEqual({ ok: false, status: 401, error: "UNAUTHORIZED" });
  });

  it("accepts valid session when user_profiles row is missing", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await requireAuthSession();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.userId).toBe("user-1");
      expect(result.session.profile.email).toBe("teacher@school.example");
    }
  });

  it("prefers user_profiles when present", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "user-1",
        email: "teacher@school.example",
        full_name: "Teacher DB",
        phone: "",
        institution_id: "inst-1",
        institution_code: null,
        setup_completed_at: null,
        terms_accepted_at: null,
        is_admin: false,
        is_institution_owner: false,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    });
    const result = await requireAuthSession();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.profile.full_name).toBe("Teacher DB");
      expect(result.session.profile.institution_id).toBe("inst-1");
    }
  });
});
