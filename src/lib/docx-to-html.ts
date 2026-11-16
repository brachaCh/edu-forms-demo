/**
 * Convert an uploaded .docx to print-safe HTML.
 *
 * Print runs in the browser. The Node `mammoth` entry + JSZip is known to fail
 * when bundled by Next (empty output or "uncompressed data size mismatch"),
 * which is why the folder print fell back to the "לא ניתן היה להציג" note.
 * The browser build accepts `{ arrayBuffer }` and includes its own unzip.
 *
 * Mammoth does not sanitize; callers must treat the return value as already
 * passed through {@link sanitizePrintHtml}.
 */

import { MAX_UPLOAD_BYTES } from "@/lib/upload-guard";
import { sanitizePrintHtml } from "@/lib/sanitize-print-html";

/** After mammoth: refuse huge HTML so document.write cannot freeze the print tab. */
export const MAX_PRINT_HTML_CHARS = 5 * 1024 * 1024;

/**
 * Sanitize mammoth HTML and drop the document when the payload is too large.
 */
export function sanitizeMammothHtml(raw: string): string {
  if (!raw || raw.length > MAX_PRINT_HTML_CHARS) return "";
  const sanitized = sanitizePrintHtml(raw);
  return sanitized.length > MAX_PRINT_HTML_CHARS ? "" : sanitized;
}

type MammothConvert = (input: {
  arrayBuffer: ArrayBuffer;
}) => Promise<{ value?: string }>;

function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** ZIP local-file / empty / spanned signatures — .docx is a zip. */
export function looksLikeDocxZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function resolveConvertToHtml(mod: unknown): MammothConvert | null {
  if (!mod || typeof mod !== "object") return null;
  const record = mod as { convertToHtml?: unknown; default?: unknown };
  if (typeof record.convertToHtml === "function") {
    return record.convertToHtml as MammothConvert;
  }
  if (record.default && record.default !== mod) {
    return resolveConvertToHtml(record.default);
  }
  return null;
}

/**
 * Node `mammoth` (`lib/unzip.js`) only accepts `{ path | buffer | file }`.
 * The print window is a browser and was calling `{ arrayBuffer }`, which that
 * entry rejects with "Could not find file in options" — then print swallows
 * the error and shows the fallback note. The browser build accepts arrayBuffer.
 */
async function loadMammoth(): Promise<MammothConvert> {
  const browser = await import("mammoth/mammoth.browser");
  const convertToHtml = resolveConvertToHtml(browser);
  if (!convertToHtml) {
    throw new Error("MAMMOTH_UNAVAILABLE");
  }
  return convertToHtml;
}

export async function convertDocxBytesToHtml(
  bytes: Uint8Array
): Promise<string> {
  if (!bytes.length || bytes.byteLength > MAX_UPLOAD_BYTES) return "";
  if (!looksLikeDocxZip(bytes)) return "";

  try {
    const convertToHtml = await loadMammoth();
    const result = await convertToHtml({
      arrayBuffer: toStandaloneArrayBuffer(bytes),
    });
    return sanitizeMammothHtml(result.value ?? "");
  } catch {
    return "";
  }
}
