/** שם תצוגה ASCII — עברית ב-From נדחית על ידי Resend */
const BRAND_FROM_DISPLAY = "Protokal";
const PROJECT_FROM_EMAIL = "noreply@example.com";
const RESEND_TEST_EMAIL = "onboarding@resend.dev";
const ASCII_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function extractEmailAddress(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const angle = raw.match(/<([^>]+)>/);
  if (angle?.[1]) {
    const inner = angle[1].trim().match(ASCII_EMAIL_RE);
    if (inner) return inner[0].toLowerCase();
  }
  const any = raw.match(ASCII_EMAIL_RE);
  return any ? any[0].toLowerCase() : "";
}

/** From לכל המיילים היוצאים מנתיבי Next. תמיד ASCII. */
export function resolveResendFrom(): string {
  const forceTest =
    (process.env.RESEND_FORCE_TEST_FROM ?? "").trim().toLowerCase() === "true";
  if (forceTest) return `${BRAND_FROM_DISPLAY} <${RESEND_TEST_EMAIL}>`;

  const explicit = (process.env.RESEND_FROM_EMAIL ?? "").trim();
  const email = extractEmailAddress(explicit) || PROJECT_FROM_EMAIL;
  if (email === RESEND_TEST_EMAIL) {
    return `${BRAND_FROM_DISPLAY} <${RESEND_TEST_EMAIL}>`;
  }
  return `${BRAND_FROM_DISPLAY} <${email}>`;
}
