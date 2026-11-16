import { hashFormFillToken } from "@/lib/form-fill-otp";
import type { createServiceClient } from "@/lib/supabase/admin";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type PendingFormFillRequest = {
  id: string;
  recipient_email: string;
  form_title: string;
  student_name: string;
  form_id: string;
  form_fill_id: string;
  status: string;
  expires_at: string;
};

export async function loadPendingFormFillRequest(
  supabase: ServiceClient,
  token: string
): Promise<PendingFormFillRequest | null> {
  const tokenHash = await hashFormFillToken(token);
  const { data, error } = await supabase
    .from("form_fill_requests")
    .select(
      "id, recipient_email, form_title, student_name, form_id, form_fill_id, status, expires_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data?.id) return null;
  if (data.status !== "pending") return null;
  const expiresAt = new Date(data.expires_at as string).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    await supabase
      .from("form_fill_requests")
      .update({ status: "expired" })
      .eq("id", data.id)
      .eq("status", "pending");
    return null;
  }

  return {
    id: String(data.id),
    recipient_email: String(data.recipient_email ?? "")
      .trim()
      .toLowerCase(),
    form_title: String(data.form_title ?? ""),
    student_name: String(data.student_name ?? ""),
    form_id: String(data.form_id ?? ""),
    form_fill_id: String(data.form_fill_id ?? ""),
    status: String(data.status ?? ""),
    expires_at: String(data.expires_at ?? ""),
  };
}

export function sessionMaxAgeSeconds(expiresAtIso: string): number {
  const expiresAt = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiresAt)) return 60 * 60;
  return Math.max(60, Math.min(60 * 60 * 24 * 14, Math.floor((expiresAt - Date.now()) / 1000)));
}

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export type FormFillRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number; unavailable?: boolean };

/**
 * Persisted limiter on `email_rate_limits`.
 * Default is fail-open when the table is missing (OTP email still sends).
 * Pass `failClosed: true` for public AI so a missing table / read error
 * cannot bypass the cap.
 */
export async function assertFormFillOtpRateLimit(
  supabase: ServiceClient,
  bucket: string,
  options: { limit?: number; failClosed?: boolean } = {}
): Promise<FormFillRateLimitResult> {
  const limit = Math.max(1, options.limit ?? RATE_LIMIT);
  const now = Date.now();
  const { data: row, error } = await supabase
    .from("email_rate_limits")
    .select("window_start, hit_count")
    .eq("bucket_key", bucket)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      if (options.failClosed) {
        return { ok: false, retryAfterSec: 60, unavailable: true };
      }
      return { ok: true };
    }
    console.error("[form-fill-otp] rate limit read:", error.message);
    return { ok: false, retryAfterSec: 60, unavailable: true };
  }

  let windowStart = now;
  let hitCount = 0;
  if (row?.window_start) {
    const prev = new Date(row.window_start as string).getTime();
    if (!Number.isNaN(prev) && now - prev < RATE_WINDOW_MS) {
      windowStart = prev;
      hitCount = Number(row.hit_count) || 0;
    }
  }

  if (hitCount >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000)
      ),
    };
  }

  const { error: writeError } = await supabase.from("email_rate_limits").upsert(
    {
      bucket_key: bucket,
      window_start: new Date(windowStart).toISOString(),
      hit_count: hitCount + 1,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "bucket_key" }
  );

  if (writeError) {
    console.error("[form-fill-otp] rate limit write:", writeError.message);
    return { ok: false, retryAfterSec: 60, unavailable: true };
  }
  return { ok: true };
}

export async function hasValidFormFillOtpSession(
  supabase: ServiceClient,
  requestId: string,
  sessionToken: string
): Promise<boolean> {
  if (!sessionToken) return false;
  const sessionHash = await hashFormFillToken(sessionToken);
  const { data, error } = await supabase
    .from("form_fill_otp_sessions")
    .select("id, expires_at")
    .eq("request_id", requestId)
    .eq("session_hash", sessionHash)
    .maybeSingle();
  if (error || !data?.id) return false;
  const expiresAt = new Date(data.expires_at as string).getTime();
  return !Number.isNaN(expiresAt) && expiresAt > Date.now();
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  ).slice(0, 128);
}
