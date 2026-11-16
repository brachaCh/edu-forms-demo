import { NextResponse } from "next/server";
import { assertAllowedAppOrigin } from "@/lib/app-request-origin";
import { prepareBugReportScreenshots } from "@/lib/bug-report-screenshots";
import { buildBugReportEmail } from "@/lib/bugs/bugReportEmail";
import {
  consumeEmailRateLimit,
  openEmailRateLimitQuery,
} from "@/lib/email-rate-limit";
import {
  BUG_REPORT_FALLBACK_REPLY_TO,
  BUG_REPORT_RECIPIENTS,
} from "@/lib/email-recipients";
import { clientIpFromRequest } from "@/lib/form-fill-otp-server";
import { resolveResendFrom } from "@/lib/resend-from";
import { bugReportBodySchema, parseJsonBody } from "@/lib/validation";

const SEND_FAILED = "שליחת הדיווח נכשלה";

async function sendResendEmail(args: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo: string;
  attachments: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("[bug-report] resend failed: missing api key");
    return false;
  }

  const payload: Record<string, unknown> = {
    from: args.from,
    to: [args.to],
    subject: args.subject,
    text: args.text,
    html: args.html,
    reply_to: args.replyTo,
  };
  if (args.attachments.length) {
    payload.attachments = args.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      content_type: a.contentType,
    }));
  }

  try {
    const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "[bug-report] resend failed",
        response.status,
        detail.slice(0, 500)
      );
      return false;
    }
    return true;
  } catch {
    console.error("[bug-report] resend failed");
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

  const parsed = await parseJsonBody(request, bugReportBodySchema);
  if (!parsed.ok) return parsed.response;

  const website = parsed.data.website?.trim() ?? "";
  if (website) {
    return NextResponse.json({ ok: true });
  }

  const prepared = prepareBugReportScreenshots(parsed.data.screenshots ?? []);
  if (!prepared.ok) {
    return NextResponse.json(
      { ok: false, error: "צילום מסך לא תקין" },
      { status: 400 }
    );
  }

  const rate = await consumeEmailRateLimit(
    openEmailRateLimitQuery(),
    `bug-report:${clientIpFromRequest(request)}`
  );
  if (!rate.ok && rate.reason === "limited") {
    return NextResponse.json(
      { ok: false, error: "נשלחו יותר מדי הודעות. נסו שוב בעוד כמה דקות." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      }
    );
  }
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "שליחת הדיווח אינה זמינה כרגע. נסו שוב מאוחר יותר." },
      { status: 503 }
    );
  }

  const reporterEmail =
    parsed.data.reporterEmail || BUG_REPORT_FALLBACK_REPLY_TO;
  const mail = buildBugReportEmail({
    message: parsed.data.message,
    urgency: parsed.data.urgency,
    reporterEmail,
    pageUrl: parsed.data.pageUrl || "—",
    screenshotCount: prepared.attachments.length,
  });

  const from = resolveResendFrom();
  const results = await Promise.all(
    BUG_REPORT_RECIPIENTS.map((to) =>
      sendResendEmail({
        to,
        from,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: reporterEmail,
        attachments: prepared.attachments,
      })
    )
  );

  if (!results.some(Boolean)) {
    return NextResponse.json({ ok: false, error: SEND_FAILED }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
