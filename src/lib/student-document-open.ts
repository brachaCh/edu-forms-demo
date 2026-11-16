/** פתיחה / הורדה של מסמך תלמיד (כולל data URL) */

import {
  blobMimeForDataUrl,
  dataUrlDeclaredMime,
  isAllowedClientDocumentHref,
  isAllowedRasterPreviewMime,
  isAllowedStorageHttpsUrl,
  isDangerousRenderMime,
  isDataUrl,
  isXmlLikeMime,
  normalizeMimeType,
} from "@/lib/data-url";
import { isStudentDocumentStorageRef } from "@/lib/student-document-storage-ref";
import type { StudentDocument } from "@/lib/supabase/types";
import { ensureStudentDocumentData } from "@/lib/data-cache";
import { isStudentDocumentDataError } from "@/lib/supabase-db";
import { sanitizeDownloadFileName } from "@/lib/download-filename";
import { downloadBlob, downloadViaBlobUrl } from "@/lib/blob-download";
import {
  isTachiFormArchiveDocument,
  tachiFormIdFromArchiveFileName,
} from "@/lib/tachi-archive-download";
import { prepareFormSnapshotHtmlForWordExport } from "@/lib/form-export-logos";

export const DOCUMENT_TOO_LARGE_OPEN_MESSAGE =
  "הקובץ גדול מדי לפתיחה בדפדפן";
export const DOCUMENT_MISSING_OPEN_MESSAGE =
  "לא ניתן לפתוח את המסמך — חסר תוכן הקובץ";
export const DOCUMENT_MISSING_DOWNLOAD_MESSAGE =
  "לא ניתן להוריד את המסמך — חסר תוכן הקובץ";
export const DOCUMENT_FETCH_FAILED_MESSAGE =
  "לא ניתן להוריד את הקובץ מהאחסון (קובץ חסר או שפג תוקף הקישור) — נסו שוב";
export const DOCUMENT_BLOB_DOWNLOAD_FAILED_MESSAGE =
  "לא ניתן להוריד את המסמך — ההורדה נכשלה בדפדפן";

export function studentDocumentLoadFailureMessage(
  error: unknown,
  action: "open" | "download"
): string {
  if (
    isStudentDocumentDataError(error) &&
    error.code === "DOCUMENT_TOO_LARGE"
  ) {
    return DOCUMENT_TOO_LARGE_OPEN_MESSAGE;
  }
  return action === "download"
    ? DOCUMENT_MISSING_DOWNLOAD_MESSAGE
    : DOCUMENT_MISSING_OPEN_MESSAGE;
}

export const HTML_PREVIEW_IFRAME_ID = "student-document-html-preview";
/** sandbox="" — בלי allow-scripts ובלי allow-same-origin */
export const HTML_PREVIEW_SANDBOX = "";

export function isHtmlStudentDocument(doc: {
  name: string;
  mime_type?: string | null;
}): boolean {
  const mime = normalizeMimeType(doc.mime_type);
  const name = doc.name.toLowerCase();
  return (
    mime === "text/html" || name.endsWith(".html") || name.endsWith(".htm")
  );
}

/** HTML / SVG / XML-like — לפי payload אמיתי או סוג מסוכן מוצהר, לא לפי שם .pdf */
export function isSandboxedPreviewDocument(doc: {
  name: string;
  mime_type?: string | null;
  data_url?: string | null;
}): boolean {
  if (isHtmlStudentDocument(doc)) return true;
  const mime = normalizeMimeType(doc.mime_type);
  const name = doc.name.toLowerCase();
  if (mime === "image/svg+xml" || name.endsWith(".svg")) return true;
  if (isDangerousRenderMime(mime) || isXmlLikeMime(mime)) return true;
  const payload = dataUrlDeclaredMime(doc.data_url);
  return isDangerousRenderMime(payload) || isXmlLikeMime(payload);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function decodeDocumentDataUrlToText(dataUrl: string): string {
  if (!dataUrl) {
    throw new Error("MISSING_DOCUMENT_DATA");
  }
  if (!isDataUrl(dataUrl)) {
    throw new Error("INVALID_DOCUMENT_DATA");
  }
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new Error("INVALID_DOCUMENT_DATA");
  }
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(header)) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
  return decodeURIComponent(payload);
}

