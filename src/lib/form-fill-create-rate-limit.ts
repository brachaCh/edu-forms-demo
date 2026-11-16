import type {
  EmailRateLimitResult,
  RateLimitQuery,
} from "@/lib/email-rate-limit";

/** מגבלות ייעודיות ל-/api/fill/create — לא משתפות ב-5 ל-15 דקות של מייל כללי */
export const FORM_FILL_CREATE_WINDOW_MS = 60 * 60 * 1000;
export const FORM_FILL_CREATE_USER_LIMIT = 60;
export const FORM_FILL_CREATE_INSTITUTION_LIMIT = 200;

type LimitRow = { window_start: string; hit_count: number };

export function evaluateFormFillCreateRateLimit(args: {
  now: number;
  row: LimitRow | null;
  limit: number;
  windowMs?: number;
}):
  | { action: "allow"; windowStart: string; hitCount: number }
  | { action: "deny"; retryAfterSec: number } {
  const windowMs = args.windowMs ?? FORM_FILL_CREATE_WINDOW_MS;
  const now = args.now;
  let windowStart = now;
  let hitCount = 0;
  if (args.row?.window_start) {
    const prev = new Date(args.row.window_start).getTime();
    if (!Number.isNaN(prev) && now - prev < windowMs) {
      windowStart = prev;
      hitCount = Number(args.row.hit_count) || 0;
    }
  }

  if (hitCount >= args.limit) {
    return {
      action: "deny",
      retryAfterSec: Math.max(
        1,
        Math.ceil((windowStart + windowMs - now) / 1000)
      ),
    };
  }

  return {
    action: "allow",
    windowStart: new Date(windowStart).toISOString(),
    hitCount: hitCount + 1,
  };
}

export async function consumeFormFillCreateRateLimit(
  query: RateLimitQuery | null,
  bucket: string,
  limit: number,
  now = Date.now()
): Promise<EmailRateLimitResult> {
  if (!query) return { ok: false, reason: "unavailable" };

  try {
    const read = await query.read(bucket);
    if (read.errorMessage) {
      console.error("[form-fill-create-rate-limit] read failed");
      return { ok: false, reason: "unavailable" };
    }

    const decision = evaluateFormFillCreateRateLimit({
      now,
      row: read.row,
      limit,
    });
    if (decision.action === "deny") {
      return {
        ok: false,
        reason: "limited",
        retryAfterSec: decision.retryAfterSec,
      };
    }

    const write = await query.write({
      bucket_key: bucket,
      window_start: decision.windowStart,
      hit_count: decision.hitCount,
      updated_at: new Date(now).toISOString(),
    });
    if (write.errorMessage) {
      console.error("[form-fill-create-rate-limit] write failed");
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true };
  } catch {
    console.error("[form-fill-create-rate-limit] unavailable");
    return { ok: false, reason: "unavailable" };
  }
}
