export const BUG_MESSAGE_MAX_LENGTH = 4000;

/** עד כמה צילומי מסך אפשר לצרף לדיווח */
export const BUG_SCREENSHOT_MAX_COUNT = 3;
/** גודל מקסימלי לקובץ צילום מסך (בייטים) */
export const BUG_SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const BUG_SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export const BUG_SCREENSHOT_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type BugScreenshotContentType =
  (typeof BUG_SCREENSHOT_CONTENT_TYPES)[number];

export type BugScreenshotPayload = {
  filename: string;
  contentType: BugScreenshotContentType;
  /** base64 ללא קידומת data: */
  content: string;
};

export const BUG_URGENCY_OPTIONS = [
  { value: "low", label: "נמוכה" },
  { value: "medium", label: "בינונית" },
  { value: "high", label: "גבוהה" },
  { value: "critical", label: "קריטית" },
] as const;

export type BugUrgency = (typeof BUG_URGENCY_OPTIONS)[number]["value"];

const URGENCY_SET = new Set<string>(BUG_URGENCY_OPTIONS.map((o) => o.value));

export function isValidBugUrgency(value: string): value is BugUrgency {
  return URGENCY_SET.has(value);
}

export function bugUrgencyLabel(value: string): string {
  return BUG_URGENCY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function isBugScreenshotContentType(
  value: string
): value is BugScreenshotContentType {
  return (BUG_SCREENSHOT_CONTENT_TYPES as readonly string[]).includes(value);
}
