/** Invisible / bidi marks that sneak into emails from Excel, Word, and RTL paste. */
const INVISIBLE_OR_BIDI_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const WHITESPACE_RE = /\s+/g;

/** Strip invisible/bidi chars and whitespace, then trim and lowercase. */
export function normalizeEmail(value: string): string {
  return value.replace(INVISIBLE_OR_BIDI_RE, "").replace(WHITESPACE_RE, "").trim().toLowerCase();
}
