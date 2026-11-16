/**
 * TZ-23: פעולות שרת לישיבות צוות (tenant + TZ-28).
 */

import { STAFF_MEETINGS_FORM_ID } from "@/lib/staff-meeting-parent-email";
import { formatStudentDisplayName } from "@/lib/person-name";
import {
  tenantFetchStudents,
  type MemberAccessContext,
} from "@/lib/server-tenant-data";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  assertCanCreateStaffMeetingInvite,
  canManageStaffMeetingInvites,
  collectUpcomingFormRowMeetings,
  filterMeetingsForViewer,
  isUpcomingTimestamp,
  filterEligibleStaffForInvite,
  MAX_STAFF_MEETING_INVITEES,
  mergeUpcomingStaffMeetings,
  selectValidInvitees,
  summarizeInviteSendResults,
  type CreateStaffMeetingInput,
  type CreateStaffMeetingResult,
  type InstitutionStaffMember,
  type StaffInviteCandidateRow,
  type UpcomingStaffMeeting,
} from "@/lib/staff-meetings";

function isMissingRelation(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache/i.test(message));
}

type MeetingRow = {
  id: string;
  institution_id: string;
  student_id: string | null;
  title: string;
  meeting_at: string;
  location: string | null;
  notes: string | null;
  invitation_subject: string;
  invitation_text: string;
  created_by: string | null;
  created_at: string;
};

type InviteeRow = {
  id: string;
  meeting_id: string;
  staff_student_id: string | null;
  user_id: string | null;
  full_name: string;
  email: string;
  sent_at: string | null;
};

function toUpcomingFromRow(
  row: MeetingRow,
  invitees: InviteeRow[],
  studentName: string | null
): UpcomingStaffMeeting {
  return {
    id: row.id,
    source: "invitation",
    institution_id: row.institution_id,
    student_id: row.student_id,
    student_name: studentName,
    title: row.title,
    meeting_at: row.meeting_at,
    location: row.location,
    notes: row.notes,
    participants: null,
    invitation_subject: row.invitation_subject,
    invitees: invitees.map((invitee) => ({
      id: invitee.id,
      staff_student_id: invitee.staff_student_id,
      user_id: invitee.user_id,
      full_name: invitee.full_name,
      email: invitee.email,
      sent_at: invitee.sent_at,
    })),
  };
}

async function loadInstitutionMemberUserIds(
  institutionId: string,
  userIds: string[]
): Promise<Set<string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("user_institutions")
    .select("user_id")
    .eq("institution_id", institutionId)
    .in("user_id", unique);
  if (error) {
    if (isMissingRelation(error.message)) {
      const { data: profiles, error: profileError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("institution_id", institutionId)
        .in("id", unique);
      if (profileError) throw new Error(profileError.message);
      return new Set(
        (profiles ?? []).map((row) => String((row as { id: string }).id))
      );
    }
    throw new Error(error.message);
  }
  return new Set(
    (data ?? []).map((row) => String((row as { user_id: string }).user_id))
  );
}

export async function listInstitutionStaffForInvite(
  institutionId: string,
  ctx: MemberAccessContext
): Promise<InstitutionStaffMember[]> {
  assertCanCreateStaffMeetingInvite(ctx);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, email, role, user_profile_id, status, archived_at")
    .eq("institution_id", institutionId)
    .eq("status", "integration-teacher")
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as StaffInviteCandidateRow[];
  const linkedIds = rows
    .map((row) => row.user_profile_id)
    .filter((id): id is string => Boolean(id));
  const memberUserIds = await loadInstitutionMemberUserIds(
    institutionId,
    linkedIds
  );
  return filterEligibleStaffForInvite(rows, memberUserIds);
}

async function loadInviteesByMeeting(
  meetingIds: string[]
): Promise<Map<string, InviteeRow[]>> {
  const map = new Map<string, InviteeRow[]>();
  if (meetingIds.length === 0) return map;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("staff_meeting_invitees")
    .select(
      "id, meeting_id, staff_student_id, user_id, full_name, email, sent_at"
    )
    .in("meeting_id", meetingIds);
  if (error) {
    if (isMissingRelation(error.message)) return map;
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as InviteeRow[]) {
    const list = map.get(row.meeting_id) ?? [];
    list.push(row);
    map.set(row.meeting_id, list);
  }
  return map;
}

