import { timingSafeEqual } from "node:crypto";

/**
 * Fail-closed cron auth: CRON_SECRET is required in every environment
 * (local, preview, staging, production). Missing or mismatched secret → reject.
 * Accepts only `Authorization: Bearer <CRON_SECRET>` — never query params
 * (secrets in URLs leak to access logs, proxies, and browser history).
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) {
    console.error("[cron-auth] rejected: CRON_SECRET is not set");
    return false;
  }

  const header = request.headers.get("authorization");
  const provided =
    header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!provided) {
    console.error("[cron-auth] rejected: missing Authorization bearer");
    return false;
  }

  const expected = Buffer.from(secret, "utf8");
  const actual = Buffer.from(provided, "utf8");
  if (expected.length !== actual.length) {
    console.error("[cron-auth] rejected: secret length mismatch");
    return false;
  }

  try {
    if (!timingSafeEqual(expected, actual)) {
      console.error("[cron-auth] rejected: secret mismatch");
      return false;
    }
  } catch {
    console.error("[cron-auth] rejected: timingSafeEqual failed");
    return false;
  }

  return true;
}
