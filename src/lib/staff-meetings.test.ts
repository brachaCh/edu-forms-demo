import { describe, expect, it } from "vitest";
import { tableCellKey, tableRowCountKey } from "./form-table-grids";
import { createStaffMeetingBodySchema } from "./validation/staff-meetings";
import {
  assertCanCreateStaffMeetingInvite,
  buildStaffMeetingInviteDraft,
  canManageStaffMeetingInvites,
  collectUpcomingFormRowMeetings,
  filterEligibleStaffForInvite,
  filterMeetingsForViewer,
  isEligibleStaffCardForInvite,
  isUpcomingStaffMeetingDate,
  isUpcomingTimestamp,
  mapInstitutionStaffRow,
  memberCanViewStaffMeeting,
  mergeUpcomingStaffMeetings,
  parseStaffMeetingAt,
  redactStaffMeetingInviteePii,
  selectValidInvitees,
  summarizeInviteSendResults,
  type InstitutionStaffMember,
  type StaffInviteCandidateRow,
  type StaffMeetingAccessContext,
  type UpcomingStaffMeeting,
} from "./staff-meetings";
import { buildStaffMeetingInviteEmail } from "./staff-meeting-invite-email";
import type { Student } from "./supabase/types";

const INST = "inst-1";
const MEMBER: StaffMeetingAccessContext = {
  userId: "member-1",
  institutionId: INST,
  membershipRole: "member",
};
const OWNER: StaffMeetingAccessContext = {
  userId: "owner-1",
  institutionId: INST,
  membershipRole: "owner",
};
const ADMIN: StaffMeetingAccessContext = {
  userId: "admin-1",
  institutionId: INST,
  membershipRole: "admin",
};

function meeting(
  partial: Partial<UpcomingStaffMeeting> & { id: string }
): UpcomingStaffMeeting {
  return {
    source: "invitation",
    institution_id: INST,
    student_id: null,
    student_name: null,
    title: "ישיבת צוות",
    meeting_at: "2026-12-01T06:00:00.000Z",
    location: null,
    notes: null,
    participants: null,
    invitation_subject: "הזמנה",
    invitees: [],
    ...partial,
  };
}

describe("canManageStaffMeetingInvites", () => {
  it("allows owner, admin, system admin, and demo", () => {
    expect(canManageStaffMeetingInvites(OWNER)).toBe(true);
    expect(canManageStaffMeetingInvites(ADMIN)).toBe(true);
    expect(
      canManageStaffMeetingInvites({ ...MEMBER, isAdmin: true })
    ).toBe(true);
    expect(
      canManageStaffMeetingInvites({ ...MEMBER, isDemo: true })
    ).toBe(true);
  });

  it("blocks members from creating and inviting", () => {
    expect(canManageStaffMeetingInvites(MEMBER)).toBe(false);
    expect(() => assertCanCreateStaffMeetingInvite(MEMBER)).toThrow(
      "FORBIDDEN"
    );
    expect(() => assertCanCreateStaffMeetingInvite(OWNER)).not.toThrow();
  });
});

