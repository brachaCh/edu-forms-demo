import { cookies } from "next/headers";
import { isDemoUserId } from "@/lib/demo-data";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isAuthSessionActive } from "@/lib/auth-sessions";
import {
  SESSION_COOKIE,
  verifySessionTokenSignature,
  type SessionPayload,
} from "@/lib/session";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import type { UserProfile } from "@/lib/supabase/types";
import { USER_PROFILE_SELECT } from "@/lib/institution-owner";

function parsePlatformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  return parsePlatformAdminEmails().includes(normalized);
}

export type AuthSession = {
  userId: string;
  profile: UserProfile;
};

function profileFromSessionPayload(payload: SessionPayload): UserProfile {
  return {
    id: payload.userId,
    email: payload.email,
    full_name: payload.fullName,
    phone: "",
    institution_id: null,
    institution_code: null,
    setup_completed_at: null,
    terms_accepted_at: null,
    is_admin: false,
    is_institution_owner: false,
    created_at: new Date().toISOString(),
  };
}

/** טוען פרופיל מאומת — ללא דרישת institution_id */
export async function requireAuthSession(): Promise<
  | { ok: true; session: AuthSession }
  | { ok: false; status: number; error: string }
> {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return { ok: false, status: 503, error: "SERVER_UNAVAILABLE" };
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  const payload = await verifySessionTokenSignature(token);
  if (!payload) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }
  if (isDemoUserId(payload.userId)) {
    return { ok: false, status: 403, error: "DEMO_SESSION" };
  }

  const active = await isAuthSessionActive(payload.sid).catch(() => null);
  if (active === false) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  try {
    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .eq("id", payload.userId)
      .maybeSingle();

    if (!error && user) {
      return {
        ok: true,
        session: {
          userId: user.id,
          profile: user as UserProfile,
        },
      };
    }
  } catch (error) {
    console.error("[platform-admin] requireAuthSession:", error);
  }

  return {
    ok: true,
    session: {
      userId: payload.userId,
      profile: profileFromSessionPayload(payload),
    },
  };
}

export async function requirePlatformAdmin(): Promise<
  | { ok: true; session: AuthSession }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireAuthSession();
  if (!auth.ok) return auth;

  if (!isPlatformAdminEmail(auth.session.profile.email)) {
    return { ok: false, status: 403, error: "FORBIDDEN" };
  }

  return auth;
}
