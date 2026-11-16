/**
 * הורדת עותק ממולא של טופס כקובץ Word ‏(.doc) — HTML עם BOM,
 * תואם ל-Word כמו ב-buildFormSnapshotHtml להדפסה.
 */

import { formSnapshotFileName } from "@/lib/form-snapshot-filename";
import { downloadBlob } from "@/lib/blob-download";

export const FORM_WORD_DOWNLOAD_FAILED =
  "יצירת קובץ Word נכשלה — נסו שוב";

export const FORM_WORD_DOWNLOAD_TOO_LARGE =
  "המסמך גדול מדי להורדה כ-Word — נסו הדפסה או הורידו חלקים נפרדים";

/** גבול סביר ל-blob בדפדפן (דומה ל-handoff הדפסה) */
export const FORM_WORD_DOWNLOAD_MAX_CHARS = 4_500_000;

export function formWordDownloadFileName(formTitle: string): string {
  return formSnapshotFileName(formTitle).replace(/\.html$/i, ".doc");
}

export function createFormWordBlob(html: string): Blob | null {
  const trimmed = html.trim();
  if (!trimmed) return null;
  if (trimmed.length > FORM_WORD_DOWNLOAD_MAX_CHARS) return null;
  return new Blob(["\ufeff", trimmed], {
    type: "application/msword;charset=utf-8",
  });
}

export function downloadFormWordBlob(blob: Blob, fileName: string): void {
  downloadBlob(blob, fileName);
}

export function downloadFormSnapshotAsWord(html: string, formTitle: string): {
  ok: boolean;
  error?: string;
} {
  const blob = createFormWordBlob(html);
  if (!blob) {
    const trimmed = html.trim();
    return {
      ok: false,
      error: trimmed
        ? FORM_WORD_DOWNLOAD_TOO_LARGE
        : FORM_WORD_DOWNLOAD_FAILED,
    };
  }
  try {
    downloadFormWordBlob(blob, formWordDownloadFileName(formTitle));
    return { ok: true };
  } catch (err) {
    console.error("[form-word-download]", err);
    return { ok: false, error: FORM_WORD_DOWNLOAD_FAILED };
  }
}