describe("parseStaffMeetingAt", () => {
  it("parses an Israel-local date and time to UTC ISO", () => {
    const iso = parseStaffMeetingAt("2026-07-15", "09:30");
    expect(iso).toBeTruthy();
    const parsed = new Date(iso as string);
    expect(parsed.toLocaleString("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })).toMatch(/09:30/);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("defaults to 08:00 and rejects invalid values", () => {
    expect(parseStaffMeetingAt("2026-07-15")).toBeTruthy();
    expect(parseStaffMeetingAt("15/07/2026")).toBeNull();
    expect(parseStaffMeetingAt("2026-07-15", "25:00")).toBeNull();
  });
});

describe("isUpcomingTimestamp / isUpcomingStaffMeetingDate", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  it("treats later timestamps as upcoming", () => {
    expect(isUpcomingTimestamp("2026-06-11T00:00:00.000Z", now)).toBe(true);
    expect(isUpcomingTimestamp("2026-06-10T11:00:00.000Z", now)).toBe(false);
  });

  it("uses the Israel calendar date for form rows", () => {
    expect(isUpcomingStaffMeetingDate("2026-06-11", now)).toBe(true);
    expect(isUpcomingStaffMeetingDate("2026-06-09", now)).toBe(false);
    expect(isUpcomingStaffMeetingDate("יום ראשון", now)).toBe(false);
  });
});

describe("TZ-28 visibility for staff meetings", () => {
  const assigned = meeting({
    id: "m-assigned",
    student_id: "student-assigned",
    title: "ישיבה על תלמיד משויך",
  });
  const otherStudent = meeting({
    id: "m-other",
    student_id: "student-other",
    title: "ישיבה על תלמיד אחר",
  });
  const invitedByUser = meeting({
    id: "m-invited-user",
    student_id: "student-other",
    title: "הוזמנתי",
    invitees: [
      {
        id: "i1",
        staff_student_id: null,
        user_id: "member-1",
        full_name: "מורה",
        email: "a@example.com",
        sent_at: null,
      },
    ],
  });
  const invitedByStaffCard = meeting({
    id: "m-invited-card",
    student_id: null,
    title: "הזמנה לכרטיס צוות",
    invitees: [
      {
        id: "i2",
        staff_student_id: "staff-card-1",
        user_id: null,
        full_name: "מורה",
        email: "a@example.com",
        sent_at: null,
      },
    ],
  });

  it("lets a member see invited meetings and assigned-student meetings only", () => {
    expect(
      memberCanViewStaffMeeting(assigned, {
        userId: "member-1",
        staffCardId: "staff-card-1",
        accessibleStudentIds: new Set(["student-assigned"]),
      })
    ).toBe(true);
    expect(
      memberCanViewStaffMeeting(otherStudent, {
        userId: "member-1",
        staffCardId: "staff-card-1",
        accessibleStudentIds: new Set(["student-assigned"]),
      })
    ).toBe(false);
    expect(
      memberCanViewStaffMeeting(invitedByUser, {
        userId: "member-1",
        staffCardId: "staff-card-1",
        accessibleStudentIds: new Set(["student-assigned"]),
      })
    ).toBe(true);
    expect(
      memberCanViewStaffMeeting(invitedByStaffCard, {
        userId: "member-1",
        staffCardId: "staff-card-1",
        accessibleStudentIds: new Set(["student-assigned"]),
      })
    ).toBe(true);
  });

  it("does not leak other students' meetings to members", () => {
    const visible = filterMeetingsForViewer(
      [assigned, otherStudent, invitedByUser],
      MEMBER,
      {
        staffCardId: "staff-card-1",
        accessibleStudentIds: new Set(["student-assigned"]),
      }
    );
    expect(visible.map((m) => m.id).sort()).toEqual(
      ["m-assigned", "m-invited-user"].sort()
    );
  });

  it("strips invitee emails and invite subject for members who see a meeting only via student access", () => {
    const viaStudent = meeting({
      id: "m-pii",
      student_id: "student-assigned",
      invitation_subject: "הזמנה פנימית",
      invitees: [
        {
          id: "i-secret",
          staff_student_id: "other-staff",
          user_id: "other-user",
          full_name: "רחל כהן",
          email: "secret@school.il",
          sent_at: null,
        },
      ],
    });
    const visible = filterMeetingsForViewer([viaStudent], MEMBER, {
      staffCardId: "staff-card-1",
      accessibleStudentIds: new Set(["student-assigned"]),
    });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.invitation_subject).toBeNull();
    expect(visible[0]?.invitees[0]?.email).toBe("");
    expect(visible[0]?.invitees[0]?.full_name).toBe("רחל כהן");
  });

  it("keeps invitee emails and subject for owner/admin", () => {
    const withPii = meeting({
      id: "m-owner",
      invitation_subject: "הזמנה פנימית",
      invitees: [
        {
          id: "i-keep",
          staff_student_id: "s1",
          user_id: "u1",
          full_name: "רחל",
          email: "rachel@school.il",
          sent_at: null,
        },
      ],
    });
    const visible = filterMeetingsForViewer([withPii], OWNER, {
      staffCardId: null,
      accessibleStudentIds: new Set(),
    });
    expect(visible[0]?.invitation_subject).toBe("הזמנה פנימית");
    expect(visible[0]?.invitees[0]?.email).toBe("rachel@school.il");
  });

  it("shows the owner every meeting in the tenant", () => {
    const visible = filterMeetingsForViewer(
      [assigned, otherStudent],
      OWNER,
      { staffCardId: null, accessibleStudentIds: new Set() }
    );
    expect(visible).toHaveLength(2);
  });
});

