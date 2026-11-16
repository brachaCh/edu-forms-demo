import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  generateResetToken,
  hashResetToken,
  RESET_TOKEN_TTL_MS,
} from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";
import { appOrigin } from "@/lib/app-origin";
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
      "אם קיים חשבון עם כתובת מייל זו, נשלח אליה קישור לאיפוס הסיסמה.",
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
    console.error("[forgot-password] rate limit read:", error.message);
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
    console.error("[forgot-password] rate limit write:", writeError.message);
    return { ok: false, retryAfterSec: 60 };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, emailOnlyBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }
  const email = parsed.data.email;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    // מצב מקומי בלי שרת — עדיין מחזירים הודעת הצלחה גנרית
    return okResponse();
  }

  try {
    const supabase = createServiceClient();
    const rate = await assertRateLimit(
      supabase,
      `password-reset:${clientIp(request)}`
    );
    if (!rate.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec: rate.retryAfterSec },
        { status: 429 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) {
      console.error("[forgot-password] profile lookup:", profileError.message);
      return okResponse();
    }

    if (!profile?.id) {
      return okResponse();
    }

    const rawToken = generateResetToken();
    const tokenHash = await hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    // מבטלים אסימונים קודמים שלא נוצלו
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", profile.id)
      .is("used_at", null);

    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: profile.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("[forgot-password] insert token:", insertError.message);
      return NextResponse.json({ error: "RESET_UNAVAILABLE" }, { status: 503 });
    }

    const resetUrl = `${appOrigin(request)}/reset-password?token=${rawToken}`;
    const to = (profile.email || email).trim().toLowerCase();
    const { sent } = await sendPasswordResetEmail({ to, resetUrl });
    if (!sent) {
      return NextResponse.json({ error: "EMAIL_SEND_FAILED" }, { status: 502 });
    }

    return okResponse();
  } catch (error) {
    console.error("[forgot-password]", error);
    return okResponse();
  }
}
