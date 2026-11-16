import { demoSessionSecret } from "./demo-public-secret";

/** קודי כניסה חד-פעמיים (OTP) — HMAC בלבד במסד */

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getOtpHashSecret(): string {
  return demoSessionSecret();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** קוד בן 6 ספרות */
export function generateOtpCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const n = new DataView(bytes.buffer).getUint32(0, false) % 1_000_000;
  return n.toString().padStart(6, "0");
}

/** HMAC-SHA-256 — קוד בן 6 ספרות לא נשמר כ-SHA-256 גולמי (קשת קטנה לניחוש). */
export async function hashOtpCode(code: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getOtpHashSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(code.trim())
  );
  return bufferToHex(new Uint8Array(signature));
}

export function otpHashesEqual(left: string, right: string): boolean {
  return timingSafeEqual(left, right);
}

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 דקות
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_CODE_RE = /^\d{6}$/;

/** רק בפיתוח מקומי — לא ב-production */
export function isDevOtpBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_OTP_BYPASS?.trim().toLowerCase() === "true"
  );
}

export function getDevOtpBypassCode(): string {
  const explicit = process.env.DEV_OTP_CODE?.trim();
  if (explicit && OTP_CODE_RE.test(explicit)) return explicit;
  return "000000";
}
