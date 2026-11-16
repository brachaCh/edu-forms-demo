/** MIME / data-URL parsing shared by upload and open. */

export function normalizeMimeType(mimeType?: string | null): string {
  return String(mimeType ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
}

export function isDataUrl(value: string | null | undefined): boolean {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .startsWith("data:");
}

export function isEmptyOrOctetStreamMime(
  mime: string | null | undefined
): boolean {
  const type = normalizeMimeType(mime);
  return !type || type === "application/octet-stream";
}

/** MIME type declared in a data: URL header (before ;params). Empty/missing → null. */
export function dataUrlDeclaredMime(
  dataUrl: string | null | undefined
): string | null {
  const raw = String(dataUrl ?? "").trim();
  if (!raw.toLowerCase().startsWith("data:")) return null;
  const comma = raw.indexOf(",");
  if (comma < 0) return null;
  const header = raw.slice(5, comma);
  const mime = header.split(";")[0]?.trim().toLowerCase();
  return mime || null;
}

export const ALLOWED_UPLOAD_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/rtf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
]);

/** Same-origin blob: types — allowlist minus HTML/SVG */
export const ALLOWED_BLOB_MIME = new Set(
  [...ALLOWED_UPLOAD_MIME].filter(
    (mime) => mime !== "text/html" && mime !== "image/svg+xml"
  )
);

const RASTER_PREVIEW_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function isAllowedUploadMime(mime: string | null | undefined): boolean {
  const type = normalizeMimeType(mime);
  return Boolean(type && ALLOWED_UPLOAD_MIME.has(type));
}

export function isAllowedBlobMime(mime: string | null | undefined): boolean {
  const type = normalizeMimeType(mime);
  return Boolean(type && ALLOWED_BLOB_MIME.has(type));
}

export function isAllowedRasterPreviewMime(
  mime: string | null | undefined
): boolean {
  const type = normalizeMimeType(mime);
  return Boolean(type && RASTER_PREVIEW_MIME.has(type));
}

/** xml, *+xml, xsl, xslt — never a same-origin rendered blob page */
export function isXmlLikeMime(mime: string | null | undefined): boolean {
  const type = normalizeMimeType(mime);
  if (!type) return false;
  if (type.endsWith("+xml")) return true;
  if (
    type === "text/xml" ||
    type === "application/xml" ||
    type === "text/xsl" ||
    type === "application/xsl" ||
    type === "text/xslt" ||
    type === "application/xslt"
  ) {
    return true;
  }
  const subtype = type.split("/")[1] ?? "";
  return subtype === "xml" || subtype === "xsl" || subtype === "xslt";
}

export function isDangerousRenderMime(mime: string | null | undefined): boolean {
  const type = normalizeMimeType(mime);
  if (!type) return false;
  if (isXmlLikeMime(type)) return true;
  if (type === "text/html") return true;
  if (type.includes("javascript") || type.includes("ecmascript")) return true;
  return false;
}

/** Blob type for a data URL — never fall back to a declared mime_type. */
export function blobMimeForDataUrl(dataUrl: string): string {
  const payload = dataUrlDeclaredMime(dataUrl);
  if (payload && isAllowedBlobMime(payload)) return payload;
  return "application/octet-stream";
}

/** Rewrite a data: header to `data:<mime>;base64,...` without changing payload bytes. */
export function rewriteDataUrlMimeHeader(
  dataUrl: string,
  mime: string
): string {
  const raw = String(dataUrl ?? "").trim();
  if (!isDataUrl(raw)) return raw;
  const comma = raw.indexOf(",");
  if (comma < 0) return raw;
  const header = raw.slice(0, comma);
  const payload = raw.slice(comma + 1);
  if (/;base64/i.test(header)) {
    return `data:${mime};base64,${payload}`;
  }
  try {
    const text = decodeURIComponent(payload);
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return `data:${mime};base64,${payload}`;
  }
}

export function isAllowedStorageHttpsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const configured = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!configured) return false;
  let origin: URL;
  try {
    origin = new URL(configured);
  } catch {
    return false;
  }
  if (origin.protocol !== "https:") return false;
  if (parsed.origin !== origin.origin) return false;
  return parsed.pathname.startsWith("/storage/");
}

/** Client open/download: data: (any case) or this project's storage https origin. */
export function isAllowedClientDocumentHref(url: string): boolean {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  if (isDataUrl(raw)) return true;
  return isAllowedStorageHttpsUrl(raw);
}
