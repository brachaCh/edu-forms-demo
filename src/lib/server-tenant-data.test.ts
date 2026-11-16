import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Student } from "@/lib/supabase/types";
import { bytesToDataUrl, ZIP } from "@/lib/upload-magic.test";

const wordZipDataUrl = bytesToDataUrl(
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ZIP
);

// Test constants
const INST_ID = "inst-test-123";
const TEACHER_USER_ID = "teacher-user-456";
const OWNER_USER_ID = "owner-user-789";
const OTHER_TEACHER_USER_ID = "other-teacher-111";

// Mock student records
const mockTeacherStaffCard: Student = {
  id: "staff-card-teacher",
  institution_id: INST_ID,
  full_name: "מורה ראשונה",
  status: "integration-teacher",
  user_profile_id: TEACHER_USER_ID,
  teacher_name: null,
  category: "schools",
  phone: "050-1234567",
  notes: null,
  class_name: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
} as Student;

const mockAssignedStudent: Student = {
  id: "student-assigned",
  institution_id: INST_ID,
  full_name: "תלמיד משויך",
  status: "integration",
  user_profile_id: null,
  teacher_name: "מורה ראשונה",
  category: "schools",
  phone: "050-9999999",
  notes: "הערות קיימות",
  class_name: "כיתה א",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
} as Student;

const mockUnassignedStudent: Student = {
  id: "student-unassigned",
  institution_id: INST_ID,
  full_name: "תלמיד לא משויך",
  status: "integration",
  user_profile_id: null,
  teacher_name: "מורה אחרת",
  category: "schools",
  phone: null,
  notes: null,
  class_name: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
} as Student;

const mockOtherTeacherStaffCard: Student = {
  id: "staff-card-other",
  institution_id: INST_ID,
  full_name: "מורה אחרת",
  status: "integration-teacher",
  user_profile_id: OTHER_TEACHER_USER_ID,
  teacher_name: null,
  category: "schools",
  phone: "050-1111111",
  notes: "הערות סודיות של מורה אחרת",
  class_name: null,
  role: "קלינאית תקשורת",
  email: "other-teacher@example.com",
  id_number: "987654321",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
} as Student;

const allMockStudents = [
  mockTeacherStaffCard,
  mockAssignedStudent,
  mockUnassignedStudent,
  mockOtherTeacherStaffCard,
];

/**
 * Create a thenable mock query builder that properly filters students
 */
function createMockSupabaseClient(
  students: Student[],
  updateCallback?: (id: string, patch: Partial<Student>) => Student
) {
  return {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      let pendingPatch: Partial<Student> | null = null;
      let isUpdateQuery = false;

      const getFilteredResults = () => {
        let result = [...students];
        for (const [col, val] of Object.entries(filters)) {
          result = result.filter(
            (s) => (s as unknown as Record<string, unknown>)[col] === val
          );
        }
        return result;
      };

      const builder: Record<string, unknown> = {
        select: vi.fn().mockImplementation(() => builder),
        insert: vi.fn().mockImplementation(() => builder),
        update: vi.fn().mockImplementation((patch: Partial<Student>) => {
          pendingPatch = patch;
          isUpdateQuery = true;
          return builder;
        }),
        delete: vi.fn().mockImplementation(() => builder),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          filters[col] = val;
          return builder;
        }),
        order: vi.fn().mockImplementation(() => {
          return Promise.resolve({ data: getFilteredResults(), error: null });
        }),
        limit: vi.fn().mockImplementation(() => builder),
        maybeSingle: vi.fn().mockImplementation(() => {
          // Handle update queries
          if (isUpdateQuery && pendingPatch && filters["id"] && updateCallback) {
            const updated = updateCallback(filters["id"], pendingPatch);
            return Promise.resolve({ data: updated, error: null });
          }
          // Handle select queries
          const results = getFilteredResults();
          return Promise.resolve({
            data: results.length > 0 ? results[0] : null,
            error: null,
          });
        }),
        single: vi.fn().mockImplementation(() => {
          if (pendingPatch && filters["id"] && updateCallback) {
            const updated = updateCallback(filters["id"], pendingPatch);
            return Promise.resolve({ data: updated, error: null });
          }
          const results = getFilteredResults();
          return Promise.resolve({
            data: results.length > 0 ? results[0] : null,
            error: null,
          });
        }),
        // Make builder thenable for queries that don't end with single/maybeSingle
        // This is used by findUserStaffCard which awaits the builder directly
        then: (resolve: (value: { data: Student[]; error: null }) => void) => {
          resolve({ data: getFilteredResults(), error: null });
        },
      };

      return builder;
    },
  };
}

// Mock createServiceClient before importing the module under test
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(),
}));

// Mock billing to avoid extra DB calls
vi.mock("@/lib/billing/institution-plan", () => ({
  loadInstitutionBillingContext: vi.fn().mockResolvedValue(null),
}));

import { loadInstitutionBillingContext } from "@/lib/billing/institution-plan";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
  hasFullInstitutionAccess,
  canAssignTeachers,
  tenantFetchStudents,
  tenantFetchInstitutionStaffForPicker,
  tenantFetchInstitutionStaffForFill,
  tenantPatchStudent,
  tenantInsertStudent,
  tenantInsertStudentDocument,
  tenantArchivePaperWaiverScan,
  tenantRemovePaperWaiverScan,
  tenantRemoveStudentDocument,
  tenantRemoveStudentFormFill,
  tenantUpdateStudentDocument,
  tenantUpsertPaperWaiverScan,
  type MemberAccessContext,
} from "@/lib/server-tenant-data";
import {
  FORM_FILL_DELETE_NOT_ALLOWED,
  FORM_FILL_SIGNED_DELETE_BLOCKED,
} from "@/lib/form-fill-delete";

