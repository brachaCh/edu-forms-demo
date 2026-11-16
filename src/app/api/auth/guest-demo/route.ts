import { NextResponse } from "next/server";
import { DEMO_SESSION_MAX_AGE_SECONDS, DEMO_USER } from "@/lib/demo-data";
import {
  consumeEmailRateLimit,
  openEmailRateLimitQuery,
} from "@/lib/email-rate-limit";
import { FREE_ACCESS_SIGNUP_TO_EMAIL } from "@/lib/email-recipients";
import { clientIpFromRequest } from "@/lib/form-fill-otp-server";
import { resolveResendFrom } from "@/lib/resend-from";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";
import { guestDemoBodySchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function notifyFreeAccessSignup(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("[auth/guest-demo] resend failed: missing api key");
    return;
  }

  const from = resolveResendFrom();
  const textBody = [
    "נרשם משתמש חדש לכניסה חופשית.",
    "",
    `כתובת מייל: ${email}`,
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<body dir="rtl" style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;">
  <p>נרשם משתמש חדש לכניסה חופשית.</p>
  <p><strong>כתובת מייל:</strong> ${escapeHtml(email)}</p>
</body>
</html>`;

  try {
    const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "[auth/guest-demo] resend failed",
        response.status,
        detail.slice(0, 500)
      );
    }
  } catch {
    console.error("[auth/guest-demo] resend failed");
  }
}

/** מייל ההרשמה מוגבל. כניסה חופשית נשארת גם כשהשליחה נחסמת. */
async function allowSignupEmail(
  request: Request,
  email: string
): Promise<boolean> {
  const query = openEmailRateLimitQuery();
  const byIp = await consumeEmailRateLimit(
    query,
    `guest-demo:${clientIpFromRequest(request)}`
  );
  if (!byIp.ok) return false;
  const byEmail = await consumeEmailRateLimit(
    query,
    `guest-demo-email:${email}`
  );
  return byEmail.ok;
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, guestDemoBodySchema);
  const email = parsed.ok ? parsed.data.email ?? null : null;

  try {
    const query = openEmailRateLimitQuery();
    const sessionLimit = await consumeEmailRateLimit(
      query,
      `guest-demo-session:${clientIpFromRequest(request)}`
    );
    if (!sessionLimit.ok && sessionLimit.reason === "limited") {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMITED", retryAfterSec: sessionLimit.retryAfterSec },
        { status: 429 }
      );
    }

    const token = await createSessionToken(DEMO_USER, {
      maxAgeSeconds: DEMO_SESSION_MAX_AGE_SECONDS,
    });
    if (email) {
      try {
        const allowed = await allowSignupEmail(request, email);
        if (allowed) {
          await notifyFreeAccessSignup(email);
        } else {
          console.error("[auth/guest-demo] signup email skipped");
        }
      } catch {
        console.error("[auth/guest-demo] signup email skipped");
      }
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(DEMO_SESSION_MAX_AGE_SECONDS)
    );
    return response;
  } catch {
    console.error("[auth/guest-demo] session failed");
    return NextResponse.json(
      { ok: false, error: "GUEST_DEMO_FAILED" },
      { status: 500 }
    );
  }
}
