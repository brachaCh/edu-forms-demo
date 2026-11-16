import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLASS_CURRICULUM_NOTE_MARKER } from "@/lib/special-ed-mode";
import { specialEdClassKeyFromStudent } from "@/lib/special-ed-class-key";
import type { Student } from "@/lib/supabase/types";

const INST = "inst-1";
const OWNER_USER = "owner-1";

const requireInstitutionAdmin = vi.fn();
const checkUserInstitutionMembership = vi.fn();
const assertTeacherInviteRateLimit = vi.fn();
const createAndSendStaffInvite = vi.fn();
const insertAuditLog = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/server-auth", () => ({
  requireInstitutionAdmin: (...args: unknown[]) =>
    requireInstitutionAdmin(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: () => true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
}));

vi.mock("@/lib/user-institutions", () => ({
  checkUserInstitutionMembership: (...args: unknown[]) =>
    checkUserInstitutionMembership(...args),
}));

vi.mock("@/lib/teacher-invite-server", () => ({
  assertTeacherInviteRateLimit: (...args: unknown[]) =>
    assertTeacherInviteRateLimit(...args),
  createAndSendStaffInvite: (...args: unknown[]) =>
    createAndSendStaffInvite(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  insertAuditLog: (...args: unknown[]) => insertAuditLog(...args),
}));

import { POST } from "./route";

type StudentUpdate = {
  payload: Record<string, unknown>;
  inIds?: string[];
  id?: string;
};

function student(overrides: Partial<Student>): Student {
  return {
    id: overrides.id ?? "s1",
    institution_id: INST,
    category: "schools",
    full_name: "תלמידה",
    phone: null,
    father_name: null,
    mother_name: null,
    status: "special-ed-class",
    class_name: "א1",
    teacher_name: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as Student;
}

function ownerSession() {
  return {
    ok: true as const,
    session: {
      userId: OWNER_USER,
      institutionId: INST,
      membershipRole: "owner" as const,
      hasMultipleInstitutions: false,
      profile: {
        id: OWNER_USER,
        full_name: "רכזת",
        phone: "",
        email: "owner@school.il",
        institution_id: INST,
        is_admin: false,
        is_institution_owner: true,
      },
    },
  };
}

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/special-ed-classes/homeroom-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function installStudentStore(opts: {
  profile: { id: string; institution_id: string | null; full_name: string } | null;
  students: Student[];
}) {
  const rows = opts.students.map((row) => ({ ...row }));
  const updates: StudentUpdate[] = [];

  fromMock.mockImplementation((table: string) => {
    const ctx: {
      op: "select" | "insert" | "update";
      payload?: Record<string, unknown>;
      filters: Record<string, unknown>;
      inIds?: string[];
    } = { op: "select", filters: {} };

    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = vi.fn(chain);
    builder.eq = vi.fn((col: string, val: unknown) => {
      ctx.filters[col] = val;
      return builder;
    });
    builder.is = vi.fn((col: string, val: unknown) => {
      ctx.filters[`${col}:is`] = val;
      return builder;
    });
    builder.in = vi.fn((_col: string, ids: string[]) => {
      ctx.inIds = ids;
      return builder;
    });
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      ctx.op = "insert";
      ctx.payload = payload;
      return builder;
    });
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      ctx.op = "update";
      ctx.payload = payload;
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      if (table === "user_profiles") {
        return { data: opts.profile, error: null };
      }
      return { data: null, error: null };
    });
    builder.single = vi.fn(async () => {
      if (ctx.op === "insert" && table === "students") {
        return { data: { id: "new-staff" }, error: null };
      }
      return { data: null, error: null };
    });
    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => {
      if (table === "students" && ctx.op === "select") {
        return Promise.resolve({ data: rows, error: null }).then(
          onFulfilled,
          onRejected
        );
      }
      if (table === "students" && ctx.op === "update") {
        const targetIds =
          ctx.inIds ??
          (typeof ctx.filters.id === "string" ? [ctx.filters.id] : []);
        updates.push({
          payload: ctx.payload ?? {},
          inIds: ctx.inIds,
          id: typeof ctx.filters.id === "string" ? ctx.filters.id : undefined,
        });
        for (const row of rows) {
          if (targetIds.length === 0 || targetIds.includes(row.id)) {
            Object.assign(row, ctx.payload);
          }
        }
        return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      }
      return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
    };

    return builder;
  });

  return { rows, updates };
}

