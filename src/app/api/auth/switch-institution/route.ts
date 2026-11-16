/**
 * TZ-17: החלפת מוסד פעיל
 * POST /api/auth/switch-institution
 *
 * מאמת חברות במוסד היעד לפני החלפה — לא לסמוך על institution_id מהלקוח
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { SESSION_COOKIE, verifySessionTokenSignature } from "@/lib/session";
import { isAuthSessionActive } from "@/lib/auth-sessions";
import {
  checkUserInstitutionMembership,
  updateSessionActiveInstitution,
} from "@/lib/user-institutions";
import { USER_PROFILE_SELECT } from "@/lib/institution-owner";
import { parseJsonBody, switchInstitutionBodySchema } from "@/lib/validation";
import type { UserProfile, Institution } from "@/lib/supabase/types";
import { mergeInstitutionIntoProfile } from "@/lib/profile-institution";

export async function POST(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const payload = await verifySessionTokenSignature(token);
  if (!payload) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, switchInstitutionBodySchema);
  if (!parsed.ok) return parsed.response;

  const { institution_id: targetInstitutionId } = parsed.data;

  try {
    const active =
      payload.userId === "demo-user"
        ? true
        : await isAuthSessionActive(payload.sid).catch(() => null);

    if (active === false) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // TZ-17: אימות חברות במוסד היעד — הגנה עיקרית
    const membershipCheck = await checkUserInstitutionMembership(
      payload.userId,
      targetInstitutionId
    );

    // Distinguish between 'not a member' (403) and transient DB error (503)
    if (!membershipCheck.isMember) {
      if (membershipCheck.dbError) {
        return NextResponse.json(
          { error: "SERVICE_UNAVAILABLE" },
          { status: 503, headers: { "Retry-After": "5" } }
        );
      }
      return NextResponse.json({ error: "NOT_MEMBER" }, { status: 403 });
    }

    // עדכון המוסד הפעיל בסשן בלבד — לא משנים את user_profiles.institution_id
    // כך כל סשן/מכשיר שומר על המוסד הפעיל שלו עצמאית
    const updated = await updateSessionActiveInstitution(
      payload.sid,
      targetInstitutionId
    );

    if (!updated) {
      console.error("[switch-institution] failed to update session");
      return NextResponse.json(
        { error: "SESSION_UPDATE_FAILED" },
        { status: 503, headers: { "Retry-After": "5" } }
      );
    }

    const supabase = createServiceClient();

    // שליפת הפרופיל עם פרטי המוסד החדש
    const { data: user, error: userError } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .eq("id", payload.userId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    const { data: institution } = await supabase
      .from("institutions")
      .select("*")
      .eq("id", targetInstitutionId)
      .maybeSingle();

    const profile = mergeInstitutionIntoProfile(
      user as UserProfile,
      institution as Institution | null
    );

    return NextResponse.json({
      ok: true,
      profile,
      institutionId: targetInstitutionId,
      membershipRole: membershipCheck.role,
    });
  } catch (error) {
    console.error("[api/auth/switch-institution]", error);
    return NextResponse.json({ error: "SWITCH_FAILED" }, { status: 500 });
  }
}
