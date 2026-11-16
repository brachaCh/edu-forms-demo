import type { SiteTexts } from "./site-text";
import { scopedTextPath } from "./text-scope";

export function hasTextPath(texts: SiteTexts, path: string): boolean {
  const parts = path.split(".");
  let cursor: unknown = texts;
  for (const part of parts) {
    if (cursor && typeof cursor === "object" && part in (cursor as object)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return false;
    }
  }
  return typeof cursor === "string";
}

export function getTextByPath(texts: SiteTexts, path: string): string {
  const parts = path.split(".");
  let cursor: unknown = texts;
  for (const part of parts) {
    if (cursor && typeof cursor === "object" && part in (cursor as object)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return "";
    }
  }
  return typeof cursor === "string" ? cursor : "";
}

/** קודם עותק לפי מגזר (אם קיים), אחרת הטקסט הגלובלי */
export function getScopedTextByPath(
  texts: SiteTexts,
  path: string,
  scope: string | null
): string {
  if (scope) {
    const scoped = scopedTextPath(scope, path);
    if (hasTextPath(texts, scoped)) {
      return getTextByPath(texts, scoped);
    }
  }
  return getTextByPath(texts, path);
}
