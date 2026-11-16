import { describe, expect, it } from "vitest";
import { CLASS_CURRICULUM_NOTE_MARKER } from "./special-ed-mode";
import { specialEdClassKeyFromStudent } from "./special-ed-class-key";
import type { Student } from "@/lib/supabase/types";
import {
  applyTeacherNameToClassStudents,
  assignedTeacherNameForClass,
  assertCanInviteHomeroomTeacher,
  canAssignHomeroomTeacher,
  classStudentsToAssign,
  decideHomeroomInvite,
  findExistingStaffCard,
  homeroomInviteAssignedMessage,
  homeroomInviteAlreadyMemberMessage,
  homeroomInviteErrorMessage,
  homeroomInviteSentMessage,
  normalizeHomeroomInviteEmail,
  ownerHomeroomPatch,
  planClassTeacherAssignment,
  resolveClassHomeroomTeacher,
  studentsEligibleToAssign,
  teacherNameForClassAssignment,
} from "./special-ed-homeroom-invite";

function student(overrides: Partial<Student>): Student {
  return {
    id: overrides.id ?? "s1",
    institution_id: "inst-1",
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

describe("decideHomeroomInvite", () => {
  it("requires a teacher name", () => {
    expect(
      decideHomeroomInvite({
        rawEmail: "dana@school.il",
        teacherName: "  ",
        isMemberOfInstitution: false,
      })
    ).toEqual({ ok: false, error: "NAME_REQUIRED" });
  });

  it("rejects non-ASCII or invalid email after stripping invisibles", () => {
    expect(
      decideHomeroomInvite({
        rawEmail: "מחנכת@school.il",
        teacherName: "רחל",
        isMemberOfInstitution: false,
      })
    ).toEqual({ ok: false, error: "INVALID_EMAIL" });
    expect(
      decideHomeroomInvite({
        rawEmail: "not-email",
        teacherName: "רחל",
        isMemberOfInstitution: false,
      })
    ).toEqual({ ok: false, error: "INVALID_EMAIL" });
  });

  it("normalizes email and assigns when she is already a member", () => {
    expect(
      decideHomeroomInvite({
        rawEmail: "  Dana\u200b@School.IL ",
        teacherName: "  רחל כהן  ",
        isMemberOfInstitution: true,
      })
    ).toEqual({
      ok: true,
      action: "assign_existing_member",
      email: "dana@school.il",
      teacherName: "רחל כהן",
    });
  });

  it("sends an invite when the email is not a member of this institution", () => {
    expect(
      decideHomeroomInvite({
        rawEmail: "dana@school.il",
        teacherName: "רחל כהן",
        isMemberOfInstitution: false,
      })
    ).toEqual({
      ok: true,
      action: "send_invite",
      email: "dana@school.il",
      teacherName: "רחל כהן",
    });
  });
});

describe("findExistingStaffCard", () => {
  const cards = [
    {
      id: "staff-email",
      status: "integration-teacher",
      email: "dana@school.il",
      user_profile_id: null,
      full_name: "דנה",
    },
    {
      id: "staff-linked",
      status: "integration-teacher",
      email: "other@school.il",
      user_profile_id: "user-1",
      full_name: "רחל",
    },
    {
      id: "student",
      status: "special-ed-class",
      email: "dana@school.il",
      user_profile_id: null,
      full_name: "תלמידה",
    },
  ];

  it("reuses the linked staff card for an existing member (no duplicate)", () => {
    expect(
      findExistingStaffCard(cards, { email: "dana@school.il", userId: "user-1" })
        ?.id
    ).toBe("staff-linked");
  });

  it("falls back to matching staff email", () => {
    expect(
      findExistingStaffCard(cards, { email: "Dana@School.IL" })?.id
    ).toBe("staff-email");
  });

  it("ignores student cards with the same email", () => {
    expect(
      findExistingStaffCard(
        cards.filter((c) => c.id !== "staff-email"),
        { email: "dana@school.il" }
      )
    ).toBeNull();
  });
});

describe("classStudentsToAssign", () => {
  const owner = student({
    id: "owner",
    full_name: 'תל"כ — א1',
    teacher_name: "א1",
    class_name: "א1",
    notes: CLASS_CURRICULUM_NOTE_MARKER,
  });
  const inClass = student({ id: "in", full_name: "נועה", class_name: "א1" });
  const otherClass = student({ id: "out", class_name: "ב2" });
  const archived = student({
    id: "arch",
    class_name: "א1",
    archived_at: "2026-01-01",
  });
  const staff = student({
    id: "staff",
    status: "integration-teacher",
    full_name: "רחל",
    class_name: null,
  });

  it("includes only active roster students of that class", () => {
    const ids = classStudentsToAssign(
      [owner, inClass, otherClass, archived, staff],
      "א1",
      "schools"
    ).map((s) => s.id);
    expect(ids).toEqual(["in"]);
  });
});

describe("applyTeacherNameToClassStudents / TZ-32 write helper", () => {
  it("sets teacher_name on every roster student", () => {
    const updated = applyTeacherNameToClassStudents(
      [student({ id: "a", teacher_name: null }), student({ id: "b", teacher_name: "ישנה" })],
      "רחל כהן"
    );
    expect(updated.map((s) => s.teacher_name)).toEqual(["רחל כהן", "רחל כהן"]);
  });

  it("reuses teacherNameForWrite so non-assigners cannot set a name", () => {
    expect(assignedTeacherNameForClass("רחל", false)).toBeNull();
    expect(assignedTeacherNameForClass("  רחל  ", true)).toBe("רחל");
  });

  it("prefers the existing staff-card name for assignment", () => {
    expect(
      teacherNameForClassAssignment("שם שהוקלד", { full_name: "רחל כהן" })
    ).toBe("רחל כהן");
    expect(teacherNameForClassAssignment("שם שהוקלד", null)).toBe("שם שהוקלד");
  });
});

describe("resolveClassHomeroomTeacher", () => {
  it("uses owner homeroom_teacher and matching staff email — never the owner row email", () => {
    expect(
      resolveClassHomeroomTeacher({
        owner: { homeroom_teacher: "רחל" },
        students: [{ teacher_name: "מישהי אחרת" }],
        staffCards: [{ full_name: "רחל", email: "rachel@school.il" }],
      })
    ).toEqual({ name: "רחל", email: "rachel@school.il" });
    expect(
      resolveClassHomeroomTeacher({
        owner: { homeroom_teacher: "רחל" },
        students: [],
        staffCards: [],
      })
    ).toEqual({ name: "רחל", email: "" });
  });

  it("falls back to assigned teacher_name and matching staff email", () => {
    expect(
      resolveClassHomeroomTeacher({
        owner: { homeroom_teacher: "" },
        students: [{ teacher_name: "רחל כהן" }],
        staffCards: [{ full_name: "רחל כהן", email: "rachel@school.il" }],
      })
    ).toEqual({ name: "רחל כהן", email: "rachel@school.il" });
  });
});

describe("TZ-32: invite vs assign by role", () => {
  it("owner can invite and assign (teacher_name + homeroom_teacher)", () => {
    expect(assertCanInviteHomeroomTeacher({ membershipRole: "owner" })).toBe(
      null
    );
    expect(
      canAssignHomeroomTeacher({ membershipRole: "owner", isAdmin: false })
    ).toBe(true);
    expect(ownerHomeroomPatch("רחל", true)).toEqual({ homeroom_teacher: "רחל" });
    expect(assignedTeacherNameForClass("רחל", true)).toBe("רחל");
  });

  it("institution admin may invite only — no assignment writes", () => {
    expect(assertCanInviteHomeroomTeacher({ membershipRole: "admin" })).toBe(
      null
    );
    expect(
      canAssignHomeroomTeacher({ membershipRole: "admin", isAdmin: false })
    ).toBe(false);
    expect(ownerHomeroomPatch("רחל", false)).toBeNull();
    expect(assignedTeacherNameForClass("רחל", false)).toBeNull();
    expect(homeroomInviteAlreadyMemberMessage("רחל", false)).toBe(
      "המחנכת רחל כבר חברה במוסד"
    );
  });

  it("regular member cannot invite or assign", () => {
    expect(assertCanInviteHomeroomTeacher({ membershipRole: "member" })).toBe(
      "FORBIDDEN"
    );
    expect(
      canAssignHomeroomTeacher({ membershipRole: "member", isAdmin: false })
    ).toBe(false);
  });

  it("system admin can invite and assign even as a member", () => {
    expect(
      assertCanInviteHomeroomTeacher({
        membershipRole: "member",
        isAdmin: true,
      })
    ).toBe(null);
    expect(
      canAssignHomeroomTeacher({ membershipRole: "member", isAdmin: true })
    ).toBe(true);
    expect(ownerHomeroomPatch("רחל כהן", true)).toEqual({
      homeroom_teacher: "רחל כהן",
    });
  });
});

describe("classStudentsToAssign", () => {
  it("matches class roster by normalized keys (א vs כיתה א)", () => {
    const roster = classStudentsToAssign(
      [
        student({ id: "a1", class_name: "א", full_name: "נועה" }),
        student({ id: "a2", class_name: "כיתה ב", full_name: "יעל" }),
      ],
      "כיתה א",
      "schools"
    );
    expect(roster.map((s) => s.id)).toEqual(["a1"]);
  });
});

describe("planClassTeacherAssignment", () => {
  it("assigns only unassigned students unless reassignment is confirmed", () => {
    const plan = planClassTeacherAssignment(
      [
        student({ id: "u", teacher_name: null }),
        student({ id: "same", teacher_name: "רחל" }),
        student({
          id: "other",
          full_name: "נועה",
          teacher_name: "מירי",
        }),
      ],
      "רחל"
    );
    expect(plan.unassigned.map((s) => s.id)).toEqual(["u"]);
    expect(plan.alreadyThisTeacher.map((s) => s.id)).toEqual(["same"]);
    expect(plan.wouldReassign.map((s) => s.id)).toEqual(["other"]);
    expect(studentsEligibleToAssign(plan, false).map((s) => s.id)).toEqual([
      "u",
    ]);
    expect(studentsEligibleToAssign(plan, true).map((s) => s.id)).toEqual([
      "u",
      "other",
    ]);
  });

  it("treats empty class_name as unassigned so inferred class members are not a reassign", () => {
    const plan = planClassTeacherAssignment(
      [
        student({
          id: "inferred",
          class_name: "",
          teacher_name: "א1",
        }),
        student({
          id: "null-class",
          class_name: null,
          teacher_name: "א1",
        }),
      ],
      "רחל כהן"
    );
    expect(plan.unassigned.map((s) => s.id)).toEqual(["inferred", "null-class"]);
    expect(plan.wouldReassign).toEqual([]);
  });

  it("ownerHomeroomPatch never includes email", () => {
    expect(ownerHomeroomPatch("רחל", true)).toEqual({
      homeroom_teacher: "רחל",
    });
    expect(Object.keys(ownerHomeroomPatch("רחל", true) ?? {})).toEqual([
      "homeroom_teacher",
    ]);
  });
});

describe("normalizeHomeroomInviteEmail", () => {
  it("keeps _ and % as literal characters, not ILIKE wildcards", () => {
    expect(normalizeHomeroomInviteEmail("Dana_1@School.IL")).toBe(
      "dana_1@school.il"
    );
    expect(normalizeHomeroomInviteEmail("dana%plus@school.il")).toBe(
      "dana%plus@school.il"
    );
  });
});

describe("Hebrew messages", () => {
  it("returns clear success and error copy", () => {
    expect(homeroomInviteErrorMessage("INVALID_EMAIL")).toBe(
      "כתובת המייל אינה תקינה"
    );
    expect(homeroomInviteErrorMessage("FORBIDDEN")).toContain("מנהלת");
    expect(homeroomInviteAssignedMessage("רחל")).toBe(
      "המחנכת רחל כבר חברה במוסד — שויכה לכיתה"
    );
    expect(homeroomInviteSentMessage("dana@school.il")).toBe(
      "ההזמנה נשלחה לכתובת dana@school.il"
    );
  });
});

describe("TZ-32 Bugbot fix: class membership stability on assign", () => {
  it("preserves class key when class_name is set before changing teacher_name", () => {
    const studentInferredFromTeacher = student({
      id: "inferred",
      full_name: "נועה",
      class_name: "",
      teacher_name: "א1",
    });
    const keyBefore = specialEdClassKeyFromStudent(studentInferredFromTeacher);
    expect(keyBefore).toBe("א1");

    const studentStabilized = {
      ...studentInferredFromTeacher,
      class_name: "א1",
      teacher_name: "רחל כהן",
    };
    const keyAfter = specialEdClassKeyFromStudent(studentStabilized);
    expect(keyAfter).toBe("א1");
  });

  it("identifies students needing class_name stabilization", () => {
    const roster = [
      student({ id: "has-class", class_name: "א1", teacher_name: null }),
      student({ id: "inferred", class_name: "", teacher_name: "א1" }),
      student({ id: "inferred2", class_name: null, teacher_name: "א1" }),
    ];
    const needClassName = roster.filter((s) => !s.class_name?.trim());
    const hasClassName = roster.filter((s) => s.class_name?.trim());

    expect(needClassName.map((s) => s.id)).toEqual(["inferred", "inferred2"]);
    expect(hasClassName.map((s) => s.id)).toEqual(["has-class"]);
  });
});

describe("TZ-32 Bugbot fix: linked staff card detection", () => {
  it("findExistingStaffCard returns linked staff card when user_profile_id is set", () => {
    const cards = [
      {
        id: "linked-staff",
        status: "integration-teacher",
        email: "linked@school.il",
        user_profile_id: "user-123",
        full_name: "מורה מקושרת",
      },
      {
        id: "unlinked-staff",
        status: "integration-teacher",
        email: "unlinked@school.il",
        user_profile_id: null,
        full_name: "מורה לא מקושרת",
      },
    ];

    const byEmail = findExistingStaffCard(cards, { email: "linked@school.il" });
    expect(byEmail?.id).toBe("linked-staff");
    expect(byEmail?.user_profile_id).toBe("user-123");

    const byUserId = findExistingStaffCard(cards, {
      email: "unlinked@school.il",
      userId: "user-123",
    });
    expect(byUserId?.id).toBe("linked-staff");
  });

  it("does not treat a linked card as a reason to skip the invite by itself", () => {
    const linkedCard = {
      id: "linked-staff",
      status: "integration-teacher",
      email: "linked@school.il",
      user_profile_id: "user-123",
    };

    const isMember = false;
    const decision = decideHomeroomInvite({
      rawEmail: linkedCard.email,
      teacherName: "רחל",
      isMemberOfInstitution: isMember,
    });

    expect(Boolean(linkedCard.user_profile_id)).toBe(true);
    expect(decision).toMatchObject({ ok: true, action: "send_invite" });
  });
});
