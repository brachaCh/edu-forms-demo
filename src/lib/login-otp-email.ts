/**
 * שליחת מייל עם קוד כניסה חד-פעמי.
 * מעדיף RESEND_API_KEY מקומי; אחרת קורא ל-Edge Function password-reset-email
 * עם גוף מותאם (to + subject/text דרך Resend ישיר).
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

function buildBodies(code: string): { text: string; html: string } {
  const text = [
    "שלום,",
    "",
    "קוד הכניסה שלכם לפרוטוקל הוא:",
    code,
    "",
    "הקוד בתוקף ל־10 דקות, ומיועד לשימוש חד־פעמי.",
    "אם לא ביקשתם קוד כניסה — אפשר להתעלם מהודעה זו.",
    "",
    "פרוטוקל",
  ].join("\n");

  const html = `
    <p dir="rtl" style="direction:rtl;text-align:right">שלום,</p>
    <p dir="rtl" style="direction:rtl;text-align:right">קוד הכניסה שלכם לפרוטוקל הוא:</p>
    <p dir="ltr" style="direction:ltr;text-align:center;font-size:28px;letter-spacing:0.35em;font-weight:700;margin:24px 0">${code}</p>
    <p dir="rtl" style="direction:rtl;text-align:right">הקוד בתוקף ל־10 דקות, ומיועד לשימוש חד־פעמי.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">אם לא ביקשתם קוד כניסה — אפשר להתעלם מהודעה זו.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">פרוטוקל</p>
  `;

  return { text, html };
}

async function sendViaResend(to: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from = resolveFrom();
  const { text, html } = buildBodies(code);

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[login-otp-email] resend failed:", response.status, detail);
    return false;
  }
  return true;
}

export async function sendLoginOtpEmail(args: {
  to: string;
  code: string;
}): Promise<{ sent: boolean }> {
  const viaResend = await sendViaResend(args.to, args.code);
  if (viaResend) return { sent: true };

  // לא מדפיסים את הקוד ללוגים — רגיש לאבטחה
  console.warn("[login-otp-email] email not sent for recipient");
  return { sent: false };
}