/** מעטפת מהימנה בלבד — התוכן הלא-מהימן נכנס ל-srcdoc בנפרד */
export function buildSandboxedHtmlPreviewShell(title: string): string {
  const safeTitle = escapeHtml(title || "מסמך");
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #d6dbe3; }
    iframe { border: 0; width: 100%; height: 100%; background: #fff; }
  </style>
</head>
<body>
  <iframe id="${HTML_PREVIEW_IFRAME_ID}" sandbox></iframe>
</body>
</html>`;
}

type PreviewDocument = {
  open?: () => void;
  close?: () => void;
  write: (html: string) => void;
  getElementById: (id: string) => { setAttribute: (name: string, value: string) => void; srcdoc?: string } | null;
};

export function attachSandboxedHtmlPreview(
  targetDocument: PreviewDocument,
  html: string,
  title: string
): void {
  targetDocument.open?.();
  targetDocument.write(buildSandboxedHtmlPreviewShell(title));
  targetDocument.close?.();
  const iframe = targetDocument.getElementById(HTML_PREVIEW_IFRAME_ID);
  if (!iframe) {
    throw new Error("HTML_PREVIEW_IFRAME_MISSING");
  }
  iframe.setAttribute("sandbox", HTML_PREVIEW_SANDBOX);
  iframe.srcdoc = html;
}

function dataUrlToObjectUrl(dataUrl: string): string {
  if (!dataUrl) {
    throw new Error("MISSING_DOCUMENT_DATA");
  }
  if (!isDataUrl(dataUrl)) {
    throw new Error("INVALID_DOCUMENT_DATA");
  }
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  if (!base64) {
    throw new Error("INVALID_DOCUMENT_DATA");
  }
  const type = blobMimeForDataUrl(dataUrl);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type }));
}

export class StudentDocumentDownloadError extends Error {
  readonly code: "DOCUMENT_FETCH_FAILED" | "BLOB_CREATE_FAILED";

  constructor(code: "DOCUMENT_FETCH_FAILED" | "BLOB_CREATE_FAILED") {
    super(code);
    this.code = code;
  }
}

async function signedUrlToObjectUrl(
  signedUrl: string,
  mimeType?: string | null
): Promise<string> {
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new StudentDocumentDownloadError("DOCUMENT_FETCH_FAILED");
  }
  const blob = await response.blob();
  const type = mimeType || blob.type || "application/octet-stream";
  return URL.createObjectURL(new Blob([blob], { type }));
}

/** PDF/תמונה רק לפי payload אמיתי — לא לפי שם .pdf ולא לפי mime מוצהר כשאין סוג ב-data URL */
export function canPreviewDocument(doc: StudentDocument): boolean {
  if (isSandboxedPreviewDocument(doc)) return true;
  const href = String(doc.data_url ?? "");
  if (isStudentDocumentStorageRef(href) || isAllowedStorageHttpsUrl(href)) {
    const mime = normalizeMimeType(doc.mime_type);
    return mime === "application/pdf" || isAllowedRasterPreviewMime(mime);
  }
  const payload = dataUrlDeclaredMime(doc.data_url);
  if (doc.data_url) {
    return payload === "application/pdf" || isAllowedRasterPreviewMime(payload);
  }
  const mime = normalizeMimeType(doc.mime_type);
  return mime === "application/pdf" || isAllowedRasterPreviewMime(mime);
}

function triggerAnchor(
  url: string,
  opts: { download?: string; newTab?: boolean }
): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener noreferrer";
  if (opts.newTab) a.target = "_blank";
  if (opts.download) {
    a.download = sanitizeDownloadFileName(opts.download);
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function showInPageSandboxedHtmlPreview(html: string, title: string): void {
  const existing = document.getElementById("student-document-html-overlay");
  existing?.remove();

  const overlay = document.createElement("div");
  overlay.id = "student-document-html-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("dir", "rtl");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,0.55);display:flex;flex-direction:column;padding:16px;";

  const bar = document.createElement("div");
  bar.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;color:#fff;font-family:sans-serif;";
  const heading = document.createElement("strong");
  heading.textContent = title || "מסמך";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "סגור";
  close.style.cssText =
    "border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit;";
  close.addEventListener("click", () => overlay.remove());
  bar.append(heading, close);

  const iframe = document.createElement("iframe");
  iframe.id = HTML_PREVIEW_IFRAME_ID;
  iframe.setAttribute("sandbox", HTML_PREVIEW_SANDBOX);
  iframe.srcdoc = html;
  iframe.style.cssText =
    "flex:1;width:100%;border:0;border-radius:8px;background:#fff;";
  iframe.title = title || "מסמך";

  overlay.append(bar, iframe);
  document.body.appendChild(overlay);
}

function openHtmlInSandboxedPreview(
  html: string,
  title: string,
  preOpened: Window | null
): void {
  const win =
    preOpened && !preOpened.closed ? preOpened : window.open("", "_blank");
  if (!win) {
    showInPageSandboxedHtmlPreview(html, title);
    return;
  }
  attachSandboxedHtmlPreview(win.document, html, title);
}

/** רשימות המסמכים נטענות בלי תוכן; משלימים אותו רק כשבאמת פותחים/מורידים */
async function withDocumentData(
  doc: StudentDocument
): Promise<StudentDocument | null> {
  if (doc.data_url && !isStudentDocumentStorageRef(doc.data_url)) return doc;
  try {
    return await ensureStudentDocumentData(doc);
  } catch (error) {
    if (
      isStudentDocumentDataError(error) &&
      error.code === "DOCUMENT_TOO_LARGE"
    ) {
      throw error;
    }
    return null;
  }
}

/** פתיחת מסמך לצפייה (PDF/תמונה / HTML ב-iframe מבודד) או הורדה אם לא ניתן לצפות */
export async function openStudentDocument(doc: StudentDocument): Promise<void> {
  // כשצריך להביא את התוכן מהשרת — פותחים את הטאב מיד (בתוך הלחיצה),
  // אחרת הדפדפן עלול לחסום אותו כ-popup אחרי ה-await.
  const preview = canPreviewDocument(doc);
  const sandboxedDoc = isSandboxedPreviewDocument(doc);
  const needsAsyncLoad =
    !doc.data_url || isStudentDocumentStorageRef(doc.data_url);
  const preOpened = preview && needsAsyncLoad ? window.open("", "_blank") : null;
  if (preOpened) {
    try {
      preOpened.document.title = doc.name || "מסמך";
      preOpened.document.body.innerHTML =
        '<p dir="rtl" style="font-family:sans-serif;padding:24px">טוען את המסמך…</p>';
    } catch {
      // ignore
    }
  }

  let full: StudentDocument | null = null;
  try {
    full = await withDocumentData(doc);
  } catch (error) {
    preOpened?.close();
    window.alert(studentDocumentLoadFailureMessage(error, "open"));
    return;
  }
  if (!full?.data_url) {
    preOpened?.close();
    window.alert(DOCUMENT_MISSING_OPEN_MESSAGE);
    return;
  }
  try {
    if (sandboxedDoc || isSandboxedPreviewDocument(full)) {
      const html = decodeDocumentDataUrlToText(full.data_url);
      openHtmlInSandboxedPreview(html, full.name || "מסמך", preOpened);
      return;
    }
    if (canPreviewDocument(full)) {
      let url: string;
      if (isAllowedStorageHttpsUrl(full.data_url)) {
        url = await signedUrlToObjectUrl(full.data_url, full.mime_type);
      } else {
        url = dataUrlToObjectUrl(full.data_url);
      }
      if (preOpened && !preOpened.closed) {
        preOpened.location.href = url;
      } else {
        triggerAnchor(url, { newTab: true });
      }
      return;
    }
    preOpened?.close();
    await downloadStudentDocument(full);
  } catch {
    preOpened?.close();
    try {
      await downloadStudentDocument(full);
    } catch {
      window.alert("פתיחת המסמך נכשלה");
    }
  }
}

/** הורדת המסמך לקובץ */
export async function downloadStudentDocument(
  doc: StudentDocument
): Promise<void> {
  let full: StudentDocument | null = null;
  try {
    full = await withDocumentData(doc);
  } catch (error) {
    window.alert(studentDocumentLoadFailureMessage(error, "download"));
    return;
  }
  if (!full?.data_url) {
    window.alert(DOCUMENT_MISSING_DOWNLOAD_MESSAGE);
    return;
  }
  const fileName = full.name || "document";
  try {
    if (isSandboxedPreviewDocument(full)) {
      try {
        const text = decodeDocumentDataUrlToText(full.data_url);
        if (isTachiFormArchiveDocument(full)) {
          const formId =
            tachiFormIdFromArchiveFileName(fileName) ?? "tachi";
          const exportHtml = prepareFormSnapshotHtmlForWordExport(
            text,
            {},
            { formId }
          );
          downloadBlob(
            new Blob(["\ufeff", exportHtml], {
              type: "application/msword;charset=utf-8",
            }),
            fileName.replace(/\.html?$/i, ".doc")
          );
        } else {
          const url = URL.createObjectURL(
            new Blob([text], { type: "text/plain;charset=utf-8" })
          );
          downloadViaBlobUrl(url, fileName);
        }
      } catch {
        window.alert(DOCUMENT_BLOB_DOWNLOAD_FAILED_MESSAGE);
      }
      return;
    }
    let url: string;
    if (isAllowedStorageHttpsUrl(full.data_url)) {
      url = await signedUrlToObjectUrl(full.data_url, full.mime_type);
    } else {
      url = dataUrlToObjectUrl(full.data_url);
    }
    downloadViaBlobUrl(url, fileName);
  } catch (error) {
    if (error instanceof StudentDocumentDownloadError) {
      window.alert(
        error.code === "DOCUMENT_FETCH_FAILED"
          ? DOCUMENT_FETCH_FAILED_MESSAGE
          : DOCUMENT_BLOB_DOWNLOAD_FAILED_MESSAGE
      );
      return;
    }
    window.alert(DOCUMENT_BLOB_DOWNLOAD_FAILED_MESSAGE);
  }
}
