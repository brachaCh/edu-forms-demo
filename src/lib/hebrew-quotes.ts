/** גרשיים / מירכאות שמופיעים בשמות תיקיות עבריות (תח"י, תל"א) */
const QUOTE_CHARS = /[\u0022\u05F4\u201C\u201D\u00AB\u00BB]/g;

export function normalizeHebrewQuotes(value: string): string {
  return value.replace(QUOTE_CHARS, '"');
}

export function stripHebrewQuotes(value: string): string {
  return normalizeHebrewQuotes(value).replaceAll('"', "");
}

export function sameHebrewFolderName(a: string, b: string): boolean {
  const left = normalizeHebrewQuotes(a.trim());
  const right = normalizeHebrewQuotes(b.trim());
  if (left === right) return true;
  return stripHebrewQuotes(left) === stripHebrewQuotes(right);
}

/** בכתובת — גרשיים עבריים במקום ASCII, כדי שלא ייחסמו כ־%22 */
export function encodeFolderParam(name: string): string {
  // encodeURIComponent אמור לא לסכן, אבל בפועל Frameworks מסוימים
  // עדיין עלולים להתייחס ל-%2F כ-/ אחרי פענוח פנימי → זה יוצר מקטעים נוספים
  // ומוביל ל-404 עבור הראוט. לכן נחליף "/" ו-"\\" לתווים בטוחים לפני ה-encoding.
  const safeSlashes = normalizeHebrewQuotes(name.trim())
    .replaceAll('"', "\u05F4")
    .replaceAll("/", "\u2044") // division slash ∕
    .replaceAll("\\", "\u2216"); // set minus ∖
  return encodeURIComponent(safeSlashes);
}

export function decodeFolderParam(raw: string): string {
  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    // כבר מפוענח
  }
  return normalizeHebrewQuotes(decoded)
    .replaceAll("\u2044", "/")
    .replaceAll("\u2216", "\\");
}
