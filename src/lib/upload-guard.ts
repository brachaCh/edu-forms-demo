/** הגבלת העלאת קבצים — סוג וגודל (צ'קליסט #16) */

import {
  ALLOWED_UPLOAD_MIME,
  dataUrlDeclaredMime,
  isDangerousRenderMime,
  isDataUrl,
  isEmptyOrOctetStreamMime,
  isXmlLikeMime,
  normalizeMimeType,
  rewriteDataUrlMimeHeader,
} from "@/lib/data-url";
import { isStudentDocumentStorageRef } from "@/lib/student-document-storage-ref";
import { assertUploadMagic, sameUploadFamily } from "@/lib/upload-magic";
import { FORM_SCHEMAS } from "@/lib/form-schemas";
import { formSnapshotFileName } from "@/lib/form-snapshot-filename";
import { isFormSnapshotHtml } from "@/lib/form-snapshot-html";

export { isFormSnapshotHtml } from "@/lib/form-snapshot-html";
export { ALLOWED_UPLOAD_MIME };

/**
 * Shared stored-file cap (TZ-139).
 *
 * Small files still POST as JSON `{ data_url }` through `/api/tenant/data`.
 * Vercel Functions cap that request body at 4.5MB, so a raw file becomes
 * ~4/3 as a data URL and anything above ~3.3MB cannot travel that path
 * (`fileExceedsDataUrlBodyLimit` / `MAX_SAFE_UPLOAD_BODY_CHARS`).
 * Larger files (up to 25MB) upload directly to Supabase Storage via a
 * signed URL — do not POST them through the serverless function.
 */
export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
/** data URL ארוך בכ־33% מ-base64; 1.4x משאיר מרווח לקידומת MIME */
export const MAX_UPLOAD_DATA_URL_CHARS = Math.ceil(MAX_UPLOAD_BYTES * 1.4);

/** Vercel Functions request-body hard limit. */
export const VERCEL_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);

/** JSON envelope room so a data URL does not push the POST over 4.5MB. */
const JSON_ENVELOPE_BUDGET_CHARS = 64 * 1024;

/** Safe data-URL length for a tenant-data JSON body on Vercel. */
export const MAX_SAFE_UPLOAD_BODY_CHARS = Math.min(
  MAX_UPLOAD_DATA_URL_CHARS,
  VERCEL_BODY_LIMIT_BYTES - JSON_ENVELOPE_BUDGET_CHARS
);

/**
 * Raw file bytes that still fit `MAX_SAFE_UPLOAD_BODY_CHARS` as a data URL.
 * Files larger than this (and ≤ `MAX_UPLOAD_BYTES`) must use signed Storage
 * upload instead of the tenant-data POST.
 */
export const MAX_EFFECTIVE_UPLOAD_BYTES = Math.floor(
  (MAX_SAFE_UPLOAD_BODY_CHARS - 256) * (3 / 4)
);

export function formatUploadLimitLabel(
  bytes: number = MAX_UPLOAD_BYTES
): string {
  const mb = bytes / (1024 * 1024);
  const roundedTenth = Math.round(mb * 10) / 10;
  if (Number.isInteger(roundedTenth)) return `${roundedTenth}MB`;
  return `${roundedTenth.toFixed(1)}MB`;
}

/** Estimated `data:...;base64,` length for a raw file of `byteSize`. */
export function estimateDataUrlCharLength(byteSize: number): number {
  return Math.ceil(byteSize * (4 / 3)) + 256;
}

/** True when a data-URL POST of this file would exceed Vercel's 4.5MB body. */
export function fileExceedsDataUrlBodyLimit(file: { size: number }): boolean {
  if (!Number.isFinite(file.size) || file.size <= 0) return false;
  return estimateDataUrlCharLength(file.size) > MAX_SAFE_UPLOAD_BODY_CHARS;
}

/**
 * Client-side gate before any upload: advertised 25MB stored-file cap.
 * Files between ~3.3MB and 25MB are allowed — they go to Storage.
 */
export function fileExceedsUploadLimits(file: { size: number }): boolean {
  if (!Number.isFinite(file.size) || file.size <= 0) return false;
  return file.size > MAX_UPLOAD_BYTES;
}

/** File is within the 25MB cap but too large for a Vercel data-URL POST. */
export function needsDirectStorageUpload(file: { size: number }): boolean {
  return !fileExceedsUploadLimits(file) && fileExceedsDataUrlBodyLimit(file);
}

/** Fixed extension → MIME. Never includes html / svg / xml. */
export const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
};

const FORBIDDEN_UPLOAD_EXT = new Set([
  ".html",
  ".htm",
  ".shtml",
  ".xhtml",
  ".xml",
  ".svg",
  ".svgz",
  ".mht",
  ".mhtml",
  ".js",
  ".mjs",
  ".xsl",
  ".xslt",
]);

const ARCHIVE_SNAPSHOT_MIME = "text/html";
const ARCHIVE_SNAPSHOT_EXT = ".html";

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i).toLowerCase();
}

export function mappedMimeFromFileName(name: string): string | null {
  const ext = extensionOf(name);
  if (FORBIDDEN_UPLOAD_EXT.has(ext)) return null;
  const mapped = EXTENSION_TO_MIME[ext];
  if (!mapped) return null;
  if (
    isDangerousRenderMime(mapped) ||
    isXmlLikeMime(mapped) ||
    mapped === "text/html" ||
    mapped === "image/svg+xml"
  ) {
    return null;
  }
  return mapped;
}

function knownSnapshotFileNames(): Set<string> {
  return new Set(FORM_SCHEMAS.map((schema) => formSnapshotFileName(schema.title)));
}

