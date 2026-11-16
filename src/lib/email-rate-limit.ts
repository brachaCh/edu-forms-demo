import {
  createPublicServiceClient,
  createServiceClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export type EmailRateLimitResult =
  | { ok: true }
  | { ok: false; reason: "limited"; retryAfterSec: number }
  | { ok: false; reason: "unavailable" };

type LimitRow = { window_start: string; hit_count: number };

export type RateLimitQuery = {
  read(bucket: string): Promise<{
    row: LimitRow | null;
    errorMessage: string | null;
  }>;
  write(row: {
    bucket_key: string;
    window_start: string;
    hit_count: number;
    updated_at: string;
  }): Promise<{ errorMessage: string | null }>;
};

export function evaluateEmailRateLimit(args: {
  now: number;
  row: LimitRow | null;
}):
  | { action: "allow"; windowStart: string; hitCount: number }
  | { action: "deny"; retryAfterSec: number } {
  const now = args.now;
  let windowStart = now;
  let hitCount = 0;
  if (args.row?.window_start) {
    const prev = new Date(args.row.window_start).getTime();
    if (!Number.isNaN(prev) && now - prev < RATE_WINDOW_MS) {
      windowStart = prev;
      hitCount = Number(args.row.hit_count) || 0;
    }
  }

  if (hitCount >= RATE_LIMIT) {
    return {
      action: "deny",
      retryAfterSec: Math.max(
        1,
        Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000)
      ),
    };
  }

  return {
    action: "allow",
    windowStart: new Date(windowStart).toISOString(),
    hitCount: hitCount + 1,
  };
}

export function openEmailRateLimitQuery(): RateLimitQuery | null {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) return null;
  try {
    return supabaseRateLimitQuery(createPublicServiceClient());
  } catch {
    return null;
  }
}

export function supabaseRateLimitQuery(
  supabase: ReturnType<typeof createServiceClient>
): RateLimitQuery {
  return {
    async read(bucket) {
      const { data, error } = await supabase
        .from("email_rate_limits")
        .select("window_start, hit_count")
        .eq("bucket_key", bucket)
        .maybeSingle();
      if (error) return { row: null, errorMessage: error.message };
      if (!data?.window_start) return { row: null, errorMessage: null };
      return {
        row: {
          window_start: String(data.window_start),
          hit_count: Number(data.hit_count) || 0,
        },
        errorMessage: null,
      };
    },
    async write(row) {
      const { error } = await supabase.from("email_rate_limits").upsert(row, {
        onConflict: "bucket_key",
      });
      return { errorMessage: error?.message ?? null };
    },
  };
}

/** נכשל סגור: בלי לקוח, בשגיאת קריאה/כתיבה, או בחריגה — לא מאפשר שליחה. */
export async function consumeEmailRateLimit(
  query: RateLimitQuery | null,
  bucket: string,
  now = Date.now()
): Promise<EmailRateLimitResult> {
  if (!query) return { ok: false, reason: "unavailable" };

  try {
    const read = await query.read(bucket);
    if (read.errorMessage) {
      console.error("[email-rate-limit] read failed");
      return { ok: false, reason: "unavailable" };
    }

    const decision = evaluateEmailRateLimit({ now, row: read.row });
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
      console.error("[email-rate-limit] write failed");
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true };
  } catch {
    console.error("[email-rate-limit] unavailable");
    return { ok: false, reason: "unavailable" };
  }
}
