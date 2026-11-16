/**
 * TZ-23: לוגיקה טהורה לישיבות צוות — בטוח לייבוא בצד לקוח.
 * פעולות DB נמצאות ב-staff-meetings-server.ts
 */

import {
  formatStaffMeetingDateForEmail,
  listStaffMeetingRows,
} from "@/lib/staff-meeting-parent-email";
import { formatStudentDisplayName } from "@/lib/person-name";
import type { InstitutionMembershipRole, Student } from "@/lib/supabase/types";

export const STAFF_MEETING_TIMEZONE = "Asia/Jerusalem";
export const DEFAULT_STAFF_MEETING_TIME = "08:00";
export const MAX_STAFF_MEETING_INVITEES = 40;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type StaffMeetingSource = "invitation" | "form-row";

export type InstitutionStaffMember = {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
  user_profile_id: string | null;
  hasEmail: boolean;
};

/** כרטיס צוות לפני סינון הזמנה (ארכיון / חברות) */
export type StaffInviteCandidateRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  user_profile_id: string | null;
  archived_at?: string | null;
};

export type StaffMeetingInviteeView = {
  id: string;
  staff_student_id: string | null;
  user_id: string | null;
  full_name: string;
  email: string;
  sent_at: string | null;
};

export type UpcomingStaffMeeting = {
  id: string;
  source: StaffMeetingSource;
  institution_id: string;
  student_id: string | null;
  student_name: string | null;
  title: string;
  meeting_at: string;
  location: string | null;
  notes: string | null;
  participants: string | null;
  invitation_subject: string | null;
  invitees: StaffMeetingInviteeView[];
};

export type StaffMeetingInviteDraft = {
  subject: string;
  text: string;
};

export type CreateStaffMeetingInput = {
  title: string;
  meetingAt: string;
  location?: string | null;
  notes?: string | null;
  studentId?: string | null;
  invitationSubject: string;
  invitationText: string;
  staffStudentIds: string[];
};

export type CreateStaffMeetingResult = {
  meeting: UpcomingStaffMeeting;
  sentTo: string[];
  failedTo: string[];
};

export type StaffMeetingAccessContext = {
  userId: string;
  institutionId: string;
  membershipRole: InstitutionMembershipRole | null;
  isAdmin?: boolean;
  isDemo?: boolean;
};

export function canManageStaffMeetingInvites(
  ctx: StaffMeetingAccessContext
): boolean {
  if (ctx.isDemo || ctx.isAdmin) return true;
  return ctx.membershipRole === "owner" || ctx.membershipRole === "admin";
}

export function assertCanCreateStaffMeetingInvite(
  ctx: StaffMeetingAccessContext
): void {
  if (!canManageStaffMeetingInvites(ctx)) {
    throw new Error("FORBIDDEN");
  }
}

/** תאריך מקומי ב-Asia/Jerusalem כ-YYYY-MM-DD */
export function israelCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STAFF_MEETING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/**
 * מפרש תאריך (ושעה אופציונלית) כשעון ישראל ומחזיר ISO UTC.
 * ברירת מחדל לשעה: 08:00.
 */
