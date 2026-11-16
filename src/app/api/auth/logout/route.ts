import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit-log";
import { revokeAuthSession } from "@/lib/auth-sessions";
import {
  SESSION_COOKIE,
  verifySessionTokenSignature,
  sessionCookieOptions,
} from "@/lib/session";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifySessionTokenSignature(token);
    if (payload?.sid) {
      await revokeAuthSession(payload.sid);
    }
    if (
      payload?.userId &&
      isSupabaseConfiguredServer() &&
      isServiceRoleConfigured()
    ) {
      try {
        const supabase = createServiceClient();
        const { data: user } = await supabase
          .from("user_profiles")
          .select("id, full_name, institution_id")
          .eq("id", payload.userId)
          .maybeSingle();
        if (user?.institution_id) {
          void insertAuditLog({
            institutionId: String(user.institution_id),
            actorUserId: String(user.id),
            action: "auth.logout",
            entityType: "user",
            entityId: String(user.id),
            summary: user.full_name
              ? `התנתקות: ${user.full_name}`
              : "התנתקות מהמערכת",
          });
        }
      } catch (error) {
        console.error("[auth/logout] audit:", error);
      }
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
