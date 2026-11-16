import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  generateOtpCode,
  getDevOtpBypassCode,
  hashOtpCode,
  isDevOtpBypassEnabled,
  OTP_TTL_MS,
} from "@/lib/login-otp";
import { sendLoginOtpEmail } from "@/lib/login-otp-email";
import { emailOnlyBodySchema, parseJsonBody } from "@/lib/validation";

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function clientIp(request: Request): string {
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

/** תשובה אחידה — לא חושפת אם המייל קיים במערכת */
function okResponse() {
  return NextResponse.json({
    ok: true,
    message:
      "אם קיים חשבון עם כתובת מייל זו, נשלח אליה קוד כניסה חד־פעמי.",
  });
}

async function assertRateLimit(
  supabase: ReturnType<typeof createServiceClient>,
  bucket: string
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = Date.now();
  const { data: row, error } = await supabase
    .from("email_rate_limits")
    .select("window_start, hit_count")
    .eq("bucket_key", bucket)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { ok: true };
    }
    console.error("[auth/otp/request] rate limit read:", error.message);
    return { ok: false, retryAfterSec: 60 };
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

  if (hitCount >= RATE_LIMIT) {
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
    console.error("[auth/otp/request] rate limit write:", writeError.message);
    return { ok: false, retryAfterSec: 60 };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, emailOnlyBodySchema);
  if (!parsed.ok) return parsed.response;
  const email = parsed.data.email;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return okResponse();
  }

  try {
    const supabase = createServiceClient();
    const ip = clientIp(request);
    const rateIp = await assertRateLimit(supabase, `login-otp:${ip}`);
    if (!rateIp.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rateIp.retryAfterSec },
        { status: 429 }
      );
    }
    const rateEmail = await assertRateLimit(supabase, `login-otp-email:${email}`);
    if (!rateEmail.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rateEmail.retryAfterSec },
        { status: 429 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) {
      console.error("[auth/otp/request] profile lookup:", profileError.message);
      return okResponse();
    }

    if (!profile?.id) {
      return okResponse();
    }

    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    await supabase
      .from("login_otp_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", profile.id)
      .is("used_at", null);

    const { error: insertError } = await supabase.from("login_otp_codes").insert({
      user_id: profile.id,
      code_hash: codeHash,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("[auth/otp/request] insert:", insertError.message);
      return NextResponse.json({ error: "OTP_UNAVAILABLE" }, { status: 503 });
    }

    const to = (profile.email || email).trim().toLowerCase();
    const { sent } = await sendLoginOtpEmail({ to, code });
    const isDev = process.env.NODE_ENV !== "production";
    if (!sent) {
      if (!isDev) {
        return NextResponse.json({ error: "EMAIL_SEND_FAILED" }, { status: 502 });
      }
      console.warn(`[auth/otp/request] dev: OTP for ${to}: ${code}`);
    }
    if (isDev && isDevOtpBypassEnabled()) {
      console.warn(
        `[auth/otp/request] DEV_OTP_BYPASS active — use code ${getDevOtpBypassCode()}`
      );
    }

    return okResponse();
  } catch (error) {
    console.error("[auth/otp/request]", error);
    return okResponse();
  }
}