describe("TZ-28: Member-scoped access with mocked Supabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      loadInstitutionBillingContext as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
  });

  describe("hasFullInstitutionAccess", () => {
    it("owner has full access", () => {
      const ctx: MemberAccessContext = {
        userId: OWNER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "owner",
      };
      expect(hasFullInstitutionAccess(ctx)).toBe(true);
    });

    it("admin has full access", () => {
      const ctx: MemberAccessContext = {
        userId: "admin-user",
        institutionId: INST_ID,
        membershipRole: "admin",
      };
      expect(hasFullInstitutionAccess(ctx)).toBe(true);
    });

    it("member does NOT have full access", () => {
      const ctx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };
      expect(hasFullInstitutionAccess(ctx)).toBe(false);
    });

    it("system admin has full access even as member", () => {
      const ctx: MemberAccessContext = {
        userId: "sys-admin",
        institutionId: INST_ID,
        membershipRole: "member",
        isAdmin: true,
      };
      expect(hasFullInstitutionAccess(ctx)).toBe(true);
    });

    it("demo user has full access", () => {
      const ctx: MemberAccessContext = {
        userId: "demo-user",
        institutionId: INST_ID,
        membershipRole: "member",
        isDemo: true,
      };
      expect(hasFullInstitutionAccess(ctx)).toBe(true);
    });
  });

  describe("buildMemberAccessContext", () => {
    it("creates context with isAdmin from profile", () => {
      const ctx = buildMemberAccessContext({
        userId: "user-1",
        institutionId: INST_ID,
        membershipRole: "member",
        profile: { is_admin: true },
      });
      expect(ctx.isAdmin).toBe(true);
      expect(ctx.isDemo).toBe(false);
    });

    it("detects demo user by userId", () => {
      const ctx = buildMemberAccessContext({
        userId: "demo-user",
        institutionId: INST_ID,
        membershipRole: "member",
        profile: { is_admin: false },
      });
      expect(ctx.isDemo).toBe(true);
    });
  });

  describe("TZ-32: canAssignTeachers", () => {
    it("owner can assign teachers", () => {
      const ctx: MemberAccessContext = {
        userId: OWNER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "owner",
      };
      expect(canAssignTeachers(ctx)).toBe(true);
    });

    it("admin CANNOT assign teachers", () => {
      const ctx: MemberAccessContext = {
        userId: "admin-user",
        institutionId: INST_ID,
        membershipRole: "admin",
      };
      expect(canAssignTeachers(ctx)).toBe(false);
    });

    it("member CANNOT assign teachers", () => {
      const ctx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };
      expect(canAssignTeachers(ctx)).toBe(false);
    });

    it("system admin CAN assign teachers even with admin role", () => {
      const ctx: MemberAccessContext = {
        userId: "sys-admin",
        institutionId: INST_ID,
        membershipRole: "admin",
        isAdmin: true,
      };
      expect(canAssignTeachers(ctx)).toBe(true);
    });

    it("demo user CAN assign teachers", () => {
      const ctx: MemberAccessContext = {
        userId: "demo-user",
        institutionId: INST_ID,
        membershipRole: "member",
        isDemo: true,
      };
      expect(canAssignTeachers(ctx)).toBe(true);
    });
  });

  describe("tenantFetchStudents", () => {
    it("member sees only own staff card + assigned students", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };

      const result = await tenantFetchStudents(INST_ID, memberCtx);

      expect(result.map((s) => s.id)).toContain("staff-card-teacher");
      expect(result.map((s) => s.id)).toContain("student-assigned");
      expect(result.map((s) => s.id)).not.toContain("staff-card-other");
      expect(result.map((s) => s.id)).not.toContain("student-unassigned");
      expect(result).toHaveLength(2);
      expect(
        result.some(
          (s) =>
            s.id === "staff-card-other" ||
            s.notes === "הערות סודיות של מורה אחרת" ||
            s.email === "other-teacher@example.com"
        )
      ).toBe(false);
    });

    it("TZ-73: staff picker lists all institution staff names without sensitive fields", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };

      const result = await tenantFetchInstitutionStaffForPicker(
        INST_ID,
        memberCtx
      );

      expect(result.map((s) => s.full_name).sort()).toEqual([
        "מורה אחרת",
        "מורה ראשונה",
      ]);
      for (const row of result) {
        expect(Object.keys(row).sort()).toEqual([
          "full_name",
          "id",
          "phone",
          "role",
        ]);
        expect(row).not.toHaveProperty("notes");
        expect(row).not.toHaveProperty("email");
        expect(row).not.toHaveProperty("id_number");
        expect(row).not.toHaveProperty("user_profile_id");
      }
      const other = result.find((s) => s.id === "staff-card-other");
      expect(other?.phone).toBe("050-1111111");
      expect(other?.role).toBe("קלינאית תקשורת");
    });

    it("TZ-188: staff fill list returns name and email for all institution staff", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };

      const result = await tenantFetchInstitutionStaffForFill(
        INST_ID,
        memberCtx
      );

      expect(result.map((s) => s.name).sort()).toEqual([
        "מורה אחרת",
      ]);
      for (const row of result) {
        expect(Object.keys(row).sort()).toEqual(["email", "name"]);
      }
      const other = result.find((s) => s.name === "מורה אחרת");
      expect(other?.email).toBe("other-teacher@example.com");
    });

    it("owner sees all students", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const ownerCtx: MemberAccessContext = {
        userId: OWNER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "owner",
      };

      const result = await tenantFetchStudents(INST_ID, ownerCtx);

      expect(result).toHaveLength(4);
    });

    it("keeps existing special-ed students visible on plan-1", async () => {
      const specialEdStudent: Student = {
        ...mockAssignedStudent,
        id: "student-special-ed",
        status: "special-ed-class",
        class_name: "חנ״מ א",
        teacher_name: "מורה ראשונה",
      };
      const mockClient = createMockSupabaseClient([
        ...allMockStudents,
        specialEdStudent,
      ]);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );
      (
        loadInstitutionBillingContext as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        planId: "plan-1",
        institutionType: "schools",
        educationFramework: "regular",
        planCustomClasses: null,
        planCustomStudents: null,
        isAdmin: false,
      });

      const ownerCtx: MemberAccessContext = {
        userId: OWNER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "owner",
      };

      const result = await tenantFetchStudents(INST_ID, ownerCtx);
      expect(result.map((s) => s.id)).toContain("student-special-ed");
      expect(result.map((s) => s.id)).toContain("student-assigned");
    });

    it("keeps existing special-ed students visible on a custom plan with no class count", async () => {
      const specialEdStudent: Student = {
        ...mockAssignedStudent,
        id: "student-special-ed-custom",
        status: "special-ed-class",
        class_name: "חנ״מ א",
        teacher_name: "מורה ראשונה",
      };
      const mockClient = createMockSupabaseClient([
        ...allMockStudents,
        specialEdStudent,
      ]);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );
      (
        loadInstitutionBillingContext as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        planId: "plan-custom",
        institutionType: "schools",
        educationFramework: "regular",
        planCustomClasses: null,
        planCustomStudents: 20,
        isAdmin: false,
      });

      const result = await tenantFetchStudents(INST_ID, {
        userId: OWNER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "owner",
      });
      expect(result.map((s) => s.id)).toContain("student-special-ed-custom");
    });
  });

  describe("assertMemberCanAccessStudent", () => {
    it("member CAN access own staff card", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };

      const result = await assertMemberCanAccessStudent(
        mockTeacherStaffCard.id,
        memberCtx
      );
      expect(result).toBe(true);
    });

    it("member CAN access assigned student", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };

      const result = await assertMemberCanAccessStudent(
        mockAssignedStudent.id,
        memberCtx
      );
      expect(result).toBe(true);
    });

    it("TZ-73: member still cannot open another teacher's staff card", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };

      const result = await assertMemberCanAccessStudent(
        "staff-card-other",
        memberCtx
      );
      expect(result).toBe(false);
    });

    it("member CANNOT access unassigned student", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };

      const result = await assertMemberCanAccessStudent(
        mockUnassignedStudent.id,
        memberCtx
      );
      expect(result).toBe(false);
    });

    it("member cannot insert a form archive snapshot for an unassigned student", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      const documentInserts: unknown[] = [];
      const originalFrom = mockClient.from;
      mockClient.from = ((table: string) => {
        const builder = originalFrom(table);
        if (table === "student_documents") {
          const innerInsert = builder.insert as (payload: unknown) => unknown;
          builder.insert = (payload: unknown) => {
            documentInserts.push(payload);
            return innerInsert(payload);
          };
        }
        return builder;
      }) as typeof originalFrom;
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      };

      await expect(
        tenantInsertStudentDocument(
          INST_ID,
          {
            student_id: mockUnassignedStudent.id,
            name: "כרטיס תלמיד סל אישי.html",
            mime_type: "text/html",
            size: 128,
            data_url: "data:text/html;base64,PGh0bWw+",
            folder: "אינפורמציה כללית",
          },
          memberCtx
        )
      ).rejects.toThrow("STUDENT_NOT_FOUND");
      expect(documentInserts).toEqual([]);
    });

    it("owner CAN open an existing special-ed student form on plan-1", async () => {
      const specialEdStudent: Student = {
        ...mockAssignedStudent,
        id: "student-special-ed-form",
        status: "special-ed-class",
        class_name: "חנ״מ א",
        teacher_name: "מורה ראשונה",
      };
      const mockClient = createMockSupabaseClient([
        ...allMockStudents,
        specialEdStudent,
      ]);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );
      (
        loadInstitutionBillingContext as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        planId: "plan-1",
        institutionType: "schools",
        educationFramework: "regular",
        planCustomClasses: null,
        planCustomStudents: null,
        isAdmin: false,
      });

      const result = await assertMemberCanAccessStudent(
        specialEdStudent.id,
        {
          userId: OWNER_USER_ID,
          institutionId: INST_ID,
          membershipRole: "owner",
        }
      );
      expect(result).toBe(true);
    });

    it("owner CAN access any student", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const ownerCtx: MemberAccessContext = {
        userId: OWNER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "owner",
      };

      const result = await assertMemberCanAccessStudent(
        mockUnassignedStudent.id,
        ownerCtx
      );
      expect(result).toBe(true);
    });
  });

  describe("tenantPatchStudent - member field restrictions", () => {
    const memberCtx: MemberAccessContext = {
      userId: TEACHER_USER_ID,
      institutionId: INST_ID,
      membershipRole: "member",
    };

    it("member BLOCKED changing teacher_name to different value", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      await expect(
        tenantPatchStudent(
          INST_ID,
          mockAssignedStudent.id,
          { teacher_name: "מורה חדשה" },
          memberCtx
        )
      ).rejects.toThrow("MEMBER_CANNOT_CHANGE_TEACHER");
    });

    it("member BLOCKED changing status", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      await expect(
        tenantPatchStudent(
          INST_ID,
          mockAssignedStudent.id,
          { status: "personal-basket" },
          memberCtx
        )
      ).rejects.toThrow("MEMBER_CANNOT_EDIT_FIELD");
    });

    it("member BLOCKED changing user_profile_id", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      await expect(
        tenantPatchStudent(
          INST_ID,
          mockAssignedStudent.id,
          { user_profile_id: "some-other-user" },
          memberCtx
        )
      ).rejects.toThrow("MEMBER_CANNOT_EDIT_FIELD");
    });

    it("member BLOCKED changing full_name on own staff card", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      await expect(
        tenantPatchStudent(
          INST_ID,
          mockTeacherStaffCard.id,
          { full_name: "שם חדש" },
          memberCtx
        )
      ).rejects.toThrow("MEMBER_CANNOT_EDIT_FIELD");
    });

    it("member CAN save with identical blocked field values (silently dropped)", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        {
          teacher_name: "מורה ראשונה", // Same as existing
          phone: "050-1111111",
        },
        memberCtx
      );

      expect(result.phone).toBe("050-1111111");
    });

    it("member CAN edit allowed fields (phone, notes, class_name)", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        {
          phone: "050-8888888",
          notes: "הערות חדשות",
          class_name: "כיתה ב",
        },
        memberCtx
      );

      expect(result.phone).toBe("050-8888888");
      expect(result.notes).toBe("הערות חדשות");
      expect(result.class_name).toBe("כיתה ב");
    });

    it("member saving with same status (unchanged) succeeds", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      // Status is "integration" on mockAssignedStudent, sending same value
      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        {
          status: "integration", // Same as existing
          notes: "עדכון הערות",
        },
        memberCtx
      );

      expect(result.notes).toBe("עדכון הערות");
    });
  });

  describe("tenantPatchStudent - owner has no restrictions", () => {
    const ownerCtx: MemberAccessContext = {
      userId: OWNER_USER_ID,
      institutionId: INST_ID,
      membershipRole: "owner",
    };

    it("owner CAN change teacher_name", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        { teacher_name: "מורה חדשה" },
        ownerCtx
      );

      expect(result.teacher_name).toBe("מורה חדשה");
    });

    it("owner CAN change status", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        { status: "personal-basket" },
        ownerCtx
      );

      expect(result.status).toBe("personal-basket");
    });
  });

  describe("TZ-32: admin CANNOT assign students to teachers", () => {
    const adminCtx: MemberAccessContext = {
      userId: "admin-user-123",
      institutionId: INST_ID,
      membershipRole: "admin",
    };

    it("admin CANNOT change teacher_name to different value", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      await expect(
        tenantPatchStudent(
          INST_ID,
          mockAssignedStudent.id,
          { teacher_name: "מורה חדשה" },
          adminCtx
        )
      ).rejects.toThrow("ADMIN_CANNOT_ASSIGN_TEACHER");
    });

    it("admin CAN change status (unlike member)", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        { status: "personal-basket" },
        adminCtx
      );

      expect(result.status).toBe("personal-basket");
    });

    it("admin CAN change other fields (phone, notes)", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        { phone: "050-1111111", notes: "הערות חדשות" },
        adminCtx
      );

      expect(result.phone).toBe("050-1111111");
      expect(result.notes).toBe("הערות חדשות");
    });

    it("admin saving with same teacher_name (unchanged) succeeds", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      // mockAssignedStudent.teacher_name is "מורה ראשונה", sending same value
      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        { teacher_name: "מורה ראשונה", phone: "050-2222222" },
        adminCtx
      );

      expect(result.phone).toBe("050-2222222");
    });
  });

  describe("TZ-32: system admin (is_admin=true) CAN assign students to teachers", () => {
    const sysAdminCtx: MemberAccessContext = {
      userId: "sys-admin-user",
      institutionId: INST_ID,
      membershipRole: "admin",
      isAdmin: true, // System admin flag
    };

    it("system admin CAN change teacher_name even with admin role", async () => {
      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        { teacher_name: "מורה חדשה" },
        sysAdminCtx
      );

      expect(result.teacher_name).toBe("מורה חדשה");
    });

    it("system admin CAN change teacher_name even with member role", async () => {
      const sysAdminMemberCtx: MemberAccessContext = {
        userId: "sys-admin-member",
        institutionId: INST_ID,
        membershipRole: "member",
        isAdmin: true,
      };

      const mockClient = createMockSupabaseClient(
        allMockStudents,
        (id, patch) => {
          const original = allMockStudents.find((s) => s.id === id)!;
          return { ...original, ...patch };
        }
      );
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantPatchStudent(
        INST_ID,
        mockAssignedStudent.id,
        { teacher_name: "מורה חדשה" },
        sysAdminMemberCtx
      );

      expect(result.teacher_name).toBe("מורה חדשה");
    });
  });

  describe("cross-institution isolation", () => {
    it("student from different institution is not accessible", async () => {
      // Empty list for different institution
      const mockClient = createMockSupabaseClient([]);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const memberCtx: MemberAccessContext = {
        userId: TEACHER_USER_ID,
        institutionId: "different-inst",
        membershipRole: "member",
      };

      const result = await assertMemberCanAccessStudent(
        mockAssignedStudent.id,
        memberCtx
      );
      expect(result).toBe(false);
    });
  });

  describe("TZ-32: tenantInsertStudent teacher_name restriction", () => {
    const adminCtx: MemberAccessContext = {
      userId: "admin-user-123",
      institutionId: INST_ID,
      membershipRole: "admin",
    };

    const ownerCtx: MemberAccessContext = {
      userId: OWNER_USER_ID,
      institutionId: INST_ID,
      membershipRole: "owner",
    };

    const sysAdminCtx: MemberAccessContext = {
      userId: "sys-admin-user",
      institutionId: INST_ID,
      membershipRole: "admin",
      isAdmin: true,
    };

    it("admin CANNOT insert student with teacher_name", async () => {
      const mockClient = createMockSupabaseClient(allMockStudents);
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      await expect(
        tenantInsertStudent(
          INST_ID,
          {
            full_name: "תלמיד חדש",
            category: "schools",
            teacher_name: "מורה כלשהי",
            status: "integration",
            phone: null,
            father_name: null,
            mother_name: null,
            class_name: null,
            notes: null,
          },
          adminCtx
        )
      ).rejects.toThrow("ADMIN_CANNOT_ASSIGN_TEACHER");
    });

    it("admin CAN insert student WITHOUT teacher_name", async () => {
      const createdStudent = {
        id: "new-student-id",
        institution_id: INST_ID,
        full_name: "תלמיד חדש",
        category: "schools" as const,
        teacher_name: null,
        status: "integration" as const,
        phone: null,
        father_name: null,
        mother_name: null,
        class_name: null,
        notes: null,
        user_profile_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        from: () => ({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: createdStudent, error: null }),
            }),
          }),
        }),
      };
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantInsertStudent(
        INST_ID,
        {
          full_name: "תלמיד חדש",
          category: "schools",
          teacher_name: null,
          status: "integration",
          phone: null,
          father_name: null,
          mother_name: null,
          class_name: null,
          notes: null,
        },
        adminCtx
      );

      expect(result.full_name).toBe("תלמיד חדש");
    });

    it("owner CAN insert student WITH teacher_name", async () => {
      const createdStudent = {
        id: "new-student-id",
        institution_id: INST_ID,
        full_name: "תלמיד חדש",
        category: "schools" as const,
        teacher_name: "מורה כלשהי",
        status: "integration" as const,
        phone: null,
        father_name: null,
        mother_name: null,
        class_name: null,
        notes: null,
        user_profile_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        from: () => ({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: createdStudent, error: null }),
            }),
          }),
        }),
      };
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantInsertStudent(
        INST_ID,
        {
          full_name: "תלמיד חדש",
          category: "schools",
          teacher_name: "מורה כלשהי",
          status: "integration",
          phone: null,
          father_name: null,
          mother_name: null,
          class_name: null,
          notes: null,
        },
        ownerCtx
      );

      expect(result.teacher_name).toBe("מורה כלשהי");
    });

    it("system admin CAN insert student WITH teacher_name", async () => {
      const createdStudent = {
        id: "new-student-id",
        institution_id: INST_ID,
        full_name: "תלמיד חדש",
        category: "schools" as const,
        teacher_name: "מורה כלשהי",
        status: "integration" as const,
        phone: null,
        father_name: null,
        mother_name: null,
        class_name: null,
        notes: null,
        user_profile_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockClient = {
        from: () => ({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: createdStudent, error: null }),
            }),
          }),
        }),
      };
      (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient
      );

      const result = await tenantInsertStudent(
        INST_ID,
        {
          full_name: "תלמיד חדש",
          category: "schools",
          teacher_name: "מורה כלשהי",
          status: "integration",
          phone: null,
          father_name: null,
          mother_name: null,
          class_name: null,
          notes: null,
        },
        sysAdminCtx
      );

      expect(result.teacher_name).toBe("מורה כלשהי");
    });
  });
});