export async function listUpcomingStaffMeetings(
  institutionId: string,
  ctx: MemberAccessContext,
  now: Date = new Date()
): Promise<UpcomingStaffMeeting[]> {
  const supabase = createServiceClient();
  const students = await tenantFetchStudents(institutionId, ctx);
  const accessibleStudentIds = new Set(students.map((s) => s.id));
  const staffCard =
    students.find(
      (s) =>
        s.user_profile_id === ctx.userId && s.status === "integration-teacher"
    ) ?? null;

  const { data, error } = await supabase
    .from("staff_meetings")
    .select(
      "id, institution_id, student_id, title, meeting_at, location, notes, invitation_subject, invitation_text, created_by, created_at"
    )
    .eq("institution_id", institutionId)
    .gt("meeting_at", now.toISOString())
    .order("meeting_at", { ascending: true });

  let invited: UpcomingStaffMeeting[] = [];
  if (error) {
    if (!isMissingRelation(error.message)) throw new Error(error.message);
  } else {
    const rows = (data ?? []) as MeetingRow[];
    const inviteesByMeeting = await loadInviteesByMeeting(
      rows.map((r) => r.id)
    );
    const nameByStudent = new Map(
      students.map((s) => [
        s.id,
        formatStudentDisplayName(s.full_name).trim() || s.full_name.trim(),
      ])
    );
    const missingStudentIds = [
      ...new Set(
        rows
          .map((r) => r.student_id)
          .filter(
            (id): id is string =>
              typeof id === "string" &&
              id.length > 0 &&
              !nameByStudent.has(id)
          )
      ),
    ];
    if (missingStudentIds.length > 0 && canManageStaffMeetingInvites(ctx)) {
      const { data: extra } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("institution_id", institutionId)
        .in("id", missingStudentIds);
      for (const row of extra ?? []) {
        const name =
          formatStudentDisplayName(String(row.full_name ?? "")).trim() ||
          String(row.full_name ?? "").trim();
        nameByStudent.set(String(row.id), name);
      }
    }
    invited = rows.map((row) =>
      toUpcomingFromRow(
        row,
        inviteesByMeeting.get(row.id) ?? [],
        row.student_id ? (nameByStudent.get(row.student_id) ?? null) : null
      )
    );
  }

  const visibleInvited = filterMeetingsForViewer(invited, ctx, {
    staffCardId: staffCard?.id ?? null,
    accessibleStudentIds,
  });

  const studentIds = students
    .filter((s) => s.status !== "integration-teacher")
    .map((s) => s.id);
  let formRows: UpcomingStaffMeeting[] = [];
  if (studentIds.length > 0) {
    const { data: fills, error: fillError } = await supabase
      .from("student_form_fills")
      .select("student_id, data")
      .eq("form_id", STAFF_MEETINGS_FORM_ID)
      .in("student_id", studentIds);
    if (fillError) {
      if (!isMissingRelation(fillError.message)) {
        throw new Error(fillError.message);
      }
    } else {
      formRows = collectUpcomingFormRowMeetings({
        institutionId,
        students,
        fills: ((fills ?? []) as Array<{
          student_id: string;
          data: Record<string, string> | null;
        }>).map((fill) => ({
          student_id: fill.student_id,
          data:
            fill.data && typeof fill.data === "object"
              ? (fill.data as Record<string, string>)
              : {},
        })),
        now,
      });
    }
  }

  return mergeUpcomingStaffMeetings(visibleInvited, formRows);
}

