/**
 * שליחת קוד חד-פעמי למילוי טופס ציבורי (/fill).
 * מעדיף RESEND_API_KEY מקומי.
 */

const RESEND_TEST_FROM = "פרוטוקל <onboarding@resend.dev>";
const PROJECT_FROM = "פרוטוקל <noreply@example.com>";

function extractEmailAddress(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  return (angle?.[1] ?? value).trim().toLowerCase();
}

function resolveFrom(): string {
  const forceTest =
    (process.env.RESEND_FORCE_TEST_FROM ?? "").trim().toLowerCase() === "true";
  if (forceTest) return RESEND_TEST_FROM;

  const explicit = (process.env.RESEND_FROM_EMAIL ?? "").trim();
  if (explicit) {
    const email = extractEmailAddress(explicit);
    if (email === "onboarding@resend.dev") return RESEND_TEST_FROM;
    if (!explicit.includes("<")) return `פרוטוקל <${explicit}>`;
    return explicit
      .replace(/\bMatoah\b/gi, "פרוטוקל")
      .replace(/מתוה/g, "פרוטוקל");
  }
  return PROJECT_FROM;
}

export function buildFormFillOtpEmailBodies(code: string): {
  text: string;
  html: string;
} {
  const text = [
    "שלום,",
    "",
    "קוד האימות למילוי הטופס הוא:",
    code,
    "",
    "הקוד בתוקף ל־10 דקות, ומיועד לשימוש חד־פעמי.",
    "אם לא ביקשתם למלא טופס — אפשר להתעלם מהודעה זו.",
    "",
    "פרוטוקל",
  ].join("\n");

  const html = `
    <p dir="rtl" style="direction:rtl;text-align:right">שלום,</p>
    <p dir="rtl" style="direction:rtl;text-align:right">קוד האימות למילוי הטופס הוא:</p>
    <p dir="ltr" style="direction:ltr;text-align:center;font-size:28px;letter-spacing:0.35em;font-weight:700;margin:24px 0">${code}</p>
    <p dir="rtl" style="direction:rtl;text-align:right">הקוד בתוקף ל־10 דקות, ומיועד לשימוש חד־פעמי.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">אם לא ביקשתם למלא טופס — אפשר להתעלם מהודעה זו.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">פרוטוקל</p>
  `;

  return { text, html };
}

async function sendViaResend(to: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from = resolveFrom();
  const { text, html } = buildFormFillOtpEmailBodies(code);

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[form-fill-otp-email] resend failed:", response.status, detail);
    return false;
  }
  return true;
}

export async function sendFormFillOtpEmail(args: {
  to: string;
  code: string;
}): Promise<{ sent: boolean }> {
  const viaResend = await sendViaResend(args.to, args.code);
  if (viaResend) return { sent: true };
  console.warn("[form-fill-otp-email] email not sent for recipient");
  return { sent: false };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFormFillLinkEmailBodies(args: {
  formTitle: string;
  studentName: string;
  note?: string;
  link: string;
  expiryDays: number;
}): { subject: string; text: string; html: string } {
  const subject = `בקשה למילוי טופס: ${args.formTitle}`;
  const text = [
    args.formTitle,
    args.studentName,
    args.note ? `הודעה: ${args.note}` : "",
    args.link,
    `הקישור תקף למשך ${args.expiryDays} ימים.`,
    "לאחר הפתיחה יישלח קוד אימות חד־פעמי לכתובת מייל זו.",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <h2>${escapeHtml(args.formTitle)}</h2>
      ${args.studentName ? `<p><strong>עבור התלמיד/ה:</strong> ${escapeHtml(args.studentName)}</p>` : ""}
      <p>התבקשת למלא את הטופס בקישור האישי הבא:</p>
      ${args.note ? `<p><strong>הודעה מהצוות:</strong> ${escapeHtml(args.note)}</p>` : ""}
      <p><a href="${escapeHtml(args.link)}" style="display:inline-block;padding:12px 22px;background:#2f7d6d;color:white;text-decoration:none;border-radius:8px">פתיחת הטופס למילוי</a></p>
      <p style="color:#64748b;font-size:13px">הקישור אישי ותקף למשך ${args.expiryDays} ימים. לאחר הפתיחה יישלח קוד אימות חד־פעמי לכתובת מייל זו.</p>
    </div>`;

  return { subject, text, html };
}

/** מייל עם קישור מילוי אישי (/fill/<token>) — נשלח מהשרת אחרי אימות הצוות */
export async function sendFormFillLinkEmail(args: {
  to: string;
  formTitle: string;
  studentName: string;
  note?: string;
  link: string;
  expiryDays: number;
}): Promise<{ sent: boolean; detail?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, detail: "חסר RESEND_API_KEY" };

  const { subject, text, html } = buildFormFillLinkEmailBodies(args);
  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[form-fill-link-email] resend failed:", response.status);
    return { sent: false, detail: detail || `Resend ${response.status}` };
  }
  return { sent: true };
}
