import { resolveResendFrom } from "@/lib/resend-from";

export type SendProblemReportMailArgs = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendMailResult = { sent: true } | { sent: false; detail: string };

/**
 * Resend send used by problem-report routes. Same From branding as the rest
 * of the app (`resolveResendFrom`).
 */
export async function sendProblemReportMail(
  args: SendProblemReportMailArgs
): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("[problem-report] resend failed: missing api key");
    return { sent: false, detail: "חסר RESEND_API_KEY" };
  }
  const to = args.to.map((e) => e.trim()).filter(Boolean);
  if (to.length === 0) {
    return { sent: false, detail: "אין נמענים" };
  }

  const payload: Record<string, unknown> = {
    from: resolveResendFrom(),
    to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  };
  if (args.replyTo?.trim()) payload.reply_to = args.replyTo.trim();

  try {
    const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "[problem-report] resend failed",
        response.status,
        detail.slice(0, 200)
      );
      return { sent: false, detail: detail || `Resend ${response.status}` };
    }
    return { sent: true };
  } catch {
    console.error("[problem-report] resend failed");
    return { sent: false, detail: "RESEND_ERROR" };
  }
}