export async function createStaffMeetingWithInvites(
  institutionId: string,
  ctx: MemberAccessContext,
  input: CreateStaffMeetingInput,
  sendEmail: (args: {
    to: string;
    subject: string;
    text: string;
  }) => Promise<{ sent: boolean }>
): Promise<CreateStaffMeetingResult> {
  assertCanCreateStaffMeetingInvite(ctx);

  if (!isUpcomingTimestamp(input.meetingAt)) {
    throw new Error("MEETING_NOT_FUTURE");
  }

  const staff = await listInstitutionStaffForInvite(institutionId, ctx);
  const selected = selectValidInvitees(staff, input.staffStudentIds);
  if (selected.missing.length > 0) {
    throw new Error("INVALID_INVITEES");
  }
  if (selected.withoutEmail.length > 0) {
    throw new Error("INVITEE_NO_EMAIL");
  }
  if (selected.invitees.length === 0) {
    throw new Error("NO_INVITEES");
  }
  if (selected.invitees.length > MAX_STAFF_MEETING_INVITEES) {
    throw new Error("TOO_MANY_INVITEES");
  }

  let studentName: string | null = null;
  const supabase = createServiceClient();
  if (input.studentId) {
    const { data: student, error } = await supabase
      .from("students")
      .select("id, full_name, institution_id")
      .eq("id", input.studentId)
      .eq("institution_id", institutionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!student) throw new Error("STUDENT_NOT_FOUND");
    studentName =
      formatStudentDisplayName(String(student.full_name ?? "")).trim() ||
      String(student.full_name ?? "").trim() ||
      null;
  }

  const insertPayload = {
    institution_id: institutionId,
    student_id: input.studentId ?? null,
    title: input.title,
    meeting_at: input.meetingAt,
    location: input.location ?? null,
    notes: input.notes ?? null,
    invitation_subject: input.invitationSubject,
    invitation_text: input.invitationText,
    created_by: ctx.userId,
  };

  const { data: meetingRow, error: insertError } = await supabase
    .from("staff_meetings")
    .insert(insertPayload)
    .select(
      "id, institution_id, student_id, title, meeting_at, location, notes, invitation_subject, invitation_text, created_by, created_at"
    )
    .single();

  if (insertError) {
    if (isMissingRelation(insertError.message)) {
      throw new Error("MIGRATION_REQUIRED");
    }
    throw new Error(insertError.message);
  }

  const meeting = meetingRow as MeetingRow;
  const inviteePayload = selected.invitees.map((member) => ({
    meeting_id: meeting.id,
    staff_student_id: member.id,
    user_id: member.user_profile_id,
    full_name: member.full_name,
    email: member.email as string,
  }));

  const { data: inviteeRows, error: inviteeError } = await supabase
    .from("staff_meeting_invitees")
    .insert(inviteePayload)
    .select(
      "id, meeting_id, staff_student_id, user_id, full_name, email, sent_at"
    );

  if (inviteeError) {
    await supabase
      .from("staff_meetings")
      .delete()
      .eq("id", meeting.id)
      .eq("institution_id", institutionId);
    throw new Error(inviteeError.message);
  }

  const invitees = (inviteeRows ?? []) as InviteeRow[];
  const results = await Promise.allSettled(
    invitees.map(async (invitee) => {
      const result = await sendEmail({
        to: invitee.email,
        subject: input.invitationSubject,
        text: input.invitationText,
      });
      return { sent: result.sent };
    })
  );

  const { sentTo, failedTo, sentIds } = summarizeInviteSendResults(
    invitees,
    results
  );

  if (sentTo.length === 0) {
    const { error: rollbackError } = await supabase
      .from("staff_meetings")
      .delete()
      .eq("id", meeting.id)
      .eq("institution_id", institutionId);
    if (rollbackError) {
      console.error("[staff-meetings] rollback after send failure:", rollbackError.message);
    }
    throw new Error("EMAIL_SEND_FAILED");
  }

  if (sentIds.length > 0) {
    const sentAt = new Date().toISOString();
    const { error: markError } = await supabase
      .from("staff_meeting_invitees")
      .update({ sent_at: sentAt })
      .in("id", sentIds);
    if (markError) {
      console.error("[staff-meetings] mark sent_at:", markError.message);
    }
    for (const invitee of invitees) {
      if (sentIds.includes(invitee.id)) invitee.sent_at = sentAt;
    }
  }

  return {
    meeting: toUpcomingFromRow(meeting, invitees, studentName),
    sentTo,
    failedTo,
  };
}