describe("redactStaffMeetingInviteePii", () => {
  it("clears emails and invitation subject", () => {
    const redacted = redactStaffMeetingInviteePii(
      meeting({
        id: "r1",
        invitation_subject: "סודי",
        invitees: [
          {
            id: "i1",
            staff_student_id: "s1",
            user_id: "u1",
            full_name: "דנה",
            email: "dana@school.il",
            sent_at: "2026-01-01T00:00:00Z",
          },
        ],
      })
    );
    expect(redacted.invitation_subject).toBeNull();
    expect(redacted.invitees[0]?.email).toBe("");
    expect(redacted.invitees[0]?.full_name).toBe("דנה");
  });
});

describe("eligible staff cards for invite", () => {
  const memberIds = new Set(["user-active"]);
  const activeLinked: StaffInviteCandidateRow = {
    id: "s-active",
    full_name: "רחל פעילה",
    email: "rachel@school.il",
    role: "יועצת",
    user_profile_id: "user-active",
    archived_at: null,
  };
  const unlinked: StaffInviteCandidateRow = {
    id: "s-unlinked",
    full_name: "מורה חדשה",
    email: "new@school.il",
    role: "מורה",
    user_profile_id: null,
    archived_at: null,
  };
  const archived: StaffInviteCandidateRow = {
    id: "s-archived",
    full_name: "בארכיון",
    email: "old@school.il",
    role: "מורה",
    user_profile_id: "user-active",
    archived_at: "2026-01-01T00:00:00Z",
  };
  const leftInstitution: StaffInviteCandidateRow = {
    id: "s-left",
    full_name: "עזבה",
    email: "left@school.il",
    role: "מורה",
    user_profile_id: "user-left",
    archived_at: null,
  };

  it("excludes archived cards and linked users who are no longer members", () => {
    expect(isEligibleStaffCardForInvite(activeLinked, memberIds)).toBe(true);
    expect(isEligibleStaffCardForInvite(unlinked, memberIds)).toBe(true);
    expect(isEligibleStaffCardForInvite(archived, memberIds)).toBe(false);
    expect(isEligibleStaffCardForInvite(leftInstitution, memberIds)).toBe(false);
  });

  it("lists only eligible cards for the invite picker", () => {
    const listed = filterEligibleStaffForInvite(
      [activeLinked, unlinked, archived, leftInstitution],
      memberIds
    );
    expect(listed.map((s) => s.id).sort()).toEqual(
      ["s-active", "s-unlinked"].sort()
    );
  });

  it("rejects archived / non-member ids when validating recipients", () => {
    const listed = filterEligibleStaffForInvite(
      [activeLinked, archived, leftInstitution],
      memberIds
    );
    const selected = selectValidInvitees(listed, [
      "s-active",
      "s-archived",
      "s-left",
    ]);
    expect(selected.invitees.map((s) => s.id)).toEqual(["s-active"]);
    expect(selected.missing.sort()).toEqual(["s-archived", "s-left"].sort());
  });
});

describe("summarizeInviteSendResults", () => {
  it("keeps the actual invitee email when a send rejects", () => {
    const summary = summarizeInviteSendResults(
      [
        { id: "i1", email: "a@school.il" },
        { id: "i2", email: "b@school.il" },
      ],
      [
        { status: "fulfilled", value: { sent: false } },
        {
          status: "rejected",
          reason: new Error("network"),
        },
      ]
    );
    expect(summary.sentTo).toEqual([]);
    expect(summary.failedTo).toEqual(["a@school.il", "b@school.il"]);
    expect(summary.failedTo).not.toContain("unknown");
  });
});

describe("buildStaffMeetingInviteDraft", () => {
  it("builds Hebrew RTL invitation copy", () => {
    const draft = buildStaffMeetingInviteDraft({
      title: "ישיבת שילוב",
      meetingAt: parseStaffMeetingAt("2026-12-01", "10:00") as string,
      studentName: "נועה כהן",
      location: "חדר מורות",
      notes: "נא להביא סיכומים",
    });
    expect(draft.subject).toBe("הזמנה לישיבת צוות — ישיבת שילוב");
    expect(draft.text).toContain("שלום רב");
    expect(draft.text).toContain("מוזמנת לישיבת צוות");
    expect(draft.text).toContain("נושא: ישיבת שילוב");
    expect(draft.text).toContain("בנוגע ל: נועה כהן");
    expect(draft.text).toContain("מקום: חדר מורות");
    expect(draft.text).toContain("נא להביא סיכומים");
    expect(draft.text).toContain("ההנהלה וצוות בית הספר");
  });
});

