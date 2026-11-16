/**
 * שליחת מייל הזמנת מורה משרת Next.
 * מעדיף RESEND_API_KEY מקומי; אחרת קורא ל-Edge Function teacher-invite-email.
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

function buildEmailContent(args: {
  teacherName: string;
  inviteUrl: string;
}): { text: string; html: string; subject: string } {
  const name = args.teacherName.trim();
  const greeting = name ? `ברוכה הבאה ${name}!` : "ברוכה הבאה!";

  const body =
    'מוזמנת להצטרף למערכת, להיכנס ל"פרוטוקל" ולמלא את דפי התלמידים שלך.';

  const text = [
    greeting,
    "",
    body,
    "",
    "לחצי על הקישור הבא להשלמת הרישום והכניסה (בתוקף לשנה):",
    args.inviteUrl,
    "",
    "אם לא ציפית להזמנה זו — אפשר להתעלם מהודעה זו.",
    "",
    "פרוטוקל",
  ].join("\n");

  const html = `
    <p dir="rtl" style="direction:rtl;text-align:right;font-size:18px;font-weight:700">${greeting}</p>
    <p dir="rtl" style="direction:rtl;text-align:right">${body}</p>
    <p dir="rtl" style="direction:rtl;text-align:right"><a href="${args.inviteUrl}">לחצי כאן להשלמת הרישום והכניסה למערכת</a></p>
    <p dir="rtl" style="direction:rtl;text-align:right">הקישור בתוקף לשנה.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">אם לא ציפית להזמנה זו — אפשר להתעלם מהודעה זו.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">פרוטוקל</p>
  `;

  return {
    text,
    html,
    subject: "הזמנה להצטרפות לפרוטוקל",
  };
}

async function sendViaResend(args: {
  to: string;
  teacherName: string;
  inviteUrl: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from = resolveFrom();
  const { text, html, subject } = buildEmailContent(args);

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[teacher-invite-email] resend failed:", response.status, detail);
    return false;
  }
  return true;
}

async function sendViaEdgeFunction(args: {
  to: string;
  teacherName: string;
  inviteUrl: string;
}): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;

  try {
    const response = await fetch(`${base}/functions/v1/teacher-invite-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[teacher-invite-email] edge failed:", response.status, detail);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[teacher-invite-email] edge invoke error:", error);
    return false;
  }
}

export async function sendTeacherInviteEmail(args: {
  to: string;
  teacherName: string;
  inviteUrl: string;
}): Promise<{ sent: boolean }> {
  const viaResend = await sendViaResend(args);
  if (viaResend) return { sent: true };

  const viaEdge = await sendViaEdgeFunction(args);
  if (viaEdge) return { sent: true };

  console.warn(
    "[teacher-invite-email] email not sent for recipient"
  );
  return { sent: false };
}
