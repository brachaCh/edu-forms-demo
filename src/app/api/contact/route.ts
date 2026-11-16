import { NextResponse } from "next/server";
import { assertAllowedAppOrigin } from "@/lib/app-request-origin";
import {
  BANK_TRANSFER_CONTACT_TO_EMAIL,
  COMING_SOON_CONTACT_TO_EMAILS,
  CONTACT_TO_EMAIL,
  FREE_ACCESS_SIGNUP_TO_EMAIL,
} from "@/lib/email-recipients";
import {
  consumeEmailRateLimit,
  openEmailRateLimitQuery,
} from "@/lib/email-rate-limit";
import { clientIpFromRequest } from "@/lib/form-fill-otp-server";
import { resolveResendFrom } from "@/lib/resend-from";
import { contactBodySchema, parseJsonBody } from "@/lib/validation";

const INVALID_FIELDS = "נא למלא את כל השדות כראוי";
const SEND_FAILED = "שליחת ההודעה נכשלה. נסו שוב.";

function resolveRecipients(
  recipient: "default" | "coming-soon" | "free-access-signup" | "bank-transfer"
): string[] {
  if (recipient === "coming-soon") return [...COMING_SOON_CONTACT_TO_EMAILS];
  if (recipient === "free-access-signup") return [FREE_ACCESS_SIGNUP_TO_EMAIL];
  if (recipient === "bank-transfer") return [BANK_TRANSFER_CONTACT_TO_EMAIL];
  return [CONTACT_TO_EMAIL];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendContactEmail(args: {
  to: string[];
  from: string;
  subject: string;
  text: string;
  html: string;
  replyTo: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("[contact] resend failed: missing api key");
    return false;
  }

  try {
    const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    if (!response.ok) {
      console.error("[contact] resend failed", response.status);
      return false;
    }
    return true;
  } catch {
    console.error("[contact] resend failed");
    return false;
  }
}

export async function POST(request: Request) {
  if (!assertAllowedAppOrigin(request).ok) {
    return NextResponse.json(
      { ok: false, error: "מקור בקשה לא מורשה" },
      { status: 403 }
    );
  }

  const parsed = await parseJsonBody(request, contactBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: INVALID_FIELDS },
      { status: 400 }
    );
  }

  const website = parsed.data.website?.trim() ?? "";
  if (website) {
    console.error("[contact] honeypot skipped send");
    return NextResponse.json({ ok: true });
  }

  const recipient = parsed.data.recipient ?? "default";
  if (recipient !== "free-access-signup") {
    const rate = await consumeEmailRateLimit(
      openEmailRateLimitQuery(),
      `contact:${clientIpFromRequest(request)}`
    );
    if (!rate.ok && rate.reason === "limited") {
      return NextResponse.json(
        {
          ok: false,
          error: "נשלחו יותר מדי הודעות. נסו שוב בעוד כמה דקות.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSec) },
        }
      );
    }
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, error: "שליחת ההודעה אינה זמינה כרגע. נסו שוב מאוחר יותר." },
        { status: 503 }
      );
    }
  }

  const { name, email, subject, message } = parsed.data;
  const text = [`שם: ${name}`, `מייל: ${email}`, `נושא: ${subject}`, "", message].join(
    "\n"
  );
  const html = `<div dir="rtl" style="direction:rtl;text-align:right">
    <p><strong>שם:</strong> ${escapeHtml(name)}</p>
    <p><strong>מייל:</strong> ${escapeHtml(email)}</p>
    <p><strong>נושא:</strong> ${escapeHtml(subject)}</p>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
  </div>`;

  const sent = await sendContactEmail({
    to: resolveRecipients(recipient),
    from: resolveResendFrom(),
    subject: `[פרוטוקל] ${subject}`,
    text,
    html,
    replyTo: email,
  });

  if (!sent) {
    return NextResponse.json({ ok: false, error: SEND_FAILED }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
