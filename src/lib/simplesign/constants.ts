/** ערך שנשמר בשדה חתימה אחרי SimpleSign webhook */
export const SIMPLESIGN_SIGNED_PREFIX = "simplesign:signed:";

export function buildSimpleSignSignedMarker(
  submissionToken: string,
  signedAt: string
): string {
  return `${SIMPLESIGN_SIGNED_PREFIX}${signedAt}|${submissionToken}`;
}

export function isSimpleSignSignedValue(value: string | undefined): boolean {
  return String(value ?? "")
    .trim()
    .startsWith(SIMPLESIGN_SIGNED_PREFIX);
}

/** מפרק סימון SimpleSign לתאריך חתימה ו-token; null אם זה לא סימון */
export function parseSimpleSignSignedMarker(
  value: string | undefined
): { signedAt: string; submissionToken: string } | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed.startsWith(SIMPLESIGN_SIGNED_PREFIX)) return null;
  const body = trimmed.slice(SIMPLESIGN_SIGNED_PREFIX.length);
  const sep = body.lastIndexOf("|");
  if (sep < 0) return { signedAt: body, submissionToken: "" };
  return {
    signedAt: body.slice(0, sep),
    submissionToken: body.slice(sep + 1),
  };
}

function formatSignedDate(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const d = new Date(time);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** טקסט קריא להצגה במקום הסימון הגולמי — בטופס, בתצוגה ובהדפסה */
export function formatSimpleSignSignedLabel(value: string | undefined): string {
  const parsed = parseSimpleSignSignedMarker(value);
  if (!parsed) return "";
  const date = formatSignedDate(parsed.signedAt);
  return date ? `נחתם דיגיטלית (SimpleSign) · ${date}` : "נחתם דיגיטלית (SimpleSign)";
}

export function hasFilledSignatureValue(value: string | undefined): boolean {
  return Boolean(String(value ?? "").trim());
}

export const SIMPLESIGN_API_BASE = "https://simplesign.co.il/api/v1";
