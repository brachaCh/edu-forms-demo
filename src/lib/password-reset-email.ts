/**
 * שליחת מייל איפוס סיסמה משרת Next.
 * מעדיף RESEND_API_KEY מקומי; אחרת קורא ל-Edge Function password-reset-email.
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

async function sendViaResend(to: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from = resolveFrom();
  const text = [
    "שלום,",
    "",
    "קיבלנו בקשה לאיפוס הסיסמה בחשבון פרוטוקל שלכם.",
    "לבחירת סיסמה חדשה לחצו על הקישור הבא (בתוקף לשעה אחת):",
    resetUrl,
    "",
    "אם לא ביקשתם איפוס סיסמה — אפשר להתעלם מהודעה זו.",
    "",
    "פרוטוקל",
  ].join("\n");

  const html = `
    <p dir="rtl" style="direction:rtl;text-align:right">שלום,</p>
    <p dir="rtl" style="direction:rtl;text-align:right">קיבלנו בקשה לאיפוס הסיסמה בחשבון פרוטוקל שלכם.</p>
    <p dir="rtl" style="direction:rtl;text-align:right"><a href="${resetUrl}">לחצו כאן לבחירת סיסמה חדשה</a></p>
    <p dir="rtl" style="direction:rtl;text-align:right">הקישור בתוקף לשעה אחת.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">אם לא ביקשתם איפוס סיסמה — אפשר להתעלם מהודעה זו.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">פרוטוקל</p>
  `;

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[password-reset-email] resend failed:", response.status, detail);
    return false;
  }
  return true;
}

async function sendViaEdgeFunction(
  to: string,
  resetUrl: string
): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;

  try {
    const response = await fetch(`${base}/functions/v1/password-reset-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, resetUrl }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "[password-reset-email] edge failed:",
        response.status,
        detail
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[password-reset-email] edge invoke error:", error);
    return false;
  }
}

export async function sendPasswordResetEmail(args: {
  to: string;
  resetUrl: string;
}): Promise<{ sent: boolean }> {
  const viaResend = await sendViaResend(args.to, args.resetUrl);
  if (viaResend) return { sent: true };

  const viaEdge = await sendViaEdgeFunction(args.to, args.resetUrl);
  if (viaEdge) return { sent: true };

  // פיתוח מקומי בלי Resend — מדפיסים את הקישור ללוג השרת
  console.warn(
    "[password-reset-email] email not sent; reset URL for",
    args.to,
    ":",
    args.resetUrl
  );
  return { sent: false };
}
