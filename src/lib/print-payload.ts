/**
 * Print payload helpers (TZ-101 / TZ-102).
 *
 * Uploaded files live as data URLs (and rarely as Supabase Storage https URLs).
 * Print used to ship the whole data URL over the wire and decode it with a
 * naive `atob` — large scanned PDFs hit Vercel’s ~4.5MB response cap or
 * aborted at the short “small file” timeout, then showed
 * «לא ניתן היה לטעון את הקובץ להדפסה».
 */

import { isAllowedStorageHttpsUrl } from "@/lib/data-url";

/** טעינת תוכן קובץ בודד להדפסה — לא חוסמים את שאר התיק */
export const PRINT_PAYLOAD_TIMEOUT_MS = 45_000;
/** Longer than GET /api/tenant/documents maxDuration (60s) and the fetch abort (75s). */
export const PRINT_LARGE_PAYLOAD_TIMEOUT_MS = 80_000;
export const PRINT_LARGE_FILE_BYTES = 1_500_000;
/** Large scans download two-at-a-time instead of one-by-one (TZ-101). */
export const PRINT_LARGE_DOC_CONCURRENCY = 2;
/** Binary print responses stay under Vercel’s ~4.5MB function cap. */
export const DOCUMENT_PRINT_BYTES_MAX = 4_200_000;

const printBytesById = new Map<string, Uint8Array>();

export function rememberPrintBytes(id: string, bytes: Uint8Array): void {
  if (!id || !bytes.length) return;
  printBytesById.set(id, bytes);
}

export function peekPrintBytes(id: string): Uint8Array | undefined {
  return printBytesById.get(id);
}

export function clearPrintBytes(): void {
  printBytesById.clear();
}

export function normalizeBase64Payload(payload: string): string {
  return payload.replace(/[\s\r\n]/g, "").replace(/-/g, "+").replace(/_/g, "/");
}

export function decodeBase64ToUint8Array(b64: string): Uint8Array | null {
  const compact = normalizeBase64Payload(b64);
  if (!compact) return null;
  try {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(compact, "base64");
      if (buf.byteLength === 0 && compact.replace(/=+$/, "").length > 0) {
        return null;
      }
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
  } catch {
    // fall through to atob
  }
  try {
    const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    const chunk = 0x8000;
    for (let offset = 0; offset < binary.length; offset += chunk) {
      const end = Math.min(offset + chunk, binary.length);
      for (let i = offset; i < end; i += 1) {
        out[i] = binary.charCodeAt(i);
      }
    }
    return out;
  } catch {
    return null;
  }
}

export function decodeDataUrlPayload(dataUrl: string): {
  mime: string;
  bytes: Uint8Array;
} | null {
  const trimmed = dataUrl.trim();
  if (!trimmed.toLowerCase().startsWith("data:")) return null;
  const comma = trimmed.indexOf(",");
  if (comma < 0) return null;
  const header = trimmed.slice(5, comma);
  const payload = trimmed.slice(comma + 1);
  const mime =
    header.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  try {
    if (/;base64/i.test(header)) {
      const bytes = decodeBase64ToUint8Array(payload);
      if (!bytes) return null;
      return { mime, bytes };
    }
    const decoded = decodeURIComponent(payload);
    return { mime, bytes: new TextEncoder().encode(decoded) };
  } catch {
    return null;
  }
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  const type = mime.trim() || "application/octet-stream";
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  if (typeof Buffer !== "undefined") {
    return `data:${type};base64,${Buffer.from(copy).toString("base64")}`;
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < copy.length; i += chunk) {
    binary += String.fromCharCode(...copy.subarray(i, i + chunk));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

/** data: payloads can rasterize locally; storage https URLs need the print GET. */
export function hasInlinePrintPayload(dataUrl?: string | null): boolean {
  return String(dataUrl ?? "")
    .trim()
    .toLowerCase()
    .startsWith("data:");
}

/** Re-encode each path segment so names like `מכתב (1).pdf` survive Storage URLs. */
export function repairStorageObjectUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").map((seg) => {
      if (!seg) return seg;
      try {
        return encodeURIComponent(decodeURIComponent(seg))
          .replace(/\(/g, "%28")
          .replace(/\)/g, "%29");
      } catch {
        return encodeURIComponent(seg).replace(/\(/g, "%28").replace(/\)/g, "%29");
      }
    });
    return `${parsed.origin}${parts.join("/")}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

export async function resolvePrintPayloadBytes(
  dataUrl: string
): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const direct = decodeDataUrlPayload(dataUrl);
  if (direct) return direct;
  const trimmed = dataUrl.trim();
  if (!isAllowedStorageHttpsUrl(trimmed)) return null;
  const candidates = [trimmed, repairStorageObjectUrl(trimmed)];
  const unique = [...new Set(candidates)];
  for (const href of unique) {
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) continue;
      const mime =
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        "application/octet-stream";
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) continue;
      return { mime, bytes };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function printPayloadTimeoutMs(
  size?: number | null,
  kind?: string | null
): number {
  const bytes = size ?? 0;
  if (bytes >= PRINT_LARGE_FILE_BYTES) return PRINT_LARGE_PAYLOAD_TIMEOUT_MS;
  if (
    bytes === 0 &&
    (kind === "pdf" || kind === "docx" || kind === "image")
  ) {
    return PRINT_LARGE_PAYLOAD_TIMEOUT_MS;
  }
  return PRINT_PAYLOAD_TIMEOUT_MS;
}

export function isLargePrintDocument(
  size?: number | null,
  kind?: string | null
): boolean {
  const bytes = size ?? 0;
  if (bytes >= PRINT_LARGE_FILE_BYTES) return true;
  return (
    bytes === 0 && (kind === "pdf" || kind === "docx" || kind === "image")
  );
}
