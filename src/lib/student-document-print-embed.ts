/** הטמעת קבצי העלאה (PDF / Word / תמונה) בהדפסת תיק תלמיד */

import { convertDocxBytesToHtml } from "@/lib/docx-to-html";
import {
  decodeDataUrlPayload,
  peekPrintBytes,
} from "@/lib/print-payload";

export type PrintEmbedKind = "html" | "image" | "pdf" | "docx" | "other";

/** רזולוציה מספיקה ל-A4 בהדפסה — נמוך מ-1.75 כדי להאיץ */
export const PDF_PRINT_SCALE = 1.15;
/** איכות JPEG סבירה להדפסה בלי לנפח את ה-HTML */
export const PDF_PRINT_JPEG_QUALITY = 0.68;
/** כמה עמודי PDF לעבד במקביל בתוך אותו קובץ */
export const PDF_PAGE_CONCURRENCY = 4;
/** כמה מסמכים לעבד במקביל בהדפסת תיק */
export const PRINT_DOC_CONCURRENCY = 4;

function mimeSubtype(mimeType?: string | null): string {
  return (mimeType || "").toLowerCase().split(";")[0]?.trim() ?? "";
}

function fileNameLower(name: string): string {
  return name.trim().toLowerCase();
}

function mimeLooksLikePdf(mime: string): boolean {
  return (
    mime === "application/pdf" ||
    mime === "application/x-pdf" ||
    mime === "application/acrobat" ||
    mime === "application/vnd.adobe.pdf"
  );
}

/** `%PDF` at the start, or after a short BOM/whitespace prefix some scanners add */
export function bytesStartWithPdfMagic(
  bytes: Uint8Array | null | undefined
): boolean {
  if (!bytes || bytes.length < 4) return false;
  const limit = Math.min(bytes.length - 4, 8);
  for (let i = 0; i <= limit; i += 1) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46
    ) {
      return true;
    }
  }
  return false;
}

/** Enough base64 for `%PDF` plus the short BOM/whitespace window we scan. */
export const PDF_MAGIC_BASE64_PREFIX_CHARS = 16;

function decodeDataUrlPrefixForPdfMagic(
  dataUrl: string
): Uint8Array | null {
  if (!dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) {
      const compact = payload.replace(/\s/g, "").slice(0, PDF_MAGIC_BASE64_PREFIX_CHARS);
      if (!compact) return null;
      const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);
      const binary = atob(padded);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    }
    const decoded = decodeURIComponent(payload.slice(0, 24));
    const out = new Uint8Array(Math.min(decoded.length, 16));
    for (let i = 0; i < out.length; i += 1) {
      out[i] = decoded.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function looksLikePdfDataUrl(dataUrl?: string | null): boolean {
  if (!dataUrl) return false;
  const trimmed = dataUrl.trim();
  if (!trimmed) return false;
  if (/^data:application\/(?:x-)?pdf\b/i.test(trimmed)) return true;
  return bytesStartWithPdfMagic(decodeDataUrlPrefixForPdfMagic(trimmed));
}

function bytesLookLikeHtml(bytes: Uint8Array | null): boolean {
  if (!bytes || bytes.length < 1) return false;
  let i = 0;
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    i = 3;
  }
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 ||
      bytes[i] === 0x09 ||
      bytes[i] === 0x0a ||
      bytes[i] === 0x0d)
  ) {
    i += 1;
  }
  return i < bytes.length && bytes[i] === 0x3c; // '<'
}

/** Archived / synthetic form snapshots — data:text/html or markup payload. */
export function looksLikeHtmlDataUrl(dataUrl?: string | null): boolean {
  if (!dataUrl) return false;
  const trimmed = dataUrl.trim();
  if (!trimmed) return false;
  if (/^data:text\/html\b/i.test(trimmed)) return true;
  if (looksLikePdfDataUrl(trimmed)) return false;
  return bytesLookLikeHtml(decodeDataUrlPrefixForPdfMagic(trimmed));
}

export function detectPrintEmbedKind(
  name: string,
  mimeType?: string | null,
  dataUrl?: string | null
): PrintEmbedKind {
  const mime = mimeSubtype(mimeType);
  const lower = fileNameLower(name);

  // HTML mime/extension first — TZ-87 checked PDF before HTML, so a filled
  // form labeled text/html whose filename happened to end in .pdf (or an
  // HTML snapshot with a missing extension) was sent to the PDF rasterizer.
  if (mime.startsWith("text/html") || lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "html";
  }
  if (mimeLooksLikePdf(mime) || /\.pdf$/i.test(lower)) {
    return "pdf";
  }
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(lower)) {
    return "image";
  }
  if (
    lower.endsWith(".docx") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (looksLikeHtmlDataUrl(dataUrl)) {
    return "html";
  }
  if (looksLikePdfDataUrl(dataUrl)) {
    return "pdf";
  }
  return "other";
}