export function isGeneratedFormSnapshotFileName(name: string): boolean {
  return knownSnapshotFileNames().has(name);
}

/** פענוח data URL לטקסט (UTF-8) — לבדיקת עותק ארכיון בשרת */
export function decodeUploadDataUrlToText(dataUrl: string): string | null {
  if (!isDataUrl(dataUrl)) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  try {
    if (/;base64/i.test(header)) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function assertSizeAndPayload(input: {
  size?: number | null;
  dataUrl?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const size = Number(input.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "EMPTY_FILE" };
  }

  const dataUrl = String(input.dataUrl ?? "");
  if (fileExceedsUploadLimits({ size })) {
    return { ok: false, error: "FILE_TOO_LARGE" };
  }
  if (!dataUrl) return { ok: true };
  if (isStudentDocumentStorageRef(dataUrl)) return { ok: true };
  if (!isDataUrl(dataUrl)) {
    return { ok: false, error: "INVALID_FILE_PAYLOAD" };
  }
  // A data URL still has to fit the Vercel tenant-data POST.
  if (dataUrl.length > MAX_SAFE_UPLOAD_BODY_CHARS) {
    return { ok: false, error: "FILE_TOO_LARGE" };
  }
  return { ok: true };
}

export function resolveUploadStorage(input: {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  dataUrl?: string | null;
}):
  | { ok: true; mimeType: string; dataUrl: string | null }
  | { ok: false; error: string } {
  const sized = assertSizeAndPayload(input);
  if (!sized.ok) return sized;

  const mime = normalizeMimeType(input.mimeType);
  const ext = extensionOf(String(input.name ?? ""));
  const mapped = mappedMimeFromFileName(String(input.name ?? ""));

  if (
    mime === ARCHIVE_SNAPSHOT_MIME ||
    isDangerousRenderMime(mime) ||
    isXmlLikeMime(mime) ||
    FORBIDDEN_UPLOAD_EXT.has(ext) ||
    !mapped
  ) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }

  const dataUrl = String(input.dataUrl ?? "").trim();
  if (isStudentDocumentStorageRef(dataUrl)) {
    const declaredVague = isEmptyOrOctetStreamMime(mime);
    if (!declaredVague && mime !== mapped && !sameUploadFamily(mime, mapped)) {
      return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
    }
    return { ok: true, mimeType: mapped, dataUrl };
  }

  const payloadMime = dataUrl ? dataUrlDeclaredMime(dataUrl) : null;
  if (
    payloadMime &&
    (isDangerousRenderMime(payloadMime) || isXmlLikeMime(payloadMime))
  ) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }

  const declaredVague = isEmptyOrOctetStreamMime(mime);
  const payloadVague = !dataUrl || isEmptyOrOctetStreamMime(payloadMime);
  if (!declaredVague && mime !== mapped && !sameUploadFamily(mime, mapped)) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }
  if (
    dataUrl &&
    !payloadVague &&
    payloadMime &&
    payloadMime !== mapped &&
    !sameUploadFamily(payloadMime, mapped)
  ) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }

  let storedMime = mapped;
  if (dataUrl) {
    const magic = assertUploadMagic(dataUrl, mapped);
    if (!magic.ok) return magic;
    storedMime = magic.mimeType;
  }

  return {
    ok: true,
    mimeType: storedMime,
    dataUrl: dataUrl ? rewriteDataUrlMimeHeader(dataUrl, storedMime) : null,
  };
}

export function assertAllowedUpload(input: {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  dataUrl?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const resolved = resolveUploadStorage(input);
  return resolved.ok ? { ok: true } : resolved;
}

/**
 * נתיב ארכיון פנימי בלבד (formSnapshotToFile → insertStudentFormArchiveSnapshot).
 * לא לשימוש בהעלאת משתמש רגילה — אין דגל ש-insertStudentDocument מכבד.
 */
export function assertAllowedArchiveSnapshotUpload(input: {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  dataUrl?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const sized = assertSizeAndPayload(input);
  if (!sized.ok) return sized;

  const mime = normalizeMimeType(input.mimeType);
  const name = String(input.name ?? "");
  const ext = extensionOf(name);

  if (mime !== ARCHIVE_SNAPSHOT_MIME || ext !== ARCHIVE_SNAPSHOT_EXT) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }
  if (!isGeneratedFormSnapshotFileName(name)) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }

  const dataUrl = String(input.dataUrl ?? "").trim();
  if (!dataUrl) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }
  const html = decodeUploadDataUrlToText(dataUrl);
  if (!html || !isFormSnapshotHtml(html)) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }

  return { ok: true };
}

function isFileTooLargeCode(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed === "FILE_TOO_LARGE") return true;
  if (trimmed === "413") return true;
  if (/\b413\b/.test(trimmed)) return true;
  if (/payload too large/i.test(trimmed)) return true;
  return false;
}

/** הודעת שגיאה להעלאה — לא מציגים «גדול מדי» על כל כשל. */
export function messageForUploadError(
  error: unknown,
  tooLargeMessage: string
): string {
  const code = error instanceof Error ? error.message : String(error ?? "");
  if (isFileTooLargeCode(code)) return tooLargeMessage;
  if (code === "FILE_TYPE_NOT_ALLOWED") {
    return "סוג הקובץ אינו מותר (PDF, Word, Excel או תמונה)";
  }
  if (code === "EMPTY_FILE") return "לא נבחר קובץ";
  if (code === "INVALID_FILE_PAYLOAD") return "הקובץ אינו תקין";
  return "העלאת הקובץ נכשלה. נסו שוב.";
}