export function parseStaffMeetingAt(
  date: string,
  time?: string | null
): string | null {
  const dateValue = date.trim();
  const timeValue = (time ?? "").trim() || DEFAULT_STAFF_MEETING_TIME;
  if (!ISO_DATE_RE.test(dateValue) || !ISO_TIME_RE.test(timeValue)) {
    return null;
  }

  const isoLocal = `${dateValue}T${timeValue}:00`;
  const asUtc = new Date(`${isoLocal}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;

  const tzWall = asUtc.toLocaleString("en-US", {
    timeZone: STAFF_MEETING_TIMEZONE,
  });
  const tzDate = new Date(tzWall);
  if (Number.isNaN(tzDate.getTime())) return null;
  const offset = asUtc.getTime() - tzDate.getTime();
  return new Date(asUtc.getTime() + offset).toISOString();
}

export function isUpcomingTimestamp(
  meetingAt: string,
  now: Date = new Date()
): boolean {
  const t = new Date(meetingAt).getTime();
  return !Number.isNaN(t) && t > now.getTime();
}

/** תאריך טופס (YYYY-MM-DD) עתידי או היום לפי לוח ישראל */
export function isUpcomingStaffMeetingDate(
  raw: string,
  now: Date = new Date()
): boolean {
  const value = raw.trim();
  if (!ISO_DATE_RE.test(value)) return false;
  return value >= israelCalendarDate(now);
}

export function formatStaffMeetingDateTimeHe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatStaffMeetingDateForEmail(iso);
  return d.toLocaleString("he-IL", {
    timeZone: STAFF_MEETING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function memberCanViewStaffMeeting(
  meeting: {
    student_id: string | null;
    invitees: Array<{
      user_id: string | null;
      staff_student_id: string | null;
    }>;
  },
  access: {
    userId: string;
    staffCardId: string | null;
    accessibleStudentIds: ReadonlySet<string>;
  }
): boolean {
  if (
    meeting.invitees.some(
      (invitee) =>
        invitee.user_id === access.userId ||
        (access.staffCardId &&
          invitee.staff_student_id === access.staffCardId)
    )
  ) {
    return true;
  }
  if (meeting.student_id && access.accessibleStudentIds.has(meeting.student_id)) {
    return true;
  }
  return false;
}

export function filterMeetingsForViewer(
  meetings: UpcomingStaffMeeting[],
  ctx: StaffMeetingAccessContext,
  access: {
    staffCardId: string | null;
    accessibleStudentIds: ReadonlySet<string>;
  }
): UpcomingStaffMeeting[] {
  if (canManageStaffMeetingInvites(ctx)) return meetings;
  return meetings
    .filter((meeting) =>
      memberCanViewStaffMeeting(meeting, {
        userId: ctx.userId,
        staffCardId: access.staffCardId,
        accessibleStudentIds: access.accessibleStudentIds,
      })
    )
    .map(redactStaffMeetingInviteePii);
}

/**
 * חברי צוות (לא owner/admin) לא מקבלים מיילי מוזמנים ולא את נושא ההזמנה.
 * מי שרואה ישיבה רק בגלל גישה לתלמיד — בלי PII של המוזמנים.
 */
export function redactStaffMeetingInviteePii(
  meeting: UpcomingStaffMeeting
): UpcomingStaffMeeting {
  return {
    ...meeting,
    invitation_subject: null,
    invitees: meeting.invitees.map((invitee) => ({
      ...invitee,
      email: "",
    })),
  };
}

export function buildStaffMeetingInviteDraft(args: {
  title: string;
  meetingAt: string;
  studentName?: string | null;
  location?: string | null;
  notes?: string | null;
}): StaffMeetingInviteDraft {
  const title = args.title.trim() || "ישיבת צוות";
  const when = formatStaffMeetingDateTimeHe(args.meetingAt);
  const studentName = (args.studentName ?? "").trim();
  const location = (args.location ?? "").trim();
  const notes = (args.notes ?? "").trim();

  const subject = `הזמנה לישיבת צוות — ${title}`;

  const lines = [
    "שלום רב,",
    "",
    "מוזמנת לישיבת צוות.",
    "",
    `נושא: ${title}`,
    `מועד: ${when}`,
  ];
  if (studentName) {
    lines.push(`בנוגע ל: ${studentName}`);
  }
  if (location) {
    lines.push(`מקום: ${location}`);
  }
  if (notes) {
    lines.push("", notes);
  }
  lines.push("", "נשמח לראותך.", "", "ההנהלה וצוות בית הספר");

  return { subject, text: lines.join("\n") };
}

export function collectUpcomingFormRowMeetings(args: {
  institutionId: string;
  students: Student[];
  fills: Array<{ student_id: string; data: Record<string, string> | null }>;
  now?: Date;
}): UpcomingStaffMeeting[] {
  const now = args.now ?? new Date();
  const studentById = new Map(args.students.map((s) => [s.id, s]));
  const out: UpcomingStaffMeeting[] = [];

  for (const fill of args.fills) {
    const student = studentById.get(fill.student_id);
    if (!student) continue;
    const studentName =
      formatStudentDisplayName(student.full_name).trim() ||
      student.full_name.trim();
    const rows = listStaffMeetingRows(fill.data ?? {});
    for (const row of rows) {
      if (!isUpcomingStaffMeetingDate(row.date, now)) continue;
      const meetingAt = parseStaffMeetingAt(row.date, DEFAULT_STAFF_MEETING_TIME);
      if (!meetingAt || !isUpcomingTimestamp(meetingAt, now)) continue;
      out.push({
        id: `form:${student.id}:${row.rowIndex}`,
        source: "form-row",
        institution_id: args.institutionId,
        student_id: student.id,
        student_name: studentName || null,
        title: studentName
          ? `ישיבת צוות — ${studentName}`
          : "ישיבת צוות",
        meeting_at: meetingAt,
        location: null,
        notes: row.summary || null,
        participants: row.participants || null,
        invitation_subject: null,
        invitees: [],
      });
    }
  }

  return out;
}

export function mergeUpcomingStaffMeetings(
  invited: UpcomingStaffMeeting[],
  formRows: UpcomingStaffMeeting[]
): UpcomingStaffMeeting[] {
  const invitedKeys = new Set(
    invited
      .filter((m) => m.student_id)
      .map((m) => `${m.student_id}:${israelCalendarDate(new Date(m.meeting_at))}`)
  );

  const extras = formRows.filter((row) => {
    if (!row.student_id) return true;
    const key = `${row.student_id}:${israelCalendarDate(new Date(row.meeting_at))}`;
    return !invitedKeys.has(key);
  });

  return [...invited, ...extras].sort((a, b) =>
    a.meeting_at.localeCompare(b.meeting_at)
  );
}

export function selectValidInvitees(
  staff: InstitutionStaffMember[],
  selectedIds: string[]
): {
  invitees: InstitutionStaffMember[];
  missing: string[];
  withoutEmail: string[];
} {
  const byId = new Map(staff.map((s) => [s.id, s]));
  const invitees: InstitutionStaffMember[] = [];
  const missing: string[] = [];
  const withoutEmail: string[] = [];
  const seen = new Set<string>();

  for (const rawId of selectedIds) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const member = byId.get(id);
    if (!member) {
      missing.push(id);
      continue;
    }
    if (!member.hasEmail || !member.email || !EMAIL_RE.test(member.email)) {
      withoutEmail.push(member.full_name || id);
      continue;
    }
    invitees.push(member);
  }

  return { invitees, missing, withoutEmail };
}

export function isEligibleStaffCardForInvite(
  row: StaffInviteCandidateRow,
  memberUserIds: ReadonlySet<string>
): boolean {
  if (row.archived_at) return false;
  if (row.user_profile_id && !memberUserIds.has(row.user_profile_id)) {
    return false;
  }
  return true;
}

export function filterEligibleStaffForInvite(
  rows: StaffInviteCandidateRow[],
  memberUserIds: ReadonlySet<string>
): InstitutionStaffMember[] {
  return rows
    .filter((row) => isEligibleStaffCardForInvite(row, memberUserIds))
    .map(mapInstitutionStaffRow);
}

export function mapInstitutionStaffRow(
  row: StaffInviteCandidateRow
): InstitutionStaffMember {
  const email = (row.email ?? "").trim().toLowerCase() || null;
  return {
    id: row.id,
    full_name: (row.full_name ?? "").trim(),
    email,
    role: (row.role ?? "").trim() || null,
    user_profile_id: row.user_profile_id,
    hasEmail: Boolean(email && EMAIL_RE.test(email)),
  };
}

export function summarizeInviteSendResults(
  invitees: Array<{ id: string; email: string }>,
  results: PromiseSettledResult<{ sent: boolean }>[]
): { sentTo: string[]; failedTo: string[]; sentIds: string[] } {
  const sentTo: string[] = [];
  const failedTo: string[] = [];
  const sentIds: string[] = [];
  for (let i = 0; i < invitees.length; i += 1) {
    const invitee = invitees[i];
    if (!invitee) continue;
    const result = results[i];
    if (result?.status === "fulfilled" && result.value.sent) {
      sentTo.push(invitee.email);
      sentIds.push(invitee.id);
    } else {
      failedTo.push(invitee.email);
    }
  }
  return { sentTo, failedTo, sentIds };
}
