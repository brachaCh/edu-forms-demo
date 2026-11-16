/** Magic-byte family check against the allowlisted upload types. */

const MAGIC_PREFIX_BYTES = 1024;
/** 1024 bytes → ~1366 base64 chars; 1400 leaves room for padding. */
export const MAGIC_PREFIX_B64_CHARS = 1400;

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const WORD_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
]);
const EXCEL_MIMES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const IMAGE_KINDS = new Set(["jpeg", "png", "gif", "webp", "heic", "heif"]);
const WORD_KINDS = new Set(["ole", "zip", "rtf"]);
const EXCEL_KINDS = new Set(["ole", "zip"]);
const DANGEROUS_KINDS = new Set(["html", "xml", "script", "executable"]);

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
]);
const HEIF_BRANDS = new Set(["heif", "mif1", "msf1"]);

export type UploadFamily = "pdf" | "image" | "word" | "excel" | "text";
export type SniffedKind =
  | "pdf"
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "heic"
  | "heif"
  | "ole"
  | "zip"
  | "rtf"
  | "html"
  | "xml"
  | "script"
  | "executable"
  | "unknown";

function normalizeMime(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function uploadFamilyOf(mime: string): UploadFamily | null {
  const type = normalizeMime(mime);
  if (type === "application/pdf") return "pdf";
  if (IMAGE_MIMES.has(type)) return "image";
  if (WORD_MIMES.has(type)) return "word";
  if (EXCEL_MIMES.has(type)) return "excel";
  if (type === "text/plain") return "text";
  return null;
}

export function sameUploadFamily(a: string, b: string): boolean {
  const left = uploadFamilyOf(a);
  const right = uploadFamilyOf(b);
  return left !== null && left === right;
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, i) => bytes[i] === value);
}

function skipPreamble(bytes: Uint8Array): number {
  let i = 0;
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    i = 3;
  }
  while (i < bytes.length) {
    const c = bytes[i];
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function asciiSlice(bytes: Uint8Array, start: number, length: number): string {
  const end = Math.min(bytes.length, start + length);
  let out = "";
  for (let i = start; i < end; i += 1) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
}

function pdfMagicAt(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const limit = Math.min(bytes.length - 4, MAGIC_PREFIX_BYTES);
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

function isOleMagic(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

function isZipMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  if (bytes.length < 4) return true;
  const third = bytes[2];
  const fourth = bytes[3];
  return (
    (third === 0x03 && fourth === 0x04) ||
    (third === 0x05 && fourth === 0x06) ||
    (third === 0x07 && fourth === 0x08)
  );
}

function isWebpMagic(bytes: Uint8Array): boolean {
  return (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function isRtfMagic(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66]);
}

function ftypBrand(bytes: Uint8Array): string {
  if (
    bytes.length < 12 ||
    bytes[4] !== 0x66 ||
    bytes[5] !== 0x74 ||
    bytes[6] !== 0x79 ||
    bytes[7] !== 0x70
  ) {
    return "";
  }
  return asciiSlice(bytes, 8, 4).toLowerCase();
}

function looksLikeHtml(bytes: Uint8Array): boolean {
  const i = skipPreamble(bytes);
  if (bytes[i] !== 0x3c) return false;
  const head = asciiSlice(bytes, i, 16).toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    head.startsWith("<body") ||
    head.startsWith("<script") ||
    head.startsWith("<svg")
  );
}

function looksLikeXml(bytes: Uint8Array): boolean {
  const i = skipPreamble(bytes);
  return asciiSlice(bytes, i, 5).toLowerCase() === "<?xml";
}

export function sniffMagic(bytes: Uint8Array): SniffedKind {
  if (startsWithBytes(bytes, [0x4d, 0x5a])) return "executable";
  if (startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46])) return "executable";
  if (bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21) return "script";
  if (looksLikeHtml(bytes)) return "html";
  if (looksLikeXml(bytes)) return "xml";
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (
    startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "gif";
  }
  if (isWebpMagic(bytes)) return "webp";
  const brand = ftypBrand(bytes);
  if (HEIC_BRANDS.has(brand)) return "heic";
  if (HEIF_BRANDS.has(brand)) return "heif";
  if (isOleMagic(bytes)) return "ole";
  if (isZipMagic(bytes)) return "zip";
  if (isRtfMagic(bytes)) return "rtf";
  if (pdfMagicAt(bytes)) return "pdf";
  return "unknown";
}

export function kindAllowedForFamily(
  kind: SniffedKind,
  family: UploadFamily | null
): boolean {
  if (DANGEROUS_KINDS.has(kind)) return false;
  if (!family) return false;
  if (family === "pdf") return kind === "pdf";
  if (family === "image") return IMAGE_KINDS.has(kind);
  if (family === "word") return WORD_KINDS.has(kind);
  if (family === "excel") return EXCEL_KINDS.has(kind);
  if (family === "text") return kind === "unknown" || kind === "rtf";
  return false;
}

export function mimeForSniffedKind(
  kind: SniffedKind,
  familyMime: string
): string {
  const family = uploadFamilyOf(familyMime);
  switch (kind) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "pdf":
      return "application/pdf";
    case "rtf":
      return "application/rtf";
    case "ole":
      return family === "excel"
        ? "application/vnd.ms-excel"
        : "application/msword";
    case "zip":
      return family === "excel"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return familyMime;
  }
}

export function decodeDataUrlPrefix(
  dataUrl: string,
  maxBytes: number = MAGIC_PREFIX_BYTES
): Uint8Array | null {
  const raw = dataUrl.trim();
  if (!raw.toLowerCase().startsWith("data:")) return null;
  const comma = raw.indexOf(",");
  if (comma < 0) return null;
  const meta = raw.slice(0, comma);
  const payload = raw.slice(comma + 1);
  const b64Chars = Math.min(
    MAGIC_PREFIX_B64_CHARS,
    Math.ceil(maxBytes * (4 / 3)) + 4
  );
  try {
    if (/;base64/i.test(meta)) {
      const compact = payload.replace(/\s/g, "").slice(0, b64Chars);
      if (!compact) return null;
      const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);
      const binary = atob(padded);
      const length = Math.min(binary.length, maxBytes);
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    }
    const decoded = decodeURIComponent(payload.slice(0, maxBytes * 3));
    const length = Math.min(decoded.length, maxBytes);
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      out[i] = decoded.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function magicMatchesMime(bytes: Uint8Array, mime: string): boolean {
  return kindAllowedForFamily(sniffMagic(bytes), uploadFamilyOf(mime));
}

export function assertUploadMagicFromBytes(
  bytes: Uint8Array | null | undefined,
  mime: string
): { ok: true; mimeType: string } | { ok: false; error: string } {
  if (!bytes || bytes.length === 0) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }
  const kind = sniffMagic(bytes);
  if (!kindAllowedForFamily(kind, uploadFamilyOf(mime))) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }
  return { ok: true, mimeType: mimeForSniffedKind(kind, mime) };
}

export function assertUploadMagic(
  dataUrl: string,
  mime: string
): { ok: true; mimeType: string } | { ok: false; error: string } {
  return assertUploadMagicFromBytes(decodeDataUrlPrefix(dataUrl), mime);
}
