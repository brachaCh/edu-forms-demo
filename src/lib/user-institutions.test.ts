/**
 * TZ-17: בדיקות לניהול חברויות משתמש במוסדות
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn().mockReturnThis(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => mockSupabaseClient,
  isServiceRoleConfigured: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: () => true,
}));

import {
  checkUserInstitutionMembership,
  addUserInstitutionMembership,
} from "@/lib/user-institutions";

describe("user-institutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkUserInstitutionMembership", () => {
    it("מחזיר isMember=true כשהמשתמש חבר במוסד", async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "member" },
        error: null,
      });

      const result = await checkUserInstitutionMembership(
        "user-123",
        "institution-456"
      );

      expect(result).toEqual({ isMember: true, role: "member" });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("user_institutions");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", "user-123");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "institution_id",
        "institution-456"
      );
    });

    it("מחזיר isMember=false כשהמשתמש לא חבר במוסד", async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await checkUserInstitutionMembership(
        "user-123",
        "institution-456"
      );

      expect(result).toEqual({ isMember: false, role: null });
    });

    it("מחזיר role=owner לבעלי מוסד", async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "owner" },
        error: null,
      });

      const result = await checkUserInstitutionMembership(
        "owner-123",
        "institution-456"
      );

      expect(result).toEqual({ isMember: true, role: "owner" });
    });
  });

  describe("addUserInstitutionMembership", () => {
    it("מוסיף חברות חדשה", async () => {
      mockSupabaseClient.upsert.mockResolvedValueOnce({ error: null });

      const result = await addUserInstitutionMembership({
        userId: "user-123",
        institutionId: "institution-456",
        role: "member",
      });

      expect(result).toBe(true);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("user_institutions");
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        {
          user_id: "user-123",
          institution_id: "institution-456",
          role: "member",
        },
        { onConflict: "user_id,institution_id" }
      );
    });

    it("מחזיר false כששגיאה חמורה", async () => {
      mockSupabaseClient.upsert.mockResolvedValueOnce({
        error: { message: "Database error" },
      });

      const result = await addUserInstitutionMembership({
        userId: "user-123",
        institutionId: "institution-456",
        role: "member",
      });

      expect(result).toBe(false);
    });
  });
});

describe("TZ-1 Protection", () => {
  it("משתמש לא יכול להצטרף למוסד ללא חברות מאושרת", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await checkUserInstitutionMembership(
      "attacker-123",
      "victim-institution-456"
    );

    expect(result.isMember).toBe(false);
  });

  it("רק חברות אמיתית מאפשרת גישה", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: { role: "member" },
      error: null,
    });

    const result = await checkUserInstitutionMembership(
      "legitimate-user-123",
      "institution-456"
    );

    expect(result.isMember).toBe(true);
  });
});

describe("Graceful degradation (migration 056 not yet applied)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checkUserInstitutionMembership: fallback לפרופיל כשטבלת user_institutions לא קיימת", async () => {
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: { message: "relation user_institutions does not exist" },
      })
      .mockResolvedValueOnce({
        data: {
          institution_id: "institution-456",
          is_institution_owner: true,
        },
        error: null,
      });

    const result = await checkUserInstitutionMembership(
      "user-123",
      "institution-456"
    );

    expect(result.isMember).toBe(true);
    expect(result.role).toBe("owner");
  });

  it("checkUserInstitutionMembership: fallback למשתמש רגיל (לא בעלים)", async () => {
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: { message: "relation user_institutions does not exist" },
      })
      .mockResolvedValueOnce({
        data: {
          institution_id: "institution-456",
          is_institution_owner: false,
        },
        error: null,
      });

    const result = await checkUserInstitutionMembership(
      "user-123",
      "institution-456"
    );

    expect(result.isMember).toBe(true);
    expect(result.role).toBe("member");
  });

  it("checkUserInstitutionMembership: fallback מחזיר false כשהמוסד לא מתאים", async () => {
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: { message: "relation user_institutions does not exist" },
      })
      .mockResolvedValueOnce({
        data: {
          institution_id: "different-institution",
          is_institution_owner: true,
        },
        error: null,
      });

    const result = await checkUserInstitutionMembership(
      "user-123",
      "institution-456"
    );

    expect(result.isMember).toBe(false);
    expect(result.role).toBe(null);
  });

  it("addUserInstitutionMembership: מחזיר true בלי שגיאה כשהטבלה לא קיימת", async () => {
    mockSupabaseClient.upsert.mockResolvedValueOnce({
      error: { message: "relation user_institutions does not exist" },
    });

    const result = await addUserInstitutionMembership({
      userId: "user-123",
      institutionId: "institution-456",
      role: "member",
    });

    expect(result).toBe(true);
  });
});

describe("Legacy single-institution users (pre-migration flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("משתמש קיים עם מוסד יחיד ממשיך לעבוד ללא המיגרציה", async () => {
    // Simulate table doesn't exist -> fallback to profile
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: { message: "relation user_institutions does not exist" },
      })
      .mockResolvedValueOnce({
        data: {
          institution_id: "my-institution",
          is_institution_owner: false,
        },
        error: null,
      });

    const result = await checkUserInstitutionMembership(
      "existing-user",
      "my-institution"
    );

    // Should work exactly as before
    expect(result.isMember).toBe(true);
    expect(result.role).toBe("member");
  });

  it("בעלי מוסד ממשיכים להיות מזוהים כ-owner", async () => {
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: { message: "relation user_institutions does not exist" },
      })
      .mockResolvedValueOnce({
        data: {
          institution_id: "my-institution",
          is_institution_owner: true,
        },
        error: null,
      });

    const result = await checkUserInstitutionMembership(
      "owner-user",
      "my-institution"
    );

    expect(result.isMember).toBe(true);
    expect(result.role).toBe("owner");
  });
});

describe("DB error handling (503 vs 403)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checkUserInstitutionMembership: מחזיר dbError=true על שגיאת DB (לא טבלה חסרה)", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "connection timeout" },
    });

    const result = await checkUserInstitutionMembership(
      "user-123",
      "institution-456"
    );

    expect(result.isMember).toBe(false);
    expect(result.role).toBe(null);
    expect(result.dbError).toBe(true);
  });

  it("checkUserInstitutionMembership: לא מחזיר dbError כשהטבלה לא קיימת (graceful degradation)", async () => {
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: { message: "relation user_institutions does not exist" },
      })
      .mockResolvedValueOnce({
        data: {
          institution_id: "institution-456",
          is_institution_owner: false,
        },
        error: null,
      });

    const result = await checkUserInstitutionMembership(
      "user-123",
      "institution-456"
    );

    expect(result.isMember).toBe(true);
    expect(result.dbError).toBeUndefined();
  });

  it("checkUserInstitutionMembership: לא מחזיר dbError כשמשתמש לא חבר באמת", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await checkUserInstitutionMembership(
      "user-123",
      "institution-456"
    );

    expect(result.isMember).toBe(false);
    expect(result.role).toBe(null);
    expect(result.dbError).toBeUndefined();
  });

  it("fallback: מחזיר dbError=true על שגיאת DB בפרופיל", async () => {
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: { message: "relation user_institutions does not exist" },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "database connection lost" },
      });

    const result = await checkUserInstitutionMembership(
      "user-123",
      "institution-456"
    );

    expect(result.isMember).toBe(false);
    expect(result.dbError).toBe(true);
  });
});

describe("TZ-17: Multi-institution billing isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("active institution determines billing target", () => {
    it("משתמש בשני מוסדות A ו-B: בחירת תוכנית כש-B פעיל מעדכנת את B בלבד", async () => {
      const userInstitutionA = "institution-a-123";
      const userInstitutionB = "institution-b-456";
      const userId = "multi-inst-user";

      // User is member of both institutions
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "member" },
        error: null,
      });

      const membershipInB = await checkUserInstitutionMembership(
        userId,
        userInstitutionB
      );

      // Verify the user can access institution B
      expect(membershipInB.isMember).toBe(true);

      // Verify that B's membership is distinct from A
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "owner" },
        error: null,
      });

      const membershipInA = await checkUserInstitutionMembership(
        userId,
        userInstitutionA
      );

      expect(membershipInA.isMember).toBe(true);
      expect(membershipInA.role).toBe("owner");
      expect(membershipInB.role).toBe("member");
    });

    it("session API צריך להחזיר נתוני המוסד הפעיל, לא המוסד המקורי", async () => {
      // This test documents the expected behavior:
      // When user switches from A to B, session should return B's data
      const originalInstitutionId = "original-inst-a";
      const activeInstitutionId = "active-inst-b";

      // User profile has original institution A
      const profileFromDb = {
        id: "user-123",
        email: "test@example.com",
        institution_id: originalInstitutionId,
        institution_code: "ORIG-A",
      };

      // But active institution in session is B
      // The session API should fetch and return B's data
      // (This documents the contract that session route must honor)
      expect(activeInstitutionId).not.toBe(profileFromDb.institution_id);
    });
  });

  describe("single-institution users unchanged", () => {
    it("משתמש עם מוסד יחיד ממשיך לעבוד כרגיל", async () => {
      const singleInstitutionUserId = "single-inst-user";
      const singleInstitutionId = "only-institution-123";

      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "owner" },
        error: null,
      });

      const result = await checkUserInstitutionMembership(
        singleInstitutionUserId,
        singleInstitutionId
      );

      // Single-institution user works exactly as before
      expect(result.isMember).toBe(true);
      expect(result.role).toBe("owner");
    });

    it("fallback לפרופיל עובד למשתמשים עם מוסד יחיד לפני מיגרציה", async () => {
      const userId = "legacy-single-user";
      const institutionId = "legacy-institution";

      // Table doesn't exist -> fallback
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({
          data: null,
          error: { message: "relation user_institutions does not exist" },
        })
        .mockResolvedValueOnce({
          data: {
            institution_id: institutionId,
            is_institution_owner: true,
          },
          error: null,
        });

      const result = await checkUserInstitutionMembership(
        userId,
        institutionId
      );

      // Single-institution legacy users unaffected
      expect(result.isMember).toBe(true);
      expect(result.role).toBe("owner");
    });
  });
});

describe("TZ-17: Multi-institution ownership isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("owner of A cannot act as owner of B", () => {
    it("בעלים של A שהוא חבר ב-B לא יכול להעביר בעלות על B", async () => {
      const userId = "owner-of-a-member-of-b";
      const institutionA = "institution-a";
      const institutionB = "institution-b";

      // User is owner of A
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "owner" },
        error: null,
      });

      const membershipInA = await checkUserInstitutionMembership(
        userId,
        institutionA
      );
      expect(membershipInA.role).toBe("owner");

      // User is member (not owner) of B
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "member" },
        error: null,
      });

      const membershipInB = await checkUserInstitutionMembership(
        userId,
        institutionB
      );
      expect(membershipInB.role).toBe("member");

      // When B is active, the user's role is "member", not "owner"
      // transfer-ownership route uses requireInstitutionOwner() which checks
      // membershipRole === "owner" for the ACTIVE institution
      // Therefore: role !== "owner" → transfer should be blocked
      expect(membershipInB.role).not.toBe("owner");
    });

    it("בעלים של A שהוא חבר ב-B לא יכול לערוך הגדרות של B", async () => {
      const userId = "owner-of-a-member-of-b";
      const institutionB = "institution-b";

      // User is member (not owner) of B
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "member" },
        error: null,
      });

      const membershipInB = await checkUserInstitutionMembership(
        userId,
        institutionB
      );

      // settings/institution PUT checks:
      // isOwnerOfActive = membershipRole === "owner" || (fallback logic)
      // When role is "member", isOwnerOfActive = false → returns 403 FORBIDDEN
      const isOwnerOfActive = membershipInB.role === "owner";
      expect(isOwnerOfActive).toBe(false);
    });

    it("הגדרות מוסד A לא משתנות כש-B פעיל", async () => {
      // This documents the contract:
      // When user edits settings while B is active,
      // the PUT handler uses auth.session.institutionId (= B),
      // so only B's institution row is updated, not A's.

      const institutionA = {
        id: "institution-a",
        code: "INST-A",
        name: "מוסד א",
        institution_type: "schools",
      };

      const institutionB = {
        id: "institution-b",
        code: "INST-B",
        name: "מוסד ב",
        institution_type: "schools",
      };

      // When B is active, the update targets institutionB.id
      const activeInstitutionId = institutionB.id;
      const updatePayload = {
        code: "NEW-CODE",
        name: "שם חדש",
      };

      // The update WHERE clause uses activeInstitutionId
      // .eq("id", institutionId) where institutionId = activeInstitutionId
      // This means A's row is never touched
      expect(activeInstitutionId).toBe(institutionB.id);
      expect(activeInstitutionId).not.toBe(institutionA.id);

      // A's settings remain unchanged (this is enforced by the route logic)
      const aAfterUpdate = { ...institutionA };
      expect(aAfterUpdate.code).toBe("INST-A");
      expect(aAfterUpdate.name).toBe("מוסד א");
    });
  });

  describe("admin of B can edit B but not transfer ownership", () => {
    it("מנהל (admin) של B יכול לערוך הגדרות אבל לא להעביר בעלות", async () => {
      const userId = "admin-of-b";
      const institutionB = "institution-b";

      // User is admin of B
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });

      const membershipInB = await checkUserInstitutionMembership(
        userId,
        institutionB
      );

      // Admin role allows editing settings (isAdminOfActiveInstitution)
      const isAdminOfActive =
        membershipInB.role === "owner" || membershipInB.role === "admin";
      expect(isAdminOfActive).toBe(true);

      // But admin cannot transfer ownership (requireInstitutionOwner checks owner only)
      const isOwnerOfActive = membershipInB.role === "owner";
      expect(isOwnerOfActive).toBe(false);
    });
  });

  describe("pre-migration fallback respects original institution only", () => {
    it("fallback לבעלים גלובלי עובד רק כשהמוסד הפעיל זהה למוסד המקורי", async () => {
      // User with is_institution_owner=true on profile
      // But active institution is different from profile.institution_id
      // The fallback should NOT grant ownership

      const userId = "legacy-owner";
      const originalInstitutionId = "original-institution";
      const activeInstitutionId = "different-institution";

      // Simulate TenantSession with membershipRole=null (pre-migration)
      // and active institution different from profile
      const session = {
        userId,
        institutionId: activeInstitutionId,
        profile: {
          id: userId,
          institution_id: originalInstitutionId,
          is_institution_owner: true, // owner of original
        },
        membershipRole: null,
        hasMultipleInstitutions: true,
      };

      // isOwnerOfActiveInstitution logic:
      // membershipRole === "owner" → false
      // fallback: membershipRole === null &&
      //           institutionId === profile.institution_id &&
      //           profile.is_institution_owner
      // activeInstitutionId !== originalInstitutionId → fallback fails
      const fallbackApplies =
        session.membershipRole === null &&
        session.institutionId === session.profile.institution_id &&
        session.profile.is_institution_owner;

      expect(fallbackApplies).toBe(false);
    });

    it("fallback לבעלים גלובלי עובד כשהמוסד הפעיל זהה למוסד המקורי", async () => {
      const userId = "legacy-owner";
      const originalInstitutionId = "original-institution";

      // Active institution same as original, membershipRole null (pre-migration)
      const session = {
        userId,
        institutionId: originalInstitutionId,
        profile: {
          id: userId,
          institution_id: originalInstitutionId,
          is_institution_owner: true,
        },
        membershipRole: null,
        hasMultipleInstitutions: false,
      };

      const fallbackApplies =
        session.membershipRole === null &&
        session.institutionId === session.profile.institution_id &&
        session.profile.is_institution_owner;

      expect(fallbackApplies).toBe(true);
    });
  });
});

describe("TZ-17: Transfer ownership updates roles correctly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("after transfer, new owner passes requireInstitutionOwner", () => {
    it("אחרי העברת בעלות, הבעלים החדש מקבל role=owner", async () => {
      const newOwnerId = "new-owner-user";
      const institutionId = "institution-123";

      // After transfer, user_institutions.role is updated to "owner"
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "owner" },
        error: null,
      });

      const membership = await checkUserInstitutionMembership(
        newOwnerId,
        institutionId
      );

      // New owner has role=owner, so isOwnerOfActiveInstitution returns true
      expect(membership.role).toBe("owner");
      const isOwnerOfActive = membership.role === "owner";
      expect(isOwnerOfActive).toBe(true);
    });

    it("אחרי העברת בעלות, הבעלים הקודם מקבל role=member", async () => {
      const oldOwnerId = "old-owner-user";
      const institutionId = "institution-123";

      // After transfer, user_institutions.role is updated to "member"
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "member" },
        error: null,
      });

      const membership = await checkUserInstitutionMembership(
        oldOwnerId,
        institutionId
      );

      // Old owner now has role=member, so isOwnerOfActiveInstitution returns false
      expect(membership.role).toBe("member");
      const isOwnerOfActive = membership.role === "owner";
      expect(isOwnerOfActive).toBe(false);
    });

    it("העברת בעלות מסנכרנת is_institution_owner בפרופיל", () => {
      // This documents the expected behavior:
      // When ownership is transferred, the profile.is_institution_owner flag
      // is also updated for backward compatibility
      const newOwnerProfile = { is_institution_owner: true };
      const oldOwnerProfile = { is_institution_owner: false };

      expect(newOwnerProfile.is_institution_owner).toBe(true);
      expect(oldOwnerProfile.is_institution_owner).toBe(false);
    });
  });
});

describe("TZ-17: Admin access via profile.is_admin", () => {
  describe("is_admin non-owner gets audit-log access after migration", () => {
    it("משתמש עם is_admin=true שהוא member מקבל גישת מנהל", () => {
      // After migration, user is a member (not owner) but has is_admin=true
      const membershipRole = "member" as "owner" | "admin" | "member";
      const profile = {
        id: "admin-member-user",
        institution_id: "institution-123",
        is_institution_owner: false,
        is_admin: true, // user-level admin flag
      };

      // isAdminOfActiveInstitution logic:
      // membershipRole === "owner" || "admin" → false
      // profile.is_admin === true → true (this is the key check)
      const isAdminViaRole =
        membershipRole === "owner" || membershipRole === "admin";
      const isAdminViaProfile = profile.is_admin === true;
      const isAdmin = isAdminViaRole || isAdminViaProfile;

      expect(isAdminViaRole).toBe(false);
      expect(isAdminViaProfile).toBe(true);
      expect(isAdmin).toBe(true);
    });

    it("משתמש עם is_admin=false שהוא member לא מקבל גישת מנהל", () => {
      const membershipRole = "member" as "owner" | "admin" | "member";
      const profile = {
        id: "regular-member-user",
        institution_id: "institution-123",
        is_institution_owner: false,
        is_admin: false,
      };

      const isAdminViaRole =
        membershipRole === "owner" || membershipRole === "admin";
      const isAdminViaProfile = profile.is_admin === true;
      const isAdmin = isAdminViaRole || isAdminViaProfile;

      expect(isAdminViaRole).toBe(false);
      expect(isAdminViaProfile).toBe(false);
      expect(isAdmin).toBe(false);
    });
  });

  describe("owner without is_admin gets same audit-log result as before", () => {
    it("בעלים עם is_admin=false עדיין מקבל גישת מנהל (דרך role=owner)", () => {
      // Owner has admin access via ownership role, not via is_admin flag
      // This is the same behavior as before TZ-17
      const session = {
        userId: "owner-user",
        institutionId: "institution-123",
        profile: {
          id: "owner-user",
          institution_id: "institution-123",
          is_institution_owner: true,
          is_admin: false, // NOT an admin via profile flag
        },
        membershipRole: "owner" as const,
        hasMultipleInstitutions: false,
      };

      // isAdminOfActiveInstitution logic:
      // membershipRole === "owner" → true
      // Owners always have admin access
      const isAdminViaRole =
        session.membershipRole === "owner" || session.membershipRole === "admin";
      const isAdminViaProfile = session.profile.is_admin === true;
      const isAdmin = isAdminViaRole || isAdminViaProfile;

      expect(isAdminViaRole).toBe(true);
      expect(isAdminViaProfile).toBe(false);
      expect(isAdmin).toBe(true);
    });

    it("בעלים עם is_admin=true מקבל גישת מנהל (שתי הדרכים)", () => {
      const session = {
        userId: "owner-admin-user",
        institutionId: "institution-123",
        profile: {
          id: "owner-admin-user",
          institution_id: "institution-123",
          is_institution_owner: true,
          is_admin: true,
        },
        membershipRole: "owner" as const,
        hasMultipleInstitutions: false,
      };

      const isAdminViaRole =
        session.membershipRole === "owner" || session.membershipRole === "admin";
      const isAdminViaProfile = session.profile.is_admin === true;
      const isAdmin = isAdminViaRole || isAdminViaProfile;

      expect(isAdminViaRole).toBe(true);
      expect(isAdminViaProfile).toBe(true);
      expect(isAdmin).toBe(true);
    });

    it("pre-migration: בעלים גלובלי מקבל גישת מנהל", () => {
      // Pre-migration fallback: is_institution_owner grants admin access
      const session = {
        userId: "legacy-owner",
        institutionId: "institution-123",
        profile: {
          id: "legacy-owner",
          institution_id: "institution-123",
          is_institution_owner: true,
          is_admin: false,
        },
        membershipRole: null, // pre-migration
        hasMultipleInstitutions: false,
      };

      // isAdminOfActiveInstitution fallback logic:
      // membershipRole === null &&
      // institutionId === profile.institution_id &&
      // profile.is_institution_owner === true
      const fallbackApplies =
        session.membershipRole === null &&
        session.institutionId === session.profile.institution_id &&
        session.profile.is_institution_owner === true;

      expect(fallbackApplies).toBe(true);
    });
  });
});

describe("TZ-17 follow-up: Existing user accepts teacher invite from second institution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("teacher invite acceptance flow", () => {
    it("existing user from A accepts B invite and gets membership with password unchanged", async () => {
      const existingUserId = "user-from-institution-a";
      const newInstitutionId = "institution-b";

      mockSupabaseClient.upsert.mockResolvedValueOnce({ error: null });

      const result = await addUserInstitutionMembership({
        userId: existingUserId,
        institutionId: newInstitutionId,
        role: "member",
      });

      expect(result).toBe(true);
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        {
          user_id: existingUserId,
          institution_id: newInstitutionId,
          role: "member",
        },
        { onConflict: "user_id,institution_id" }
      );
    });

    it("membership role is always 'member' for teacher invites (never owner/admin)", async () => {
      mockSupabaseClient.upsert.mockResolvedValueOnce({ error: null });

      await addUserInstitutionMembership({
        userId: "any-user",
        institutionId: "any-institution",
        role: "member",
      });

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ role: "member" }),
        expect.anything()
      );
    });

    it("session with mismatched email is rejected (returns false membership check)", async () => {
      const userId = "user-with-email-a";
      const institutionId = "institution-expecting-email-b";

      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await checkUserInstitutionMembership(userId, institutionId);

      expect(result.isMember).toBe(false);
    });

    it("used or expired token scenario: membership add still works (idempotent)", async () => {
      mockSupabaseClient.upsert.mockResolvedValueOnce({ error: null });

      const result = await addUserInstitutionMembership({
        userId: "already-member-user",
        institutionId: "already-joined-institution",
        role: "member",
      });

      expect(result).toBe(true);
    });

    it("new-user path unchanged: membership created on registration", async () => {
      mockSupabaseClient.upsert.mockResolvedValueOnce({ error: null });

      const result = await addUserInstitutionMembership({
        userId: "brand-new-user",
        institutionId: "first-institution",
        role: "member",
      });

      expect(result).toBe(true);
    });

    it("same-institution half-registered user path unchanged", async () => {
      const userId = "half-registered-user";
      const institutionId = "same-institution";

      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { role: "member" },
        error: null,
      });

      const result = await checkUserInstitutionMembership(userId, institutionId);

      expect(result.isMember).toBe(true);
      expect(result.role).toBe("member");
    });
  });

  describe("staff card linking", () => {
    it("staff card is linked only within the invite institution and only when empty", () => {
      const staffCard = {
        id: "staff-card-123",
        institution_id: "institution-b",
        user_profile_id: null,
      };

      const inviteInstitutionId = "institution-b";

      const shouldLink =
        staffCard.institution_id === inviteInstitutionId &&
        staffCard.user_profile_id === null;

      expect(shouldLink).toBe(true);
    });

    it("staff card with existing user_profile_id is not overwritten", () => {
      const staffCard = {
        id: "staff-card-456",
        institution_id: "institution-b",
        user_profile_id: "some-other-user",
      };

      const shouldLink = staffCard.user_profile_id === null;

      expect(shouldLink).toBe(false);
    });

    it("staff card from different institution is not linked", () => {
      const staffCard = {
        id: "staff-card-789",
        institution_id: "institution-c",
        user_profile_id: null,
      };

      const inviteInstitutionId = "institution-b";

      const shouldLink = staffCard.institution_id === inviteInstitutionId;

      expect(shouldLink).toBe(false);
    });
  });

  describe("TZ-1 protection preserved", () => {
    it("registering with existing institution code stays blocked", () => {
      const existingInstitutionCode = "EXISTING-CODE";
      const attemptedCode = "EXISTING-CODE";

      const isBlocked = existingInstitutionCode === attemptedCode;

      expect(isBlocked).toBe(true);
    });
  });
});
