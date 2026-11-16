import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => mockSupabaseClient,
}));

const getSessionActiveInstitution = vi.fn();
const getUserInstitutions = vi.fn();

vi.mock("@/lib/user-institutions", () => ({
  getSessionActiveInstitution: (...args: unknown[]) =>
    getSessionActiveInstitution(...args),
  getUserInstitutions: (...args: unknown[]) => getUserInstitutions(...args),
}));

const verifySessionTokenSignature = vi.fn();

vi.mock("@/lib/session", () => ({
  SESSION_COOKIE: "giti_session",
  verifySessionTokenSignature: (...args: unknown[]) =>
    verifySessionTokenSignature(...args),
}));

const cookiesGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: cookiesGet,
  }),
}));

import {
  loadReporterInstitution,
  resolveReporterInstitutionId,
} from "./reporter-institution";

describe("loadReporterInstitution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps school_name, name, and code from institutions", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: {
        school_name: "בית ספר א",
        name: "מוסד א",
        code: "inst-a",
      },
      error: null,
    });

    await expect(loadReporterInstitution("uuid-1")).resolves.toEqual({
      name: "בית ספר א",
      code: "inst-a",
    });
    expect(mockSupabaseClient.select).toHaveBeenCalledWith(
      "school_name, name, code"
    );
  });

  it("falls back to name when school_name is empty", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: { school_name: "  ", name: "מוסד ב", code: "b" },
      error: null,
    });

    await expect(loadReporterInstitution("uuid-2")).resolves.toEqual({
      name: "מוסד ב",
      code: "b",
    });
  });
});

describe("resolveReporterInstitutionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionActiveInstitution.mockReset();
    getUserInstitutions.mockReset();
    cookiesGet.mockReturnValue({ value: "token" });
    verifySessionTokenSignature.mockResolvedValue({
      userId: "user-1",
      sid: "sid-1",
    });
  });

  it("prefers session active institution over profile", async () => {
    getSessionActiveInstitution.mockResolvedValueOnce("active-inst");

    await expect(
      resolveReporterInstitutionId("user-1", "profile-inst")
    ).resolves.toBe("active-inst");
    expect(getUserInstitutions).not.toHaveBeenCalled();
  });

  it("falls back to profile institution when session has no active", async () => {
    getSessionActiveInstitution.mockResolvedValue(null);

    await expect(
      resolveReporterInstitutionId("user-1", "profile-inst")
    ).resolves.toBe("profile-inst");
    expect(getUserInstitutions).not.toHaveBeenCalled();
  });

  it("falls back to first membership when profile and session are empty", async () => {
    getSessionActiveInstitution.mockResolvedValue(null);
    getUserInstitutions.mockResolvedValue([
      { institution_id: "first-inst" },
    ]);

    await expect(resolveReporterInstitutionId("user-1", null)).resolves.toBe(
      "first-inst"
    );
  });
});
