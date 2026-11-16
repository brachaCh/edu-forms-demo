import { z } from "zod";

const MAX_DEPTH = 8;
const MAX_LEAVES = 5_000;
const MAX_VALUE_LENGTH = 5_000;

type TextTree = Record<string, unknown>;

/**
 * כיתובי האתר הם עץ מקונן של מחרוזות (`SiteTexts`).
 * במקום לשקף את כל המבנה ב-Zod, מאמתים את הצורה: מחרוזות בעלים, בלי חריגה בגודל.
 */
function isValidTextTree(
  value: unknown,
  depth: number,
  counter: { leaves: number }
): boolean {
  if (depth > MAX_DEPTH) return false;

  if (typeof value === "string") {
    counter.leaves += 1;
    return counter.leaves <= MAX_LEAVES && value.length <= MAX_VALUE_LENGTH;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isValidTextTree(item, depth + 1, counter));
  }

  if (value && typeof value === "object") {
    return Object.values(value as TextTree).every((item) =>
      isValidTextTree(item, depth + 1, counter)
    );
  }

  // null / number / boolean — לא צפויים בעץ הכיתובים
  return false;
}

export const siteTextTreeSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => isValidTextTree(value, 0, { leaves: 0 }), {
    message: "INVALID_SITE_TEXTS",
  });

export const siteTextWriteSchema = z.object({
  texts: siteTextTreeSchema,
});
