import { demoSessionSecret } from "./demo-public-secret";
import { isDemoUserId } from "./demo-data";
import type { UserProfile } from "./supabase/types";

export const SESSION_COOKIE = "matoah_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

export interface SessionPayload {
  userId: string;
  email: string;
  fullName: string;
  /** מזהה סשן בשרת — לביטול בהתנתקות / שינוי סיסמה */
  sid: string;
  exp: number;
}

function getSessionSecret(): string {
  return demoSessionSecret();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function stringToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64Url(bytes);
}

function base64UrlToString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sign(payloadPart: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadPart)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function newSessionId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64Url(bytes);
}

/** אימות חתימה + תוקף בלבד (בלי בדיקת ביטול בשרת) */
export async function verifySessionTokenSignature(
  token: string
): Promise<SessionPayload | null> {
  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;

  let expected: string;
  try {
    expected = await sign(payloadPart);
  } catch {
    return null;
  }

  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlToString(payloadPart)) as SessionPayload;
    if (!payload.userId || !payload.email || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.sid) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSessionToken(
  profile: UserProfile,
  options?: { maxAgeSeconds?: number }
): Promise<string> {
  const sid = newSessionId();
  const maxAgeSeconds = options?.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload: SessionPayload = {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    sid,
    exp,
  };
  const payloadPart = stringToBase64Url(JSON.stringify(payload));
  const signature = await sign(payloadPart);
  const token = `${payloadPart}.${signature}`;

  const ephemeral = isDemoUserId(profile.id);
  if (!ephemeral) {
    const { persistAuthSession, canUseSessionStore } = await import(
      "@/lib/auth-sessions"
    );
    try {
      const persisted = await persistAuthSession({
        sid,
        userId: profile.id,
        expiresAt: new Date(exp * 1000),
      });
      if (
        canUseSessionStore() &&
        !persisted &&
        process.env.NODE_ENV === "production"
      ) {
        // טבלה חסרה — ממשיכים עם חתימה בלבד עד שירוצו מיגרציות
        console.error("[session] auth_sessions table missing — apply 030_auth_sessions.sql");
      }
    } catch (error) {
      console.error("[session] persist failed:", error);
      if (process.env.NODE_ENV === "production") {
        throw new Error("SESSION_PERSIST_FAILED");
      }
    }
  }

  return token;
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  const payload = await verifySessionTokenSignature(token);
  if (!payload) return null;
  if (isDemoUserId(payload.userId)) return payload;

  try {
    const { isAuthSessionActive } = await import("@/lib/auth-sessions");
    const active = await isAuthSessionActive(payload.sid);
    if (active === false) return null;
    return payload;
  } catch {
    return payload;
  }
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function createSignedBlob(
  payload: Record<string, unknown>
): Promise<string> {
  const payloadPart = stringToBase64Url(JSON.stringify(payload));
  const signature = await sign(payloadPart);
  return `${payloadPart}.${signature}`;
}

export async function verifySignedBlob<T extends Record<string, unknown>>(
  token: string
): Promise<T | null> {
  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;

  let expected: string;
  try {
    expected = await sign(payloadPart);
  } catch {
    return null;
  }

  if (!timingSafeEqual(signature, expected)) return null;

  try {
    return JSON.parse(base64UrlToString(payloadPart)) as T;
  } catch {
    return null;
  }
}
