import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit-log";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { requireInstitutionOwner } from "@/lib/server-auth";
import {
  assertTeacherInviteRateLimit,
  createAndSendStaffInvite,
} from "@/lib/teacher-invite-server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireInstitutionOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { studentId } = await context.params;
  if (!studentId || !UUID_RE.test(studentId)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  try {
    const supabase = createServiceClient();
    const { institutionId, userId } = auth.session;

    const rate = await assertTeacherInviteRateLimit(
      supabase,
      `teacher-invite:${institutionId}`
    );
    if (!rate.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rate.retryAfterSec },
        { status: 429 }
      );
    }

    const { data: staffCard, error: staffError } = await supabase
      .from("students")
      .select("id, full_name, email, status, institution_id, user_profile_id")
      .eq("id", studentId)
      .eq("institution_id", institutionId)
      .maybeSingle();

    if (staffError) {
      console.error("[teacher-invite] staff lookup:", staffError.message);
      return NextResponse.json({ error: "INVITE_UNAVAILABLE" }, { status: 503 });
    }

    if (!staffCard) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (staffCard.status !== "integration-teacher") {
      return NextResponse.json({ error: "NOT_STAFF_CARD" }, { status: 400 });
    }

    if (staffCard.user_profile_id) {
      return NextResponse.json({ error: "ALREADY_LINKED" }, { status: 409 });
    }

    const email = (staffCard.email ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "NO_EMAIL" }, { status: 400 });
    }

    const { data: existingProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("email", email)
      .eq("institution_id", institutionId)
      .maybeSingle();

    if (profileError) {
      console.error("[teacher-invite] profile lookup:", profileError.message);
      return NextResponse.json({ error: "INVITE_UNAVAILABLE" }, { status: 503 });
    }

    if (existingProfile?.id) {
      return NextResponse.json({ error: "ALREADY_HAS_ACCOUNT" }, { status: 409 });
    }

    const teacherName = (staffCard.full_name ?? "").trim();

    const sentInvite = await createAndSendStaffInvite({
      supabase,
      request,
      institutionId,
      staffCardId: studentId,
      email,
      teacherName,
      invitedByUserId: userId,
    });

    if (!sentInvite.ok) {
      const status = sentInvite.error === "EMAIL_SEND_FAILED" ? 502 : 503;
      return NextResponse.json({ error: sentInvite.error }, { status });
    }

    void insertAuditLog({
      institutionId,
      actorUserId: userId,
      action: "teacher.invite",
      entityType: "student",
      entityId: studentId,
      summary: `נשלחה הזמנת כניסה למורה: ${teacherName || email}`,
      metadata: { email, teacher_name: teacherName },
    });

    return NextResponse.json({
      ok: true,
      message: `ההזמנה נשלחה לכתובת ${email}`,
    });
  } catch (error) {
    console.error("[teacher-invite]", error);
    return NextResponse.json({ error: "INVITE_UNAVAILABLE" }, { status: 500 });
  }
}
