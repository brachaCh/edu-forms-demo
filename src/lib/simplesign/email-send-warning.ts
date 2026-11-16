export const SIMPLE_SIGN_EMAIL_SEND_WARNING =
  "המייל לא נשלח לכל החותמים. אפשר להעתיק את קישור החתימה ולשלוח ידנית.";

/** Warn when Resend delivered fewer messages than the number of signers. */
export function simpleSignEmailSendWarning(
  emailsSent: number,
  signerCount: number
): string | undefined {
  if (emailsSent >= signerCount) return undefined;
  return SIMPLE_SIGN_EMAIL_SEND_WARNING;
}
