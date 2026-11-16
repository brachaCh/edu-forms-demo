import {
  hrefPathOnly,
  isAuthSurfaceHref,
  sameNavHref,
} from "@/lib/navigation-back";
import { institutionProfileHref } from "@/lib/personal-sector";
import type { UserProfile } from "@/lib/supabase/types";

/**
 * Validates a next URL for safe redirect after login/institution-switch.
 * Allows:
 * - /personal-area and /personal-area/*
 * - /register/invite?token=<token> (for TZ-17 multi-institution invite flow)
 * 
 * Rejects open redirects (schemes, //, backslashes, etc.)
 */
export function safePersonalAreaNext(
  next: string | null | undefined
): string | null {
  if (!next) return null;

  // Allow /personal-area paths
  if (next === "/personal-area" || next.startsWith("/personal-area/")) {
    return next;
  }

  // Allow /register/invite?token=<token> for TZ-17 multi-institution flow
  if (isValidTeacherInviteNext(next)) {
    return next;
  }

  return null;
}

/**
 * Validates /register/invite?token=<token> URLs to prevent open redirects.
 * Requirements:
 * - Path must be exactly /register/invite
 * - Must start with single / (no //, no scheme, no backslashes)
 * - Only allowed param is token
 * - Token must be non-empty
 */
export function isValidTeacherInviteNext(next: string): boolean {
  if (!next) return false;

  // Must start with exactly one forward slash (prevents //, schemes, backslashes)
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return false;
  }

  // Parse as URL to validate structure
  let url: URL;
  try {
    url = new URL(next, "http://localhost");
  } catch {
    return false;
  }

  // Path must be exactly /register/invite
  if (url.pathname !== "/register/invite") {
    return false;
  }

  // Only token param is allowed
  const params = Array.from(url.searchParams.keys());
  if (params.length !== 1 || !params.includes("token")) {
    return false;
  }

  // Token must be non-empty
  const token = url.searchParams.get("token");
  if (!token || token.trim().length === 0) {
    return false;
  }

  return true;
}

export function postLoginHref(
  profile: Pick<
    UserProfile,
    "setup_completed_at" | "institution_type" | "education_framework"
  >,
  next?: string | null,
  options?: { isPlatformAdmin?: boolean }
): string {
  if (!options?.isPlatformAdmin && !profile.setup_completed_at) {
    return "/personal-area/setup";
  }
  return safePersonalAreaNext(next) ?? institutionProfileHref(profile);
}

export const GUEST_HOME_HREF = "/dashboard";

type SidebarHomeProfile = Pick<
  UserProfile,
  "setup_completed_at" | "institution_type" | "education_framework"
>;

/** דף הבית בסרגל: אורחים → בוחר קטגוריות; מחוברים → טבלת המוסד */
export function sidebarHomeHref(options: {
  loggedIn: boolean;
  profile?: SidebarHomeProfile | null;
}): string {
  if (!options.loggedIn) return GUEST_HOME_HREF;
  const profile = options.profile;
  if (profile && !profile.setup_completed_at) return "/personal-area/setup";
  if (profile) return institutionProfileHref(profile);
  return "/personal-area";
}

/** לוגו בכותרת: אורחים נשארים בדף הכניסה; מחוברים → פרופיל המוסד */
export function logoHomeHref(options: {
  loggedIn: boolean;
  profile?: SidebarHomeProfile | null;
}): string {
  if (!options.loggedIn) return "/";
  return sidebarHomeHref(options);
}

export function isInstitutionProfilePath(pathname: string): boolean {
  const path = hrefPathOnly(pathname);
  return path.startsWith("/personal-area/sector-table/");
}

/** אזור מחובר (לא דף נחיתה / מילוי ציבורי / התחברות) */
export function isAuthenticatedAppPath(pathname: string): boolean {
  const path = hrefPathOnly(pathname);
  if (isAuthSurfaceHref(path)) return false;
  if (path === "/fill" || path.startsWith("/fill/")) return false;
  if (path === "/sign" || path.startsWith("/sign/")) return false;
  if (path === "/print" || path.startsWith("/print/")) return false;
  return (
    path === "/personal-area" ||
    path.startsWith("/personal-area/") ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/platform-admin" ||
    path.startsWith("/platform-admin/")
  );
}

/**
 * כפתור «חזרה לפרופיל מוסד» — בכל מסך מחובר,
 * ולא על מסך הפרופיל עצמו / מסכי התחברות / מילוי ציבורי.
 */
export function shouldShowInstitutionProfileBack(options: {
  loggedIn: boolean;
  pathname: string;
  profileHref: string;
  guestDemo?: boolean;
}): boolean {
  if (options.guestDemo) return false;
  const path = hrefPathOnly(options.pathname);
  if (isAuthSurfaceHref(path)) return false;
  if (isInstitutionProfilePath(path)) return false;
  if (sameNavHref(path, options.profileHref)) return false;
  if (options.loggedIn) return true;
  return isAuthenticatedAppPath(path);
}

/**
 * אם הסשן חי — ממשיכים בלי טופס כניסה (חזרה מ־/dashboard לאזור האישי).
 * next לא בטוח נזרק; אין כאן קפיצה לבורר מוסדות.
 */
export function existingSessionContinueHref(
  profile: SidebarHomeProfile | null | undefined,
  next?: string | null,
  options?: { isPlatformAdmin?: boolean }
): string | null {
  if (!profile) return null;
  return postLoginHref(profile, next, options);
}

/**
 * האם להציג /login אחרי בדיקת סשן.
 * כשל רשת עם פרופיל שמור — לא מבקשים סיסמה שוב.
 * profile:null מהשרת — כן להתחבר מחדש.
 */
export function shouldPromptLoginAfterSessionCheck(options: {
  sessionProfile: unknown;
  sessionCheckFailed: boolean;
  cachedProfile: unknown;
}): boolean {
  if (options.sessionProfile) return false;
  if (options.sessionCheckFailed && options.cachedProfile) return false;
  return true;
}
