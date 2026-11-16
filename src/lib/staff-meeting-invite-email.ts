/**
 * שליחת מייל הזמנה לישיבת צוות — Resend דרך Next (כמו הזמנת מורה / OTP).
 */

import { resolveResendFrom } from "@/lib/resend-from";
import { buildStaffMeetingParentEmailHtmlFromText } from "@/lib/staff-meeting-parent-email";

export function buildStaffMeetingInviteEmail(args: {
  subject: string;
  text: string;
}): { subject: string; text: string; html: string } {
  const subject = args.subject.trim();
  const text = args.text.trim();
  return {
    subject,
    text,
    html: buildStaffMeetingParentEmailHtmlFromText(subject, text),
  };
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from = resolveResendFrom();
  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[staff-meeting-invite-email] resend failed:",
      response.status,
      detail
    );
    return false;
  }
  return true;
}

export async function sendStaffMeetingInviteEmail(args: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean }> {
  const built = buildStaffMeetingInviteEmail(args);
  const viaResend = await sendViaResend({
    to: args.to,
    subject: built.subject,
    text: built.text,
    html: built.html,
  });
  if (viaResend) return { sent: true };
  console.warn("[staff-meeting-invite-email] email not sent for recipient");
  return { sent: false };
}