/**
 * פענוח data URL ל-bytes בלי fetch — מהיר יותר לקבצים גדולים.
 * אם זה לא data: או שהפענוח נכשל — נופלים ל-fetch.
 */
export function decodeDataUrlToUint8ArraySync(
  dataUrl: string
): Uint8Array | null {
  return decodeDataUrlPayload(dataUrl)?.bytes ?? null;
}

export async function dataUrlToUint8Array(
  dataUrl: string
): Promise<Uint8Array> {
  const direct = decodeDataUrlToUint8ArraySync(dataUrl);
  if (direct) return direct;
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * מריץ משימות על מערך עם מקביליות מוגבלת, ושומר על סדר התוצאות.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const total = items.length;
  if (total === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, total));
  const results = new Array<R>(total);
  let nextIndex = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;
      results[index] = await mapper(items[index]!, index);
      done += 1;
      onProgress?.(done, total);
    }
  }

  await Promise.all(
    Array.from({ length: limit }, () => worker())
  );
  return results;
}

type PdfJsModule = typeof import("pdfjs-dist");
type PdfJsWorkerModule = typeof import("pdfjs-dist/build/pdf.worker.min.mjs");

/** Same-origin static worker (correct MIME is set in next.config). */
export const PDF_WORKER_SRC = "/pdf.worker.min.mjs";

let pdfjsModulePromise: Promise<PdfJsModule> | null = null;

export function registerPdfJsMainThreadWorker(
  workerMod: Pick<PdfJsWorkerModule, "WorkerMessageHandler"> | null | undefined
): void {
  const handler = workerMod?.WorkerMessageHandler;
  if (!handler) return;
  const g = globalThis as typeof globalThis & {
    pdfjsWorker?: { WorkerMessageHandler?: unknown };
  };
  g.pdfjsWorker = {
    ...(g.pdfjsWorker ?? {}),
    WorkerMessageHandler: handler,
  };
}

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const [pdfjs, workerMod] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs"),
      ]);
      // pdf.js 4 skips `new Worker()` when WorkerMessageHandler is already
      // on globalThis — that avoids CSP/MIME failures on /pdf.worker.min.mjs
      // (nosniff + generic .mjs type, missing worker-src blob:).
      registerPdfJsMainThreadWorker(workerMod);
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
      return pdfjs;
    })();
  }
  return pdfjsModulePromise;
}

function copyPdfBytes(data: Uint8Array): Uint8Array {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

export function isPdfWorkerLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /worker/i.test(message);
}

async function openPdfDocument(
  pdfjs: PdfJsModule,
  data: Uint8Array
): Promise<Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>> {
  const base = {
    isEvalSupported: false,
    useSystemFonts: true,
  };
  try {
    return await pdfjs.getDocument({
      ...base,
      data: copyPdfBytes(data),
    }).promise;
  } catch (error) {
    // Worker URL / MIME / CSP can fail even after we register the bundled
    // handler. Retry once so a late pdfjsWorker assignment is picked up.
    // Corrupt or password-protected PDFs are not retried.
    if (!isPdfWorkerLoadError(error)) throw error;
    return await pdfjs.getDocument({
      ...base,
      data: copyPdfBytes(data),
    }).promise;
  }
}

export async function renderPdfBytesToImages(
  data: Uint8Array
): Promise<string[]> {
  if (typeof document === "undefined") return [];
  const pdfjs = await loadPdfJs();
  // pdf.js מעביר בעלות על ה־buffer — חייבים עותק
  const pdf = await openPdfDocument(pdfjs, data);
  const maxPages = Math.min(pdf.numPages, 40);
  const pageNums = Array.from({ length: maxPages }, (_, i) => i + 1);

  return mapWithConcurrency(
    pageNums,
    PDF_PAGE_CONCURRENCY,
    async (pageNum) => {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: PDF_PRINT_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        // pdfjs v4+ — חלק מהסביבות דורשות גם את אלמנט ה־canvas
        canvas,
      } as Parameters<typeof page.render>[0]);
      await renderTask.promise;
      return canvas.toDataURL("image/jpeg", PDF_PRINT_JPEG_QUALITY);
    }
  ).then((images) => images.filter(Boolean));
}

export async function renderPdfDataUrlToImages(
  dataUrl: string,
  documentId?: string
): Promise<string[]> {
  if (typeof document === "undefined") return [];
  const remembered = documentId ? peekPrintBytes(documentId) : undefined;
  const data = remembered ?? (await dataUrlToUint8Array(dataUrl));
  return renderPdfBytesToImages(data);
}

export async function convertDocxDataUrlToHtml(
  dataUrl: string,
  documentId?: string
): Promise<string> {
  const remembered = documentId ? peekPrintBytes(documentId) : undefined;
  const bytes = remembered ?? (await dataUrlToUint8Array(dataUrl));
  return convertDocxBytesToHtml(bytes);
}
