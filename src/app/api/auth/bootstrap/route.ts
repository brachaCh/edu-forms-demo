import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import type { UserProfile } from "@/lib/supabase/types";
import { bootstrapBodySchema, parseJsonBody } from "@/lib/validation";

/**
 * קובע cookie סשן במצב mock / ללא service role.
 * ב-production עם service role — הכניסה רק דרך /api/auth/login.
 */
export async function POST(request: Request) {
  if (isServiceRoleConfigured()) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = await parseJsonBody(request, bootstrapBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_PROFILE" }, { status: 400 });
  }

  const profile = parsed.data.profile as UserProfile;
  const token = await createSessionToken(profile);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
