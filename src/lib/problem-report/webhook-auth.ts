import { timingSafeEqual } from "node:crypto";

/**
 * Fail-closed auth for Tzavta → Giti status callbacks.
 * Missing or mismatched TZAVTA_STATUS_WEBHOOK_SECRET → reject.
 */
export function problemReportStatusAuthorized(request: Request): boolean {
  const secret = process.env.TZAVTA_STATUS_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    console.error("[problem-report/status] rejected: TZAVTA_STATUS_WEBHOOK_SECRET is not set");
    return false;
  }

  const header = request.headers.get("authorization");
  const provided =
    header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!provided) {
    console.error("[problem-report/status] rejected: missing Authorization bearer");
    return false;
  }

  const expected = Buffer.from(secret, "utf8");
  const actual = Buffer.from(provided, "utf8");
  if (expected.length !== actual.length) {
    console.error("[problem-report/status] rejected: secret length mismatch");
    return false;
  }

  try {
    if (!timingSafeEqual(expected, actual)) {
      console.error("[problem-report/status] rejected: secret mismatch");
      return false;
    }
  } catch {
    console.error("[problem-report/status] rejected: timingSafeEqual failed");
    return false;
  }

  return true;
}