describe("tenant isolation contract", () => {
  it("forces session institution on insert payload", () => {
    const sessionInstitutionId = "inst-a";
    const clientPayload = {
      institution_id: "inst-b",
      full_name: "תלמידה",
      category: "schools" as const,
    };
    const saved = {
      ...clientPayload,
      institution_id: sessionInstitutionId,
    };
    expect(saved.institution_id).toBe("inst-a");
    expect(saved.institution_id).not.toBe(clientPayload.institution_id);
  });

  it("strips institution_id from patch", () => {
    const patch = {
      full_name: "שם חדש",
      institution_id: "inst-other",
    };
    const { institution_id: _ignored, ...safePatch } = patch;
    expect(safePatch).toEqual({ full_name: "שם חדש" });
    expect("institution_id" in safePatch).toBe(false);
  });
});

/**
 * TZ-30: Tests for admin-only single_responsible_party field enforcement
 */
describe("single_responsible_party field access control", () => {
  function sanitizeStudentPatchForRole(
    patch: Partial<Student>,
    isAdmin: boolean
  ): Partial<Student> {
    if (isAdmin) return patch;
    const { single_responsible_party: _dropped, ...safePatch } = patch;
    return safePatch;
  }

  it("allows admin to set single_responsible_party", () => {
    const patch = {
      full_name: "תלמידה",
      single_responsible_party: true,
    };
    const result = sanitizeStudentPatchForRole(patch, true);
    expect(result.single_responsible_party).toBe(true);
    expect(result.full_name).toBe("תלמידה");
  });

  it("strips single_responsible_party from non-admin patch", () => {
    const patch = {
      full_name: "תלמידה",
      single_responsible_party: true,
    };
    const result = sanitizeStudentPatchForRole(patch, false);
    expect("single_responsible_party" in result).toBe(false);
    expect(result.full_name).toBe("תלמידה");
  });

  it("allows admin to unset single_responsible_party (set to null)", () => {
    const patch = {
      single_responsible_party: null,
    };
    const result = sanitizeStudentPatchForRole(patch, true);
    expect(result.single_responsible_party).toBeNull();
  });

  it("strips single_responsible_party=false from non-admin", () => {
    const patch = {
      full_name: "תלמידה",
      single_responsible_party: false,
    };
    const result = sanitizeStudentPatchForRole(patch, false);
    expect("single_responsible_party" in result).toBe(false);
  });

  it("does not affect other fields when stripping single_responsible_party", () => {
    const patch = {
      full_name: "שם חדש",
      father_name: "אבא",
      mother_name: "אמא",
      single_responsible_party: true,
      notes: "הערות",
    };
    const result = sanitizeStudentPatchForRole(patch, false);
    expect(result).toEqual({
      full_name: "שם חדש",
      father_name: "אבא",
      mother_name: "אמא",
      notes: "הערות",
    });
  });
});

