import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit-log";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { requireInstitutionAdmin } from "@/lib/server-auth";
import { parseJsonBody, specialEdHomeroomInviteBodySchema } from "@/lib/validation";
import { checkUserInstitutionMembership } from "@/lib/user-institutions";
import {
  findClassCurriculumOwnerInList,
  normalizeSpecialEdClassName,
} from "@/lib/special-ed-class-key";
import {
  assertTeacherInviteRateLimit,
  createAndSendStaffInvite,
} from "@/lib/teacher-invite-server";
import {
  assignedTeacherNameForClass,
  canAssignHomeroomTeacher,
  classStudentsToAssign,
  decideHomeroomInvite,
  findExistingStaffCard,
  homeroomInviteAlreadyMemberMessage,
  homeroomInviteErrorMessage,
  homeroomInvitePartialSendMessage,
  homeroomInviteSentMessage,
  ownerHomeroomPatch,
  planClassTeacherAssignment,
  reassignStudentViews,
  studentsEligibleToAssign,
  teacherNameForClassAssignment,
  type HomeroomInviteErrorCode,
} from "@/lib/special-ed-homeroom-invite";
import type { Category, Student } from "@/lib/supabase/types";

function errorResponse(
  error: HomeroomInviteErrorCode,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { error, message: homeroomInviteErrorMessage(error), ...extra },
    { status }
  );
}

