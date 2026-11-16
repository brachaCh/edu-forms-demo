/**
 * TZ-17: רשימת המוסדות של המשתמש המחובר
 * GET /api/auth/institutions
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { SESSION_COOKIE, verifySessionTokenSignature } from "@/lib/session";
import { isAuthSessionActive } from "@/lib/auth-sessions";
import { getUserInstitutions, getSessionActiveInstitution } from "@/lib/user-institutions";

export async function GET() {
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

  try {
    const active =
      payload.userId === "demo-user"
        ? true
        : await isAuthSessionActive(payload.sid).catch(() => null);

    if (active === false) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const institutions = await getUserInstitutions(payload.userId);
    const activeInstitutionId =
      payload.userId !== "demo-user"
        ? await getSessionActiveInstitution(payload.sid).catch(() => null)
        : null;

    return NextResponse.json({
      institutions,
      activeInstitutionId,
      hasMultipleInstitutions: institutions.length > 1,
    });
  } catch (error) {
    console.error("[api/auth/institutions]", error);
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }
}