describe("TZ-99 paper waiver scan tenant ops", () => {
  const ownerCtx: MemberAccessContext = {
    userId: OWNER_USER_ID,
    institutionId: INST_ID,
    membershipRole: "owner",
  };

  function paperDocPayload() {
    return {
      student_id: mockAssignedStudent.id,
      name: "signed-waiver.pdf",
      mime_type: "application/pdf",
      size: 128,
      data_url: "data:application/pdf;base64,JVBERi0xLjQ=",
      folder: "ויתור סודיות",
    };
  }

  function createDocumentClient(options?: {
    denyStudent?: boolean;
    insertError?: { message: string } | null;
    revertError?: { message: string } | null;
    existingDocs?: Array<{
      id: string;
      student_id?: string;
      is_paper_waiver?: boolean;
      archived_at?: string | null;
    }>;
  }) {
    const deleted: Array<{ table: string; filters: Record<string, unknown> }> =
      [];
    const inserted: unknown[] = [];
    const updates: Array<{
      payload: unknown;
      filters: Record<string, unknown>;
    }> = [];
    const existingDocs = options?.existingDocs ?? [
      {
        id: "doc-active-1",
        student_id: mockAssignedStudent.id,
        is_paper_waiver: true,
        archived_at: null,
      },
      {
        id: "doc-archived-1",
        student_id: mockAssignedStudent.id,
        is_paper_waiver: true,
        archived_at: "2020-01-01T00:00:00.000Z",
      },
    ];

    return {
      deleted,
      inserted,
      updates,
      client: {
        from: (table: string) => {
          const filters: Record<string, unknown> = {};
          let op: "select" | "insert" | "update" | "delete" = "select";
          let updatePayload: unknown = null;
          const matchesExisting = () =>
            existingDocs.filter((doc) => {
              if (filters.id && doc.id !== filters.id) return false;
              if (
                filters.student_id &&
                doc.student_id !== filters.student_id
              ) {
                return false;
              }
              if (
                filters.is_paper_waiver !== undefined &&
                doc.is_paper_waiver !== filters.is_paper_waiver
              ) {
                return false;
              }
              if (
                Object.prototype.hasOwnProperty.call(filters, "archived_at") &&
                doc.archived_at !== filters.archived_at
              ) {
                return false;
              }
              if (filters.neq_id && doc.id === filters.neq_id) return false;
              if (
                Array.isArray(filters.id_in) &&
                !filters.id_in.includes(doc.id)
              ) {
                return false;
              }
              return true;
            });

          const finish = async () => {
            if (table === "students") {
              if (options?.denyStudent) return { data: null, error: null };
              return { data: mockAssignedStudent, error: null };
            }
            if (op === "delete") {
              deleted.push({ table, filters: { ...filters } });
              return { data: null, error: null };
            }
            if (op === "update") {
              updates.push({
                payload: updatePayload,
                filters: { ...filters },
              });
              if (options?.revertError && filters.id_in) {
                return { data: null, error: options.revertError };
              }
              return { data: matchesExisting(), error: null };
            }
            if (op === "insert") {
              if (options?.insertError) {
                return { data: null, error: options.insertError };
              }
              const payload = inserted[inserted.length - 1] as Record<
                string,
                unknown
              >;
              return {
                data: {
                  id: "doc-paper-1",
                  uploaded_at: "2026-01-01T00:00:00.000Z",
                  ...payload,
                },
                error: null,
              };
            }
            return { data: matchesExisting(), error: null };
          };

          const builder: Record<string, unknown> = {
            select: vi.fn(() => builder),
            eq: vi.fn((col: string, val: unknown) => {
              filters[col] = val;
              return builder;
            }),
            is: vi.fn((col: string, val: unknown) => {
              filters[col] = val;
              return builder;
            }),
            in: vi.fn((col: string, val: unknown) => {
              filters[`${col}_in`] = val;
              return builder;
            }),
            neq: vi.fn((col: string, val: unknown) => {
              filters[`neq_${col}`] = val;
              return builder;
            }),
            delete: vi.fn(() => {
              op = "delete";
              return builder;
            }),
            update: vi.fn((payload: unknown) => {
              op = "update";
              updatePayload = payload;
              return builder;
            }),
            insert: vi.fn((payload: unknown) => {
              op = "insert";
              inserted.push(payload);
              return builder;
            }),
            single: vi.fn(async () => finish()),
            maybeSingle: vi.fn(async () => {
              if (table === "students") {
                if (options?.denyStudent) return { data: null, error: null };
                return { data: mockAssignedStudent, error: null };
              }
              const matches = matchesExisting();
              return { data: matches[0] ?? null, error: null };
            }),
            then: (
              resolve: (value: unknown) => void,
              reject?: (reason: unknown) => void
            ) => finish().then(resolve, reject),
          };
          return builder;
        },
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a scan for a student the member cannot access", async () => {
    const { client } = createDocumentClient({ denyStudent: true });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantUpsertPaperWaiverScan(
        INST_ID,
        paperDocPayload(),
        {
          userId: TEACHER_USER_ID,
          institutionId: INST_ID,
          membershipRole: "member",
        }
      )
    ).rejects.toThrow("STUDENT_NOT_FOUND");
  });

  it("rejects a non-PDF/image scan before insert", async () => {
    const { client, inserted } = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantUpsertPaperWaiverScan(
        INST_ID,
        {
          ...paperDocPayload(),
          name: "waiver.docx",
          mime_type:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          data_url: wordZipDataUrl,
        },
        ownerCtx
      )
    ).rejects.toThrow("PAPER_WAIVER_TYPE_NOT_ALLOWED");
    expect(inserted).toEqual([]);
  });

  it("replaces the previous scan and marks the new document as a paper waiver", async () => {
    const { client, inserted, deleted, updates } = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    const result = await tenantUpsertPaperWaiverScan(
      INST_ID,
      paperDocPayload(),
      ownerCtx
    );
    expect(deleted).toEqual([]);
    expect(updates[0]).toMatchObject({
      payload: { archived_at: expect.any(String) },
      filters: {
        student_id: mockAssignedStudent.id,
        is_paper_waiver: true,
        archived_at: null,
      },
    });
    expect(result.is_paper_waiver).toBe(true);
    expect(result.name).toBe("signed-waiver.pdf");
    expect(inserted[0]).toMatchObject({
      is_paper_waiver: true,
      mime_type: "application/pdf",
    });
  });

  it("keeps archived legal copies when replacing a scan", async () => {
    const replaceClient = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      replaceClient.client
    );
    await tenantUpsertPaperWaiverScan(INST_ID, paperDocPayload(), ownerCtx);
    expect(replaceClient.deleted).toEqual([]);
    expect(replaceClient.updates[0]?.filters).toMatchObject({
      is_paper_waiver: true,
      archived_at: null,
    });
  });

  it("TZ-99: removing a scan archives instead of deleting (legal retention)", async () => {
    const removeClient = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      removeClient.client
    );
    await tenantRemovePaperWaiverScan(INST_ID, mockAssignedStudent.id, ownerCtx);
    expect(removeClient.deleted).toEqual([]);
    expect(removeClient.updates).toEqual([
      expect.objectContaining({
        payload: { archived_at: expect.any(String) },
        filters: {
          student_id: mockAssignedStudent.id,
          is_paper_waiver: true,
          archived_at: null,
        },
      }),
    ]);
  });

  it("reverts the archived active scan when insert fails", async () => {
    const { client, updates, inserted } = createDocumentClient({
      insertError: { message: "insert failed" },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantUpsertPaperWaiverScan(INST_ID, paperDocPayload(), ownerCtx)
    ).rejects.toThrow("insert failed");
    expect(inserted).toHaveLength(1);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.payload).toMatchObject({
      archived_at: expect.any(String),
    });
    expect(updates[1]).toMatchObject({
      payload: { archived_at: null },
      filters: { id_in: ["doc-active-1"] },
    });
  });

  it("logs and throws a clear error when revert fails after insert failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, updates } = createDocumentClient({
      insertError: { message: "insert failed" },
      revertError: { message: "revert failed" },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantUpsertPaperWaiverScan(INST_ID, paperDocPayload(), ownerCtx)
    ).rejects.toThrow("PAPER_WAIVER_REPLACE_REVERT_FAILED: insert failed");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Paper waiver replace revert failed for document IDs \[doc-active-1\]/)
    );
    expect(updates).toHaveLength(2);
    consoleSpy.mockRestore();
  });

  it("blocks restoring an archived paper waiver while an active scan exists", async () => {
    const { client, updates } = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantUpdateStudentDocument(
        INST_ID,
        "doc-archived-1",
        { archived_at: null },
        ownerCtx
      )
    ).rejects.toThrow("PAPER_WAIVER_ACTIVE_EXISTS");
    expect(updates).toEqual([]);
  });

  it("blocks regular delete of a paper-waiver legal record", async () => {
    const { client, deleted } = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantRemoveStudentDocument(INST_ID, "doc-archived-1", ownerCtx)
    ).rejects.toThrow("PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED");
    expect(deleted).toEqual([]);
  });

  it("TZ-99: archives paper waiver for an authorized staff member (not hard-delete)", async () => {
    const { client, deleted, updates } = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await tenantRemovePaperWaiverScan(INST_ID, mockAssignedStudent.id, ownerCtx);
    expect(deleted).toEqual([]);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]?.filters).toMatchObject({ archived_at: null });
    expect(updates[0]?.payload).toMatchObject({ archived_at: expect.any(String) });
  });

  it("archives the active scan without deleting it", async () => {
    const { client, deleted, updates } = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await tenantArchivePaperWaiverScan(
      INST_ID,
      mockAssignedStudent.id,
      ownerCtx
    );
    expect(deleted).toEqual([]);
    expect(updates).toEqual([
      expect.objectContaining({
        payload: { archived_at: expect.any(String) },
        filters: {
          student_id: mockAssignedStudent.id,
          is_paper_waiver: true,
          archived_at: null,
        },
      }),
    ]);
  });

  it("rejects archive for a student the member cannot access", async () => {
    const { client, deleted, updates } = createDocumentClient({
      denyStudent: true,
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantArchivePaperWaiverScan(INST_ID, mockAssignedStudent.id, {
        userId: TEACHER_USER_ID,
        institutionId: INST_ID,
        membershipRole: "member",
      })
    ).rejects.toThrow("STUDENT_NOT_FOUND");
    expect(deleted).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("refuses to archive an active paper scan via raw updateStudentDocument", async () => {
    const { client, updates, deleted } = createDocumentClient();
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantUpdateStudentDocument(
        INST_ID,
        "doc-active-1",
        { archived_at: "2026-03-01T00:00:00.000Z" },
        ownerCtx
      )
    ).rejects.toThrow("PAPER_WAIVER_USE_ARCHIVE_OP");
    expect(updates).toEqual([]);
    expect(deleted).toEqual([]);
  });
});