export async function POST(request: Request) {
  const auth = await requireInstitutionAdmin();
  if (!auth.ok) {
    const error: HomeroomInviteErrorCode =
      auth.error === "UNAUTHORIZED"
        ? "UNAUTHORIZED"
        : auth.error === "FORBIDDEN"
          ? "FORBIDDEN"
          : "SERVER_UNAVAILABLE";
    return errorResponse(
      error,
      auth.status === 401 || auth.status === 403 ? auth.status : 503
    );
  }

  const parsed = await parseJsonBody(request, specialEdHomeroomInviteBodySchema);
  if (!parsed.ok) {
    const payload = (await parsed.response.clone().json()) as {
      path?: string;
    };
    if (payload.path === "email") return errorResponse("INVALID_EMAIL", 400);
    if (payload.path === "teacherName") return errorResponse("NAME_REQUIRED", 400);
    if (payload.path === "className") {
      return errorResponse("CLASS_NAME_REQUIRED", 400);
    }
    return errorResponse("INVALID_EMAIL", 400);
  }

  const category: Category = parsed.data.category ?? "schools";
  const confirmReassign = parsed.data.confirmReassign === true;
  const decision = decideHomeroomInvite({
    rawEmail: parsed.data.email,
    teacherName: parsed.data.teacherName,
    isMemberOfInstitution: false,
  });
  if (!decision.ok) {
    return errorResponse(decision.error, 400);
  }

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return errorResponse("SERVER_UNAVAILABLE", 503);
  }

  const canAssign = canAssignHomeroomTeacher({
    membershipRole: auth.session.membershipRole,
    isAdmin: auth.session.profile.is_admin,
  });

  try {
    const supabase = createServiceClient();
    const { institutionId, userId } = auth.session;

    const rate = await assertTeacherInviteRateLimit(
      supabase,
      `teacher-invite:${institutionId}`
    );
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: homeroomInviteErrorMessage("RATE_LIMITED"),
          retryAfterSec: rate.retryAfterSec,
        },
        { status: 429 }
      );
    }

    const { data: existingProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, institution_id, full_name")
      .eq("email", decision.email)
      .maybeSingle();

    if (profileError) {
      console.error("[homeroom-invite] profile lookup:", profileError.message);
      return errorResponse("SERVER_UNAVAILABLE", 503);
    }

    let isMember = false;
    if (existingProfile?.id) {
      const membership = await checkUserInstitutionMembership(
        existingProfile.id,
        institutionId
      );
      if (membership.dbError) {
        return errorResponse("SERVER_UNAVAILABLE", 503);
      }
      isMember =
        membership.isMember ||
        existingProfile.institution_id === institutionId;
    }

    const resolved = decideHomeroomInvite({
      rawEmail: decision.email,
      teacherName: decision.teacherName,
      isMemberOfInstitution: isMember,
    });
    if (!resolved.ok) {
      return errorResponse(resolved.error, 400);
    }

    const { data: institutionStudents, error: studentsError } = await supabase
      .from("students")
      .select("*")
      .eq("institution_id", institutionId);

    if (studentsError) {
      console.error("[homeroom-invite] students:", studentsError.message);
      return errorResponse("SERVER_UNAVAILABLE", 503);
    }

    const students = (institutionStudents ?? []) as Student[];
    const staffCards = students.filter((s) => s.status === "integration-teacher");
    const existingStaff = findExistingStaffCard(staffCards, {
      email: resolved.email,
      userId: existingProfile?.id ?? null,
    });

    const assignmentName = teacherNameForClassAssignment(
      resolved.teacherName,
      existingStaff
    );
    const teacherName = canAssign
      ? assignedTeacherNameForClass(assignmentName, true)
      : assignmentName.trim() || null;
    if (!teacherName) {
      return errorResponse("NAME_REQUIRED", 400);
    }

    const roster = classStudentsToAssign(
      students,
      parsed.data.className,
      category
    );
    const assignmentPlan = planClassTeacherAssignment(roster, teacherName);
    if (
      canAssign &&
      assignmentPlan.wouldReassign.length > 0 &&
      !confirmReassign
    ) {
      return errorResponse("REASSIGN_CONFIRMATION_REQUIRED", 409, {
        studentsToReassign: reassignStudentViews(assignmentPlan.wouldReassign),
      });
    }

    let staffCardId = existingStaff?.id ?? null;

    if (!staffCardId) {
      const { data: created, error: createError } = await supabase
        .from("students")
        .insert({
          institution_id: institutionId,
          category,
          full_name: teacherName,
          email: resolved.email,
          status: "integration-teacher",
          phone: null,
          father_name: null,
          mother_name: null,
          class_name: null,
          teacher_name: null,
          notes: null,
          user_profile_id:
            resolved.action === "assign_existing_member"
              ? existingProfile?.id ?? null
              : null,
        })
        .select("id")
        .single();

      if (createError || !created) {
        console.error("[homeroom-invite] staff create:", createError?.message);
        return errorResponse("INVITE_UNAVAILABLE", 503);
      }
      staffCardId = created.id;
    } else if (
      resolved.action === "assign_existing_member" &&
      existingProfile?.id &&
      !existingStaff?.user_profile_id
    ) {
      const { error: linkError } = await supabase
        .from("students")
        .update({
          user_profile_id: existingProfile.id,
          email: resolved.email,
        })
        .eq("id", staffCardId)
        .eq("institution_id", institutionId)
        .is("user_profile_id", null);

      if (linkError) {
        console.error("[homeroom-invite] staff link:", linkError.message);
        return errorResponse("INVITE_UNAVAILABLE", 503);
      }
    } else if (existingStaff && !existingStaff.email) {
      const { error: emailFillError } = await supabase
        .from("students")
        .update({ email: resolved.email })
        .eq("id", staffCardId)
        .eq("institution_id", institutionId);
      if (emailFillError) {
        console.error("[homeroom-invite] staff email:", emailFillError.message);
        return errorResponse("INVITE_UNAVAILABLE", 503);
      }
    }

    let inviteSent = resolved.action !== "send_invite";
    if (resolved.action === "send_invite") {
      if (!staffCardId) {
        return errorResponse("INVITE_UNAVAILABLE", 503);
      }
      const sentInvite = await createAndSendStaffInvite({
        supabase,
        request,
        institutionId,
        staffCardId,
        email: resolved.email,
        teacherName,
        invitedByUserId: userId,
      });
      if (!sentInvite.ok) {
        return NextResponse.json(
          {
            error: sentInvite.error,
            message: homeroomInvitePartialSendMessage(resolved.email),
            partial: true,
          },
          { status: sentInvite.error === "EMAIL_SEND_FAILED" ? 502 : 503 }
        );
      }
      inviteSent = true;
    }

    let assignedCount = 0;
    if (canAssign) {
      const toAssign = studentsEligibleToAssign(assignmentPlan, confirmReassign);
      if (toAssign.length > 0) {
        const stableClassName = normalizeSpecialEdClassName(parsed.data.className);
        const needClassName = toAssign.filter((s) => !s.class_name?.trim());
        const hasClassName = toAssign.filter((s) => s.class_name?.trim());

        if (needClassName.length > 0) {
          const { error: stabilizeError } = await supabase
            .from("students")
            .update({ class_name: stableClassName, teacher_name: teacherName })
            .eq("institution_id", institutionId)
            .in(
              "id",
              needClassName.map((s) => s.id)
            );

          if (stabilizeError) {
            console.error("[homeroom-invite] stabilize:", stabilizeError.message);
            return NextResponse.json(
              {
                error: "INVITE_UNAVAILABLE",
                message: inviteSent
                  ? "ההזמנה נשלחה, אך שיוך התלמידות לכיתה נכשל — נסו שוב"
                  : homeroomInviteErrorMessage("INVITE_UNAVAILABLE"),
                partial: inviteSent,
              },
              { status: 503 }
            );
          }
        }

        if (hasClassName.length > 0) {
          const { error: assignError } = await supabase
            .from("students")
            .update({ teacher_name: teacherName })
            .eq("institution_id", institutionId)
            .in(
              "id",
              hasClassName.map((s) => s.id)
            );

          if (assignError) {
            console.error("[homeroom-invite] assign:", assignError.message);
            return NextResponse.json(
              {
                error: "INVITE_UNAVAILABLE",
                message: inviteSent
                  ? "ההזמנה נשלחה, אך שיוך התלמידות לכיתה נכשל — נסו שוב"
                  : homeroomInviteErrorMessage("INVITE_UNAVAILABLE"),
                partial: inviteSent,
              },
              { status: 503 }
            );
          }
        }
        assignedCount = toAssign.length;
      }

      const ownerRow = findClassCurriculumOwnerInList(
        students,
        parsed.data.className,
        category
      );
      const ownerPatch = ownerHomeroomPatch(teacherName, true);
      if (ownerRow?.id && ownerPatch) {
        const { error: ownerError } = await supabase
          .from("students")
          .update(ownerPatch)
          .eq("id", ownerRow.id)
          .eq("institution_id", institutionId);

        if (ownerError) {
          console.error("[homeroom-invite] owner update:", ownerError.message);
          return errorResponse("OWNER_UPDATE_FAILED", 502, {
            partial: true,
            action: resolved.action,
          });
        }
      }
    }

    if (resolved.action === "assign_existing_member") {
      void insertAuditLog({
        institutionId,
        actorUserId: userId,
        action: "teacher.invite",
        entityType: "student",
        entityId: staffCardId,
        summary: canAssign
          ? `מחנכת קיימת שויכה לכיתה ${parsed.data.className}: ${teacherName}`
          : `מחנכת קיימת במוסד עבור כיתה ${parsed.data.className}: ${teacherName}`,
        metadata: {
          email: resolved.email,
          class_name: parsed.data.className,
          via: "homeroom_invite",
          assigned_only: canAssign,
          assigned_count: assignedCount,
        },
      });

      return NextResponse.json({
        ok: true,
        action: "assign_existing_member",
        message: homeroomInviteAlreadyMemberMessage(teacherName, canAssign),
      });
    }

    if (!inviteSent) {
      return errorResponse("INVITE_UNAVAILABLE", 503);
    }

    void insertAuditLog({
      institutionId,
      actorUserId: userId,
      action: "teacher.invite",
      entityType: "student",
      entityId: staffCardId,
      summary: `נשלחה הזמנת מחנכת לכיתה ${parsed.data.className}: ${teacherName}`,
      metadata: {
        email: resolved.email,
        class_name: parsed.data.className,
        via: "homeroom_invite",
        assigned: canAssign,
        assigned_count: assignedCount,
      },
    });

    return NextResponse.json({
      ok: true,
      action: "send_invite",
      message: homeroomInviteSentMessage(resolved.email),
    });
  } catch (error) {
    console.error("[homeroom-invite]", error);
    return errorResponse("INVITE_UNAVAILABLE", 500);
  }
}
