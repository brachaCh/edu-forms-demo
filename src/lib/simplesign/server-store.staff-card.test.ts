import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn(),
  };
  return {
    mockSupabase,
    checkUserInstitutionMembership: vi.fn(),
  };
});

const { mockSupabase, checkUserInstitutionMembership } = mocks;

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => mocks.mockSupabase,
}));

vi.mock("@/lib/user-institutions", () => ({
  checkUserInstitutionMembership: mocks.checkUserInstitutionMembership,
}));

import { findStaffCardForTeacherName } from "@/lib/simplesign/server-store";

describe("findStaffCardForTeacherName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkUserInstitutionMembership.mockResolvedValue({
      isMember: true,
      role: "member",
    });
  });

  it("returns the card when exactly one active match is an institution member", async () => {
    mockSupabase.is.mockResolvedValueOnce({
      data: [
        {
          id: "staff-1",
          full_name: "רותי לוי",
          user_profile_id: "user-teacher",
        },
      ],
      error: null,
    });

    const card = await findStaffCardForTeacherName("inst-1", "רותי לוי");

    expect(card).toEqual({
      id: "staff-1",
      full_name: "רותי לוי",
      user_profile_id: "user-teacher",
    });
    expect(mockSupabase.is).toHaveBeenCalledWith("archived_at", null);
    expect(checkUserInstitutionMembership).toHaveBeenCalledWith(
      "user-teacher",
      "inst-1"
    );
  });

  it("skips when multiple cards share the same name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabase.is.mockResolvedValueOnce({
      data: [
        {
          id: "staff-1",
          full_name: "רותי לוי",
          user_profile_id: "user-a",
        },
        {
          id: "staff-2",
          full_name: "רותי לוי",
          user_profile_id: "user-b",
        },
      ],
      error: null,
    });

    const card = await findStaffCardForTeacherName("inst-1", "רותי לוי");

    expect(card).toBeNull();
    expect(checkUserInstitutionMembership).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips archived cards (not returned from query)", async () => {
    mockSupabase.is.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const card = await findStaffCardForTeacherName("inst-1", "רותי לוי");

    expect(card).toBeNull();
    expect(checkUserInstitutionMembership).not.toHaveBeenCalled();
  });

  it("skips when the linked user is not a member of the institution", async () => {
    checkUserInstitutionMembership.mockResolvedValueOnce({
      isMember: false,
      role: null,
    });
    mockSupabase.is.mockResolvedValueOnce({
      data: [
        {
          id: "staff-1",
          full_name: "רותי לוי",
          user_profile_id: "user-teacher",
        },
      ],
      error: null,
    });

    const card = await findStaffCardForTeacherName("inst-1", "רותי לוי");

    expect(card).toBeNull();
  });
});