describe("POST /api/special-ed-classes/homeroom-invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInstitutionAdmin.mockResolvedValue(ownerSession());
    assertTeacherInviteRateLimit.mockResolvedValue({ ok: true });
    createAndSendStaffInvite.mockResolvedValue({ ok: true });
    insertAuditLog.mockResolvedValue(undefined);
    checkUserInstitutionMembership.mockResolvedValue({
      isMember: false,
      role: null,
    });
  });

  it("writes class_name and teacher_name for empty-class students and keeps the class key", async () => {
    const inferred = student({
      id: "inferred",
      full_name: "נועה",
      class_name: "",
      teacher_name: "א1",
    });
    const keyBefore = specialEdClassKeyFromStudent(inferred);
    expect(keyBefore).toBe("א1");

    const store = installStudentStore({
      profile: {
        id: "teacher-user",
        institution_id: "other-inst",
        full_name: "רחל כהן",
      },
      students: [
        inferred,
        student({
          id: "owner",
          full_name: 'תל"כ — א1',
          teacher_name: "א1",
          class_name: "א1",
          notes: CLASS_CURRICULUM_NOTE_MARKER,
        }),
      ],
    });

    const response = await POST(
      jsonRequest({
        className: "א1",
        teacherName: "רחל כהן",
        email: "rachel@school.il",
      })
    );
    const body = (await response.json()) as {
      ok?: boolean;
      action?: string;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);

    const stabilize = store.updates.find(
      (update) =>
        update.inIds?.includes("inferred") &&
        update.payload.class_name === "א1" &&
        update.payload.teacher_name === "רחל כהן"
    );
    expect(stabilize).toBeTruthy();
    expect(stabilize?.payload).toEqual({
      class_name: "א1",
      teacher_name: "רחל כהן",
    });

    const updated = store.rows.find((row) => row.id === "inferred");
    expect(updated).toBeTruthy();
    expect(specialEdClassKeyFromStudent(updated!)).toBe(keyBefore);
    expect(specialEdClassKeyFromStudent(updated!)).toBe("א1");
  });

  it("assigns a linked card whose user is a member and does not send email", async () => {
    checkUserInstitutionMembership.mockResolvedValue({
      isMember: true,
      role: "member",
    });

    const store = installStudentStore({
      profile: {
        id: "user-123",
        institution_id: INST,
        full_name: "רחל כהן",
      },
      students: [
        student({
          id: "linked-staff",
          status: "integration-teacher",
          full_name: "רחל כהן",
          email: "rachel@school.il",
          user_profile_id: "user-123",
          class_name: null,
          teacher_name: null,
        }),
        student({
          id: "in-class",
          full_name: "נועה",
          class_name: "א1",
          teacher_name: null,
        }),
      ],
    });

    const response = await POST(
      jsonRequest({
        className: "א1",
        teacherName: "רחל כהן",
        email: "rachel@school.il",
      })
    );
    const body = (await response.json()) as {
      ok?: boolean;
      action?: string;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action).toBe("assign_existing_member");
    expect(createAndSendStaffInvite).not.toHaveBeenCalled();

    const assign = store.updates.find((update) =>
      update.inIds?.includes("in-class")
    );
    expect(assign?.payload).toEqual({ teacher_name: "רחל כהן" });
  });

  it("sends an invite for a linked card whose user is not a member", async () => {
    checkUserInstitutionMembership.mockResolvedValue({
      isMember: false,
      role: null,
    });

    installStudentStore({
      profile: {
        id: "user-left",
        institution_id: "other-inst",
        full_name: "רחל כהן",
      },
      students: [
        student({
          id: "linked-staff",
          status: "integration-teacher",
          full_name: "רחל כהן",
          email: "rachel@school.il",
          user_profile_id: "user-left",
          class_name: null,
          teacher_name: null,
        }),
        student({
          id: "in-class",
          full_name: "נועה",
          class_name: "א1",
          teacher_name: null,
        }),
      ],
    });

    const response = await POST(
      jsonRequest({
        className: "א1",
        teacherName: "רחל כהן",
        email: "rachel@school.il",
      })
    );
    const body = (await response.json()) as {
      ok?: boolean;
      action?: string;
      message?: string;
    };

    expect(createAndSendStaffInvite).toHaveBeenCalledTimes(1);
    expect(createAndSendStaffInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        staffCardId: "linked-staff",
        email: "rachel@school.il",
      })
    );
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action).toBe("send_invite");
    expect(body.message).toContain("rachel@school.il");
  });

  it("does not report invite-sent success when the email was not sent", async () => {
    createAndSendStaffInvite.mockResolvedValue({
      ok: false,
      error: "EMAIL_SEND_FAILED",
    });
    checkUserInstitutionMembership.mockResolvedValue({
      isMember: false,
      role: null,
    });

    installStudentStore({
      profile: {
        id: "user-left",
        institution_id: "other-inst",
        full_name: "רחל כהן",
      },
      students: [
        student({
          id: "linked-staff",
          status: "integration-teacher",
          full_name: "רחל כהן",
          email: "rachel@school.il",
          user_profile_id: "user-left",
          class_name: null,
          teacher_name: null,
        }),
      ],
    });

    const response = await POST(
      jsonRequest({
        className: "א1",
        teacherName: "רחל כהן",
        email: "rachel@school.il",
      })
    );
    const body = (await response.json()) as {
      ok?: boolean;
      action?: string;
      error?: string;
      partial?: boolean;
    };

    expect(createAndSendStaffInvite).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
    expect(body.ok).toBeUndefined();
    expect(body.action).not.toBe("send_invite");
    expect(body.error).toBe("EMAIL_SEND_FAILED");
    expect(body.partial).toBe(true);
  });
});
