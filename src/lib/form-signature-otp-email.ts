/**
 * שליחת קוד חד-פעמי לחתימה ציבורית (/sign).
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

export function buildFormSignatureOtpEmailBodies(code: string): {
  text: string;
  html: string;
} {
  const text = [
    "שלום,",
    "",
    "קוד האימות לחתימה על הטופס הוא:",
    code,
    "",
    "הקוד בתוקף ל־10 דקות, ומיועד לשימוש חד־פעמי.",
    "אם לא ביקשתם לחתום על טופס — אפשר להתעלם מהודעה זו.",
    "",
    "פרוטוקל",
  ].join("\n");

  const html = `
    <p dir="rtl" style="direction:rtl;text-align:right">שלום,</p>
    <p dir="rtl" style="direction:rtl;text-align:right">קוד האימות לחתימה על הטופס הוא:</p>
    <p dir="ltr" style="direction:ltr;text-align:center;font-size:28px;letter-spacing:0.35em;font-weight:700;margin:24px 0">${code}</p>
    <p dir="rtl" style="direction:rtl;text-align:right">הקוד בתוקף ל־10 דקות, ומיועד לשימוש חד־פעמי.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">אם לא ביקשתם לחתום על טופס — אפשר להתעלם מהודעה זו.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">פרוטוקל</p>
  `;

  return { text, html };
}

async function sendViaResend(to: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from = resolveFrom();
  const { text, html } = buildFormSignatureOtpEmailBodies(code);

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[form-signature-otp-email] resend failed:", response.status, detail);
    return false;
  }
  return true;
}

export async function sendFormSignatureOtpEmail(args: {
  to: string;
  code: string;
}): Promise<{ sent: boolean }> {
  const viaResend = await sendViaResend(args.to, args.code);
  if (viaResend) return { sent: true };
  console.warn("[form-signature-otp-email] email not sent for recipient");
  return { sent: false };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFormSignatureLinkEmailBodies(args: {
  formTitle: string;
  studentName: string;
  fieldLabel: string;
  link: string;
  expiryDays: number;
}): { subject: string; text: string; html: string } {
  const subject = `בקשה לחתימה: ${args.formTitle}`;
  const steps = [
    "לוחצים על הכפתור «פתיחת הטופס וחתימה».",
    "מזינים את קוד האימות בן 6 הספרות שיישלח לכתובת המייל הזו.",
    "קוראים את המסמך, גוללים לתיבת החתימה הירוקה שמתחתיו וחותמים בתוכה באצבע או בעכבר.",
    "לוחצים על «אישור ושליחת החתימה».",
  ];

  const text = [
    args.formTitle,
    args.studentName ? `עבור: ${args.studentName}` : "",
    "",
    `התבקשתם לחתום בשדה: ${args.fieldLabel}`,
    "",
    "איך חותמים:",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    args.link,
    "",
    `הקישור אישי, חד־פעמי ותקף למשך ${args.expiryDays} ימים.`,
    "",
    "פרוטוקל",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  const stepsHtml = steps
    .map(
      (step) =>
        `<li style="margin:0 0 6px;">${escapeHtml(step)}</li>`
    )
    .join("");

  const html = `<div dir="rtl" style="direction:rtl;text-align:right;font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1e293b;line-height:1.7">
    <h2 style="margin:0 0 8px;color:#2f3b67">${escapeHtml(args.formTitle)}</h2>
    ${args.studentName ? `<p style="margin:0 0 14px"><strong>עבור:</strong> ${escapeHtml(args.studentName)}</p>` : ""}
    <p style="margin:0 0 14px">התבקשתם לחתום בשדה: <strong>${escapeHtml(args.fieldLabel)}</strong></p>
    <p style="margin:0 0 6px;font-weight:700">איך חותמים:</p>
    <ol style="margin:0 0 18px;padding-right:22px">${stepsHtml}</ol>
    <p style="margin:0 0 18px;text-align:center">
      <a href="${escapeHtml(args.link)}" style="display:inline-block;padding:14px 26px;background:#2f7d6d;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px">פתיחת הטופס וחתימה</a>
    </p>
    <p style="margin:0;color:#64748b;font-size:13px">הקישור אישי, חד־פעמי ותקף למשך ${args.expiryDays} ימים. אם לא ביקשתם לחתום על טופס — אפשר להתעלם מהודעה זו.</p>
    <p style="margin:18px 0 0">פרוטוקל</p>
  </div>`;

  return { subject, text, html };
}

/** מייל עם קישור חתימה אישי (/sign/<token>) — נשלח מהשרת אחרי אימות הצוות */
export async function sendFormSignatureLinkEmail(args: {
  to: string;
  formTitle: string;
  studentName: string;
  fieldLabel: string;
  link: string;
  expiryDays: number;
}): Promise<{ sent: boolean; detail?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, detail: "חסר RESEND_API_KEY" };

  const { subject, text, html } = buildFormSignatureLinkEmailBodies(args);
  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[form-signature-link-email] resend failed:", response.status);
    return { sent: false, detail: detail || `Resend ${response.status}` };
  }
  return { sent: true };
}
