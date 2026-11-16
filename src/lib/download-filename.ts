/** מסיר מתוך שם קובץ תווים אסורים ב-Windows/macOS — שומר עברית */

const ILLEGAL_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

export function sanitizeDownloadFileName(
  raw: string | null | undefined,
  fallback = "document"
): string {
  const trimmed = String(raw ?? "").trim() || fallback;
  const cleaned = trimmed.replace(ILLEGAL_FILE_NAME, "-").replace(/^\.+/, "");
  return cleaned || fallback;
}

/** @deprecated use sanitizeDownloadFileName */
export const anchorDownloadFileName = sanitizeDownloadFileName;