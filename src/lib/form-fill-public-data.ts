import { isSignaturePadField } from "@/lib/form-fields";

export const FILL_FIELD_KEY_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_KEYS = 250;
const MAX_TEXT_CHARS = 20_000;
const MAX_SIGNATURE_CHARS = 1_000_000;

export function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

/**
 * משטחי חתימה — לא נכתבים מקישור מילוי או ממסך מורה.
 * רק קישור החתימה שנשלח למייל מעדכן אותם.
 */
export function omitThirdPartySignatureFields(
  data: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSignaturePadField(key)) continue;
    out[key] = value;
  }
  return out;
}

/** ממזג שמירה תוך שימור חתימות צד־שלישי שכבר נשמרו בשרת */
export function mergeFillDataPreservingThirdPartySignatures(
  existing: Record<string, string>,
  incoming: Record<string, string>
): Record<string, string> {
  return {
    ...existing,
    ...omitThirdPartySignatureFields(incoming),
  };
}

export function sanitizeFillData(
  raw: unknown
): { ok: true; data: Record<string, string> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "נתוני הטופס אינם תקינים" };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_KEYS) {
    return { ok: false, error: "הטופס מכיל יותר מדי שדות" };
  }
  const data: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!FILL_FIELD_KEY_RE.test(key)) {
      return { ok: false, error: "מפתח שדה אינו תקין" };
    }
    if (typeof value !== "string") {
      return { ok: false, error: "ערך שדה אינו תקין" };
    }
    // משטחי חתימה — נזרקים כאן; לא נשמרים מקישור מילוי / מסך מורה
    if (isSignaturePadField(key)) {
      continue;
    }
    if (value.startsWith("data:image/")) {
      if (!DATA_URL_RE.test(value) || value.length > MAX_SIGNATURE_CHARS) {
        return { ok: false, error: "חתימה אינה תקינה" };
      }
      data[key] = value;
      continue;
    }
    if (value.length > MAX_TEXT_CHARS) {
      return { ok: false, error: "שדה ארוך מדי" };
    }
    data[key] = value;
  }
  return { ok: true, data };
}
