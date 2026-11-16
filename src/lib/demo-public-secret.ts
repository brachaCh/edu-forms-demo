/** סוד מקומי להדגמה בלבד. אין חשבונות אמיתיים ואין מסד נתונים. */
export const DEMO_PUBLIC_SESSION_SECRET =
  "edu-forms-demo-local-only-session-key";

export function demoSessionSecret(): string {
  const secret = process.env.MATOAH_SESSION_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  return DEMO_PUBLIC_SESSION_SECRET;
}