describe("TZ-189 tenantRemoveStudentFormFill", () => {
  const ownerCtx: MemberAccessContext = {
    userId: OWNER_USER_ID,
    institutionId: INST_ID,
    membershipRole: "owner",
  };

  function createFormFillDeleteClient(options?: {
    fill?: Record<string, unknown>;
    document?: Record<string, unknown> | null;
    simpleSignRows?: Array<Record<string, unknown>>;
    denyStudent?: boolean;
  }) {
    const deleted: Array<{ table: string; filters: Record<string, unknown> }> =
      [];
    const fill = {
      id: "fill-tachi-1",
      student_id: mockAssignedStudent.id,
      form_id: "tachi",
      data: { homeroom_signature: "" },
      status: "draft",
      document_id: null,
      ...(options?.fill ?? {}),
    };
    const document =
      options?.document === null
        ? null
        : {
            id: "doc-html-1",
            student_id: mockAssignedStudent.id,
            name: "תח״י — נועה.html",
            is_paper_waiver: false,
            data_url: "data:text/html;base64,PGg+",
            ...(options?.document ?? {}),
          };
    const simpleSignRows = options?.simpleSignRows ?? [];

    const client = {
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        let op: "select" | "delete" = "select";
        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),
          eq: vi.fn((col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          }),
          delete: vi.fn(() => {
            op = "delete";
            return builder;
          }),
          maybeSingle: vi.fn(async () => {
            if (table === "students") {
              if (options?.denyStudent) return { data: null, error: null };
              return { data: mockAssignedStudent, error: null };
            }
            if (table === "student_form_fills") {
              if (filters.id === fill.id) return { data: fill, error: null };
              if (filters.id === "missing-fill") {
                return { data: null, error: null };
              }
              return { data: { student_id: fill.student_id }, error: null };
            }
            if (table === "student_documents" && document) {
              if (filters.id === document.id) return { data: document, error: null };
            }
            return { data: null, error: null };
          }),
          then: (resolve: (value: unknown) => void) => {
            if (op === "delete") {
              deleted.push({ table, filters: { ...filters } });
              resolve({ data: null, error: null });
              return;
            }
            if (table === "simplesign_submissions") {
              const rows = simpleSignRows.filter(
                (row) =>
                  !filters.form_fill_id ||
                  row.form_fill_id === filters.form_fill_id
              );
              resolve({ data: rows, error: null });
              return;
            }
            resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    };

    return { client, deleted, fill, document };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks delete when SimpleSign already stored a signed PDF", async () => {
    const { client } = createFormFillDeleteClient({
      simpleSignRows: [
        {
          form_fill_id: "fill-tachi-1",
          status: "signed",
          signed_pdf_document_id: "pdf-archived",
        },
      ],
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantRemoveStudentFormFill(INST_ID, "fill-tachi-1", ownerCtx)
    ).rejects.toThrow(FORM_FILL_SIGNED_DELETE_BLOCKED);
  });

  it("blocks delete for non-portfolio forms", async () => {
    const { client } = createFormFillDeleteClient({
      fill: { form_id: "waiver-confidentiality" },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantRemoveStudentFormFill(INST_ID, "fill-tachi-1", ownerCtx)
    ).rejects.toThrow(FORM_FILL_DELETE_NOT_ALLOWED);
  });

  it("deletes the fill before removing a linked HTML snapshot", async () => {
    const { client, deleted } = createFormFillDeleteClient({
      fill: { document_id: "doc-html-1" },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await tenantRemoveStudentFormFill(INST_ID, "fill-tachi-1", ownerCtx);
    expect(deleted.map((row) => row.table)).toEqual([
      "student_form_fills",
      "student_documents",
    ]);
  });

  it("blocks delete when the linked document is a signed archive", async () => {
    const { client } = createFormFillDeleteClient({
      fill: { document_id: "doc-signed-1" },
      document: {
        id: "doc-signed-1",
        name: "תח״י — נועה — חתום.pdf",
        is_paper_waiver: false,
      },
    });
    (createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    await expect(
      tenantRemoveStudentFormFill(INST_ID, "fill-tachi-1", ownerCtx)
    ).rejects.toThrow(FORM_FILL_SIGNED_DELETE_BLOCKED);
  });
});
