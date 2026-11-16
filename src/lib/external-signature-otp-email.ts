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

export function buildExternalSignatureOtpEmailBodies(code: string): {
  text: string;
  html: string;
} {
  const text = [
    "שלום,",
    "",
    "קוד האימות לחתימה על המסמך הוא:",
    code,
    "",
    "הקוד בתוקף ל־10 דקות, ומיועד לשימוש חד־פעמי.",
    "אם לא ביקשתם לחתום על מסמך — אפשר להתעלם מהודעה זו.",
    "",
    "פרוטוקל",
  ].join("\n");

  const html = `
    <p dir="rtl" style="direction:rtl;text-align:right">שלום,</p>
    <p dir="rtl" style="direction:rtl;text-align:right">קוד האימות לחתימה על המסמך הוא:</p>
    <p dir="ltr" style="direction:ltr;text-align:center;font-size:28px;letter-spacing:0.35em;font-weight:700;margin:24px 0">${code}</p>
    <p dir="rtl" style="direction:rtl;text-align:right">הקוד בתוקף ל־10 דקות, ומיועד לשימוש חד־פעמי.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">אם לא ביקשתם לחתום על מסמך — אפשר להתעלם מהודעה זו.</p>
    <p dir="rtl" style="direction:rtl;text-align:right">פרוטוקל</p>
  `;

  return { text, html };
}

export async function sendExternalSignatureOtpEmail(args: {
  to: string;
  code: string;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false };

  const { text, html } = buildExternalSignatureOtpEmailBodies(args.code);

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    console.error("[external-signature-otp-email] resend failed:", response.status);
    return { sent: false };
  }
  return { sent: true };
}
