import { NextResponse } from "next/server";
import { insertAuditLog } from "@/lib/audit-log";
import {
  consumeEmailRateLimit,
  openEmailRateLimitQuery,
} from "@/lib/email-rate-limit";
import { sendStaffMeetingInviteEmail } from "@/lib/staff-meeting-invite-email";
import {
  buildMemberAccessContext,
  type MemberAccessContext,
} from "@/lib/server-tenant-data";
import { requireInstitutionAdmin, requireTenantSession } from "@/lib/server-auth";
import {
  createStaffMeetingWithInvites,
  listUpcomingStaffMeetings,
} from "@/lib/staff-meetings-server";
import {
  canManageStaffMeetingInvites,
  isUpcomingTimestamp,
  parseStaffMeetingAt,
} from "@/lib/staff-meetings";
import { parseJsonBody } from "@/lib/validation";
import { createStaffMeetingBodySchema } from "@/lib/validation/staff-meetings";

function memberCtxFromSession(
  session: Parameters<typeof buildMemberAccessContext>[0]
): MemberAccessContext {
  return buildMemberAccessContext(session);
}

export async function GET() {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const ctx = memberCtxFromSession(auth.session);
  try {
    const meetings = await listUpcomingStaffMeetings(
      auth.session.institutionId,
      ctx
    );
    return NextResponse.json({
      meetings,
      canCreate: canManageStaffMeetingInvites(ctx),
    });
  } catch (error) {
    console.error("[staff-meetings] list", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

const CREATE_ERROR_STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  MEETING_NOT_FUTURE: 400,
  INVALID_INVITEES: 400,
  INVITEE_NO_EMAIL: 400,
  NO_INVITEES: 400,
  TOO_MANY_INVITEES: 400,
  STUDENT_NOT_FOUND: 404,
  EMAIL_SEND_FAILED: 502,
  MIGRATION_REQUIRED: 503,
};

export async function POST(request: Request) {
  const auth = await requireInstitutionAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, createStaffMeetingBodySchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const meetingAt = parseStaffMeetingAt(body.date, body.time);
  if (!meetingAt) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }
  if (!isUpcomingTimestamp(meetingAt)) {
    return NextResponse.json({ error: "MEETING_NOT_FUTURE" }, { status: 400 });
  }

  const ctx = memberCtxFromSession(auth.session);
  const rate = await consumeEmailRateLimit(
    openEmailRateLimitQuery(),
    `staff-meeting-invite:${auth.session.institutionId}`
  );
  if (!rate.ok) {
    if (rate.reason === "limited") {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rate.retryAfterSec },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "RATE_LIMIT_UNAVAILABLE" }, { status: 503 });
  }

  try {
    const result = await createStaffMeetingWithInvites(
      auth.session.institutionId,
      ctx,
      {
        title: body.title,
        meetingAt,
        location: body.location,
        notes: body.notes,
        studentId: body.student_id,
        invitationSubject: body.invitation_subject,
        invitationText: body.invitation_text,
        staffStudentIds: body.staff_student_ids,
      },
      sendStaffMeetingInviteEmail
    );

    void insertAuditLog({
      institutionId: auth.session.institutionId,
      actorUserId: auth.session.userId,
      action: "staff_meeting.invite",
      entityType: "staff_meeting",
      entityId: result.meeting.id,
      summary: `נשלחה הזמנה לישיבת צוות: ${result.meeting.title}`,
      metadata: {
        sentTo: result.sentTo,
        failedTo: result.failedTo,
        meeting_at: result.meeting.meeting_at,
      },
    });

    return NextResponse.json({
      ok: true,
      meeting: result.meeting,
      sentTo: result.sentTo,
      failedTo: result.failedTo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    const status = CREATE_ERROR_STATUS[message] ?? 500;
    if (status === 500) {
      console.error("[staff-meetings] create", error);
    }
    return NextResponse.json(
      { error: CREATE_ERROR_STATUS[message] ? message : "CREATE_FAILED" },
      { status }
    );
  }
}