describe("buildStaffMeetingInviteEmail", () => {
  it("wraps the edited text in a Hebrew RTL HTML document", () => {
    const { html } = buildStaffMeetingInviteEmail({
      subject: "הזמנה לישיבת צוות",
      text: "שלום רב,\nמוזמנת לישיבה.",
    });
    expect(html).toContain('lang="he"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("הזמנה לישיבת צוות");
    expect(html).toContain("מוזמנת לישיבה");
    expect(html).toContain("text-align:right");
  });
});

describe("selectValidInvitees", () => {
  const staff: InstitutionStaffMember[] = [
    mapInstitutionStaffRow({
      id: "s1",
      full_name: "רחל כהן",
      email: "rachel@school.il",
      role: "יועצת",
      user_profile_id: "u1",
    }),
    mapInstitutionStaffRow({
      id: "s2",
      full_name: "דנה לוי",
      email: "",
      role: "מורה",
      user_profile_id: null,
    }),
  ];

  it("keeps staff with email and reports missing / no-email", () => {
    const result = selectValidInvitees(staff, ["s1", "s2", "s-missing", "s1"]);
    expect(result.invitees.map((s) => s.id)).toEqual(["s1"]);
    expect(result.withoutEmail).toEqual(["דנה לוי"]);
    expect(result.missing).toEqual(["s-missing"]);
  });
});

describe("collectUpcomingFormRowMeetings + merge", () => {
  const student = {
    id: "stu-1",
    institution_id: INST,
    full_name: "נועה כהן",
    status: "integration",
    category: "schools",
    phone: null,
    notes: null,
    class_name: null,
    teacher_name: "רחל",
    father_name: null,
    mother_name: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as Student;

  it("reads future rows from the existing staff-meetings form", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    const data: Record<string, string> = {
      [tableRowCountKey("staff-meetings")]: "2",
      [tableCellKey("staff-meetings", 0, "date")]: "2026-03-01",
      [tableCellKey("staff-meetings", 0, "participants")]: "מחנכת",
      [tableCellKey("staff-meetings", 0, "summary")]: "עבר",
      [tableCellKey("staff-meetings", 1, "date")]: "2026-12-01",
      [tableCellKey("staff-meetings", 1, "participants")]: "יועצת",
      [tableCellKey("staff-meetings", 1, "summary")]: "עתיד",
    };
    const rows = collectUpcomingFormRowMeetings({
      institutionId: INST,
      students: [student],
      fills: [{ student_id: "stu-1", data }],
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("form-row");
    expect(rows[0]?.title).toContain("נועה כהן");
    expect(rows[0]?.participants).toBe("יועצת");
  });

  it("dedupes a form row when an invitation already exists that day", () => {
    const invited = meeting({
      id: "inv-1",
      student_id: "stu-1",
      meeting_at: parseStaffMeetingAt("2026-12-01", "10:00") as string,
    });
    const formRow = meeting({
      id: "form:stu-1:1",
      source: "form-row",
      student_id: "stu-1",
      meeting_at: parseStaffMeetingAt("2026-12-01", "08:00") as string,
    });
    const merged = mergeUpcomingStaffMeetings([invited], [formRow]);
    expect(merged.map((m) => m.id)).toEqual(["inv-1"]);
  });
});

describe("createStaffMeetingBodySchema", () => {
  const valid = {
    title: "ישיבת צוות",
    date: "2026-12-01",
    time: "10:00",
    location: null,
    notes: null,
    student_id: null,
    invitation_subject: "הזמנה לישיבת צוות",
    invitation_text: "שלום רב,\nמוזמנת לישיבת צוות ביום שלישי.",
    staff_student_ids: ["550e8400-e29b-41d4-a716-446655440000"],
  };

  it("accepts a valid invitation payload", () => {
    expect(createStaffMeetingBodySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty invitee list and a short invitation", () => {
    expect(
      createStaffMeetingBodySchema.safeParse({
        ...valid,
        staff_student_ids: [],
      }).success
    ).toBe(false);
    expect(
      createStaffMeetingBodySchema.safeParse({
        ...valid,
        invitation_text: "קצר",
      }).success
    ).toBe(false);
  });
});
