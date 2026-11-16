import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

export function canUseSessionStore(): boolean {
  return isSupabaseConfiguredServer() && isServiceRoleConfigured();
}

/** שומר סשן פעיל בשרת. מחזיר true אם נשמר, false אם דולג (אין DB/טבלה). */
export async function persistAuthSession(input: {
  sid: string;
  userId: string;
  expiresAt: Date;
}): Promise<boolean> {
  if (!canUseSessionStore()) return false;
  const supabase = createServiceClient();
  const { error } = await supabase.from("auth_sessions").upsert({
    id: input.sid,
    user_id: input.userId,
    expires_at: input.expiresAt.toISOString(),
    revoked_at: null,
  });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return false;
    }
    throw error;
  }
  return true;
}

/**
 * true = פעיל, false = מבוטל/לא קיים, null = לא ניתן לבדוק (אין חנות/טבלה)
 */
export async function isAuthSessionActive(
  sid: string
): Promise<boolean | null> {
  if (!canUseSessionStore()) return null;
  if (!sid) return false;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("auth_sessions")
      .select("id, expires_at, revoked_at")
      .eq("id", sid)
      .maybeSingle();

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return null;
      }
      console.error("[auth-sessions] lookup:", error.message);
      return null;
    }

    if (!data) return false;
    if (data.revoked_at) return false;
    const exp = new Date(data.expires_at as string).getTime();
    if (Number.isNaN(exp) || exp < Date.now()) return false;
    return true;
  } catch (error) {
    console.error("[auth-sessions] lookup exception:", error);
    return null;
  }
}

export async function revokeAuthSession(sid: string): Promise<void> {
  if (!canUseSessionStore() || !sid) return;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sid)
    .is("revoked_at", null);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    console.error("[auth-sessions] revoke:", error.message);
  }
}

export async function revokeAllAuthSessionsForUser(
  userId: string
): Promise<void> {
  if (!canUseSessionStore() || !userId) return;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    console.error("[auth-sessions] revoke-all:", error.message);
  }
}
