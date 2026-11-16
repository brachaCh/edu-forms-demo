/**
 * מיסוך שם תלמיד לפני שליחה למודל חיצוני, ושחזור מקומי אחרי התשובה.
 *
 * דרישה: שום חלק משם התלמיד לא מגיע למודל. כשאין שם בר-שימוש
 * עדיין מריצים ניכוי טלפון/ת.ז./מייל/קישור — בלי לטעון ששמות מוסוו.
 *
 * כל טווח שזוהה בקלט מקבל [[NAME_n]] ומשוחזר למשטח המקורי — מה שהמורה
 * כתבה לא משתנה. [[PUPIL]] הוא הוראה למודל לאזכורים חדשים שהוא כותב,
 * ורק הם משוחזרים לשם הפרטי מהכרטיס.
 *
 * שם פרטי דו-מילי: firstName מפורש, או בת/בן + האסימון הבא כשאין firstName.
 * אסימון עם מקף («בת-שבע») נשאר יחידה. אין עמודת first_name ב־DB.
 */

import { scrubIdentifyingPatterns } from "@/lib/ai-privacy";
import { splitPersonName } from "@/lib/person-name";

/** אסימון ניטרלי שנשלח למודל במקום שם שכולל את השם הפרטי */
export const STUDENT_PLACEHOLDER = "[[PUPIL]]";

const MIN_FIRST_NAME_CHARS = 2;

/** ניקוד וטעמי מקרא — בלי מקף עברי (U+05BE) */
const NIQQUD_AND_CANTILLATION_RE = /[\u0591-\u05BD\u05BF-\u05C7]/g;

const HEBREW_LETTER = "\\u0590-\\u05FF";
const WORD_CHAR = `${HEBREW_LETTER}A-Za-z0-9`;
/** אותיות שימוש עבריות; עד שלוש משורשרות (ול־, וכש־, …) */
const PROCLITIC_CLASS = "ובכלמשה";

/** מקף ASCII, מקף עברי, מקף קצר/ארוך */
const HYPHEN_RE = /[-\u05BE\u2013\u2014]/;
/** פיצול חלקי שם: רווח, מקף ASCII, מקף עברי, מקף קצר/ארוך */
const NAME_PART_SPLIT_RE = /[\s\-\u05BE\u2013\u2014]+/;
/** גרש / apostrophe שמפריד שם מסיומת (Noa's, Cohen’s) */
const APOSTROPHE_SPLIT_RE = /['’׳]/;
const OPTIONAL_MATRES = new Set(["ו", "י"]);
const TWO_TOKEN_GIVEN_KEYS = new Set(["בת", "בן"]);

/**
 * גרשיים / גרש / ציטוט שמדלגים עליהם בשם ובטקסט.
 * " U+0022, ״ U+05F4, ʼ U+02BC, ʻ U+02BB, ‘ U+2018, ´ U+00B4,
 * ׳ U+05F3, ' U+0027, ’ U+2019, ` U+0060
 */
const SKIPPABLE_MARKS = new Set([
  "\u0022",
  "\u05F4",
  "\u02BC",
  "\u02BB",
  "\u2018",
  "\u00B4",
  "\u05F3",
  "\u0027",
  "\u2019",
  "\u0060",
]);

const FINAL_LETTER_CLASS: Record<string, string> = {
  כ: "כך",
  ך: "כך",
  מ: "מם",
  ם: "מם",
  נ: "נן",
  ן: "נן",
  פ: "פף",
  ף: "פף",
  צ: "צץ",
  ץ: "צץ",
};

export type StudentNamePartsForAi = {
  firstName: string;
  lastName: string;
};

export type StudentNameExplicitParts = {
  firstName?: string | null;
  lastName?: string | null;
};

/** מפת שחזור: NAME_1 → המשטח המקורי של הטווח */
export type NameRestoreMap = Record<string, string>;

export type NameMaskContext = {
  nextIndex: number;
  restoreMap: NameRestoreMap;
  /** אסימוני [[NAME_n]] / [NAME_n] שהמורה הקלידה במקור — לא הונפקו */
  teacherLiterals: Set<string>;
};

type NameRecord = {
  name: string;
};

type LatinNamePattern = {
  re: RegExp;
  minLen: number;
};

/**
 * תעתיק קבוע עברית→לטינית למיסוך Noa / Cohen / Katz וכו'.
 * אותיות ריקות (ע/ה/א) אופציונליות; בין אותיות מותרות תנועות לועזיות.
 */
const HEBREW_TO_LATIN: Record<string, readonly string[]> = {
  א: ["", "a", "o", "e"],
  ב: ["b", "v"],
  ג: ["g"],
  ד: ["d"],
  ה: ["a", "h", ""],
  ו: ["o", "u", "v", "w"],
  ז: ["z"],
  ח: ["ch", "h", "kh"],
  ט: ["t"],
  י: ["y", "i", "e"],
  כ: ["k", "ch", "kh", "c"],
  ך: ["k", "ch", "kh", "c"],
  ל: ["l"],
  מ: ["m"],
  ם: ["m"],
  נ: ["n"],
  ן: ["n"],
  ס: ["s"],
  ע: ["", "a"],
  פ: ["p", "f", "ph"],
  ף: ["p", "f", "ph"],
  צ: ["tz", "ts", "z"],
  ץ: ["tz", "ts", "z"],
  ק: ["k", "q"],
  ר: ["r"],
  ש: ["sh", "s"],
  ת: ["t", "th"],
};

const LATIN_TOKEN_RE =
  /[\p{Script=Latin}]+(?:['’׳\-\u2013\u2014][\p{Script=Latin}]+)*/gu;

const NAME_TOKEN_RE =
  /\[\[\s*NAME_(\d+)\s*\]\]|\[\s*NAME_(\d+)\s*\]/gi;

/**
 * צורות שהמודל עלול להחזיר: [[PUPIL]], [[ PUPIL ]], [PUPIL], PUPIL.
 * סדר החלופות — מהספציפי לכללי, כדי ש־[[PUPIL]] לא ייחתך ל־[PUPIL].
 */
const PLACEHOLDER_RE =
  /\[\[\s*PUPIL\s*\]\]|\[\s*PUPIL\s*\]|(?<![A-Za-z0-9])PUPIL(?![A-Za-z0-9])/gi;

const OFFICIAL_PUPIL_LITERAL_RE =
  /^(?:\[\[[\s]*PUPIL[\s]*\]\]|\[[\s]*PUPIL[\s]*\]|PUPIL)$/i;

/** עטיפה זמנית כדי שמשטח משוחזר שהוא עצמו [[PUPIL]] לא יוחלף שוב */
const KEEP_SURFACE_START = "\uE000";
const KEEP_SURFACE_END = "\uE001";

function foldLatin(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

/** הוראת אסימונים משותפת ל־refine-transcript ול־fill-form */
export function studentNameTokenPromptLines(): string[] {
  return [
    "בטקסט מופיעים אסימונים מהצורה [[NAME_1]], [[NAME_2]] וכו'. העתק כל אסימון כזה בדיוק כמו שהוא, במקומו — אל תשנה, אל תמזג, אל תשמיט ואל תמציא אסימונים.",
    `כשמוסיפים התייחסות חדשה לתלמיד/ה שאינה במקור — כתוב ${STUDENT_PLACEHOLDER}. אל תכתוב שום שם.`,
  ];
}

export function createNameMaskContext(
  source?: string | readonly string[]
): NameMaskContext {
  const teacherLiterals = new Set<string>();
  let maxIndex = 0;
  const blobs =
    source == null ? [] : typeof source === "string" ? [source] : source;
  for (const blob of blobs) {
    if (!blob) continue;
    NAME_TOKEN_RE.lastIndex = 0;
    for (const match of blob.matchAll(NAME_TOKEN_RE)) {
      teacherLiterals.add(match[0]);
      const n = Number(match[1] ?? match[2]);
      if (Number.isFinite(n) && n > maxIndex) maxIndex = n;
    }
  }
  return { nextIndex: maxIndex + 1, restoreMap: {}, teacherLiterals };
}

export function nameTokenPlaceholder(index: number): string {
  return `[[NAME_${index}]]`;
}

export function studentNamePartsForAi(
  raw?: string | null,
  explicit?: StudentNameExplicitParts
): StudentNamePartsForAi {
  const split = splitPersonName(raw ?? "");
  let firstName = sanitizeNamePart(explicit?.firstName || split.first_name);
  let lastName = sanitizeNamePart(explicit?.lastName || split.last_name);

  if (!explicit?.firstName && raw) {
    const inferred = inferBatBenFirstName(raw);
    if (inferred) {
      firstName = inferred.firstName;
      lastName = inferred.lastName;
    }
  }

  if (explicit?.firstName && !explicit.lastName && raw) {
    const remainder = remainderAfterFirstName(raw, firstName);
    if (remainder) lastName = remainder;
  }

  return {
    firstName: letterCount(firstName) >= MIN_FIRST_NAME_CHARS ? firstName : "",
    lastName,
  };
}

/**
 * בלי firstName מפורש: אסימון ראשון בת/בן + לפחות עוד אסימון
 * («בת שבע», «בן ציון») — שני הראשונים הם השם הפרטי.
 */
function inferBatBenFirstName(
  raw: string
): StudentNamePartsForAi | null {
  const tokens = sanitizeNamePart(raw).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const firstKey = matchKey(tokens[0] ?? "");
  if (!TWO_TOKEN_GIVEN_KEYS.has(firstKey)) return null;
  return {
    firstName: sanitizeNamePart(`${tokens[0]} ${tokens[1]}`),
    lastName: sanitizeNamePart(tokens.slice(2).join(" ")),
  };
}

/** שומר רווח/מקף/גרש של השם כפי שהגיעו — בלי להפוך «בת שבע» ל־«בת-שבע». */
function sanitizeNamePart(part: string): string {
  const trimmed = part
    .replace(/[\u05BE\u2013\u2014]/g, "-")
    .replace(NIQQUD_AND_CANTILLATION_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) return "";
  if (/^\d[\d\s-]*$/.test(trimmed)) return "";
  return trimmed;
}

function remainderAfterFirstName(raw: string, firstName: string): string {
  const rawNorm = matchKey(raw);
  const firstNorm = matchKey(firstName);
  if (!firstNorm || !rawNorm.startsWith(firstNorm)) {
    return sanitizeNamePart(splitPersonName(raw).last_name);
  }
  return sanitizeNamePart(raw.slice(firstNameLeadingLength(raw, firstNorm)));
}

function firstNameLeadingLength(raw: string, firstNorm: string): number {
  const { copy, origIndex } = buildMatchCopy(raw);
  if (!copy.toLowerCase().startsWith(firstNorm)) return 0;
  const endCopy = firstNorm.length;
  if (endCopy === 0) return 0;
  const last = origIndex[endCopy - 1];
  return last == null ? 0 : extendEndOverSkipped(raw, last + 1);
}

function letterCount(value: string): number {
  return (value.match(/[A-Za-z\u05D0-\u05EA]/g) ?? []).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function letterClass(ch: string): string {
  const group = FINAL_LETTER_CLASS[ch];
  return group ? `[${group}]` : escapeRegExp(ch);
}

function isNiqqud(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x0591 && code <= 0x05c7 && code !== 0x05be;
}

function isSkippableMark(ch: string): boolean {
  return SKIPPABLE_MARKS.has(ch);
}

function isHyphen(ch: string): boolean {
  return HYPHEN_RE.test(ch);
}

function isApostropheMark(ch: string): boolean {
  return APOSTROPHE_SPLIT_RE.test(ch);
}

function isLatinLetter(ch: string): boolean {
  return /\p{Script=Latin}/u.test(ch);
}

function isNameLetter(ch: string): boolean {
  return /[A-Za-z\u05D0-\u05EA]/.test(ch);
}

function nextSignificantChar(text: string, from: number): string {
  for (let j = from; j < text.length; j++) {
    const ch = text[j] ?? "";
    if (isNiqqud(ch) || isSkippableMark(ch)) continue;
    return ch;
  }
  return "";
}

function splitNameParts(value: string): string[] {
  return value.split(NAME_PART_SPLIT_RE).filter(Boolean);
}

/**
 * עותק מקביל לאיתור שמות בלבד: מקף→רווח, גרש/גרשיים/ניקוד מוסרים.
 * הטקסט שנשלח למודל נשאר המקור, מלבד טווחי השם.
 */
function buildMatchCopy(text: string): { copy: string; origIndex: number[] } {
  let copy = "";
  const origIndex: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (isNiqqud(ch) || isSkippableMark(ch)) {
      // גרש פנימי בשם (ג'ני) נשאר מדולג; גרש לפני סיומת לטינית
      // (נועה's) הופך לגבול כדי שהשם יתאים והסיומת תישאר.
      const prev = copy.length ? copy[copy.length - 1]! : "";
      const next = nextSignificantChar(text, i + 1);
      if (
        isApostropheMark(ch) &&
        isNameLetter(prev) &&
        isLatinLetter(next)
      ) {
        copy += " ";
        origIndex.push(i);
      }
      continue;
    }
    if (isHyphen(ch)) {
      copy += " ";
      origIndex.push(i);
      continue;
    }
    copy += ch;
    origIndex.push(i);
  }
  return { copy, origIndex };
}

function matchKey(value: string): string {
  return buildMatchCopy(value).copy.replace(/\s+/g, " ").trim().toLowerCase();
}

function extendEndOverSkipped(text: string, origEnd: number): number {
  let end = origEnd;
  while (end < text.length) {
    const ch = text[end] ?? "";
    if (isNiqqud(ch) || isSkippableMark(ch)) {
      // אל תבלע גרש של סיומת לטינית (Noa's / נועה's) — הסיומת נשארת אחרי האסימון.
      if (
        isApostropheMark(ch) &&
        isLatinLetter(nextSignificantChar(text, end + 1))
      ) {
        break;
      }
      end += 1;
      continue;
    }
    break;
  }
  return end;
}

function origSpan(
  origIndex: number[],
  copyStart: number,
  copyEnd: number,
  textLen: number
): [number, number] {
  if (copyStart >= origIndex.length) return [textLen, textLen];
  const origStart = origIndex[copyStart] ?? textLen;
  const lastCopy = copyEnd - 1;
  const origEnd =
    lastCopy >= 0 && lastCopy < origIndex.length
      ? (origIndex[lastCopy] ?? textLen - 1) + 1
      : textLen;
  return [origStart, origEnd];
}

function nameLetters(name: string): string[] {
  return [...name].filter((ch) => {
    if (ch === " " || isHyphen(ch) || isSkippableMark(ch) || isNiqqud(ch)) {
      return false;
    }
    return true;
  });
}

/**
 * ו/י שבשם הופכות לאופציונליות.
 * בין עיצורים — ו/י אופציונלי רק לשמות של ≥3 אותיות («בת» לא יתאים ל«בית»).
 * מיכל לא יתאים למיכאל (א אינה ו/י).
 */
function tokenToFlexiblePattern(token: string): string {
  const chars = nameLetters(token);
  if (chars.length === 0) return "";
  const allowMaterInsert = chars.length >= 3;
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? "";
    if (i > 0) {
      chunks.push(allowMaterInsert ? "(?:\\s?[וי]?\\s?)?" : "\\s?");
    }
    if (OPTIONAL_MATRES.has(ch)) {
      chunks.push("[וי]?");
    } else {
      chunks.push(letterClass(ch));
    }
  }
  return chunks.join("");
}

function hebrewLettersOf(name: string): string[] {
  return nameLetters(name).filter((ch) => Boolean(HEBREW_TO_LATIN[ch]));
}

function hebrewTokenToLatinPattern(token: string): LatinNamePattern | null {
  const letters = hebrewLettersOf(token);
  if (letters.length === 0) return null;
  const parts: string[] = [];
  for (const ch of letters) {
    const opts = HEBREW_TO_LATIN[ch] ?? [];
    const nonempty = [...new Set(opts.filter(Boolean))].sort(
      (a, b) => b.length - a.length
    );
    const canEmpty = opts.includes("");
    if (nonempty.length === 0) continue;
    const alt = nonempty.map(escapeRegExp).join("|");
    parts.push(canEmpty ? `(?:${alt})?` : `(?:${alt})`);
  }
  if (!parts.length) return null;
  return {
    re: new RegExp(`^${parts.join("[aeiou]{0,2}")}$`, "i"),
    minLen: Math.max(2, letters.length - 1),
  };
}

function latinPatternsForParts(parts: StudentNamePartsForAi): LatinNamePattern[] {
  const seen = new Set<string>();
  const out: LatinNamePattern[] = [];
  function add(name: string) {
    const tokens = matchKey(name).split(" ").filter(Boolean);
    for (const token of tokens) {
      const key = `t:${token}`;
      if (seen.has(key)) continue;
      const pattern = hebrewTokenToLatinPattern(token);
      if (!pattern) continue;
      seen.add(key);
      out.push(pattern);
    }
    if (tokens.length > 1) {
      const joined = tokens
        .map((token) => hebrewTokenToLatinPattern(token))
        .filter((p): p is LatinNamePattern => Boolean(p));
      if (joined.length === tokens.length) {
        const key = `j:${tokens.join("-")}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            re: new RegExp(
              `^${joined.map((p) => p.re.source.replace(/^\^|\$$/g, "")).join("[-\\s]+")}$`,
              "i"
            ),
            minLen: joined.reduce((n, p) => n + p.minLen, 0),
          });
        }
      }
    }
  }
  if (parts.firstName) add(parts.firstName);
  if (parts.lastName) add(parts.lastName);
  if (parts.firstName && parts.lastName) {
    add(`${parts.firstName} ${parts.lastName}`);
  }
  return out;
}

function latinTokenMatchesName(
  raw: string,
  patterns: LatinNamePattern[]
): boolean {
  const token = foldLatin(raw.replace(/['’׳]/g, ""));
  if (!token) return false;
  if (
    patterns.some(
      (p) =>
        p.re.test(token) &&
        token.replace(/[\s\-\u2013\u2014]/g, "").length >= p.minLen
    )
  ) {
    return true;
  }
  if (/[-\u2013\u2014]/.test(token)) {
    return token
      .split(/[-\u2013\u2014]/)
      .some((part) => latinTokenMatchesName(part, patterns));
  }
  return false;
}

/** טווחים למיסוך בתוך אסימון לטיני: שם בלי סיומת 's */
function latinPiecesToMask(
  raw: string,
  patterns: LatinNamePattern[]
): { offset: number; length: number }[] {
  if (!APOSTROPHE_SPLIT_RE.test(raw)) {
    return latinTokenMatchesName(raw, patterns)
      ? [{ offset: 0, length: raw.length }]
      : [];
  }

  const pieces: { offset: number; length: number }[] = [];
  let offset = 0;
  const parts = raw.split(APOSTROPHE_SPLIT_RE);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (part && latinTokenMatchesName(part, patterns)) {
      pieces.push({ offset, length: part.length });
    }
    offset += part.length;
    if (i < parts.length - 1) offset += 1;
  }
  if (pieces.length === 0 && latinTokenMatchesName(raw, patterns)) {
    return [{ offset: 0, length: raw.length }];
  }
  return pieces;
}

function nameToFlexiblePattern(name: string): string {
  const tokens = matchKey(name).split(" ").filter(Boolean);
  return tokens.map(tokenToFlexiblePattern).join("\\s+");
}

function nameOccurrenceRe(name: string): RegExp {
  const namePattern = nameToFlexiblePattern(name);
  if (!namePattern) return /(?!)/;
  // אותיות שימוש רק כשצמודות לשם. רווח אחרי מילת תפקוד נשמר.
  return new RegExp(
    `(?<![${WORD_CHAR}])(?:([${PROCLITIC_CLASS}]{1,3}))?(${namePattern})(?![${WORD_CHAR}])`,
    "gi"
  );
}

function shouldMaskNamePart(
  token: string,
  { isFirstName }: { isFirstName: boolean }
): boolean {
  const normalized = sanitizeNamePart(token);
  if (!normalized) return false;
  if (/^\d[\d\s-]*$/.test(normalized)) return false;
  const n = letterCount(normalized);
  if (isFirstName) return n >= MIN_FIRST_NAME_CHARS;
  return n >= 1;
}

/**
 * שם פרטי — יחידה אחת (גם «בת שבע»). משפחה/אמצעי — כל אסימון,
 * כולל חלקים מופרדים במקף / מקף עברי / מקף קצר/ארוך («לוי-כהן»).
 * מילים בודדות של שם פרטי דו-מילי ממוסכות גם כן כדי שלא ידלפו.
 */
function uniqueNameRecords(parts: StudentNamePartsForAi): NameRecord[] {
  const first = parts.firstName.trim();
  const lastBlob = parts.lastName.trim();
  const lastTokens = splitNameParts(lastBlob);
  const firstTokens = splitNameParts(first);

  const seen = new Set<string>();
  const out: NameRecord[] = [];

  function add(name: string) {
    const key = matchKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: name.trim() });
  }

  const firstUsable = shouldMaskNamePart(first, { isFirstName: true });
  if (firstUsable && lastTokens.length > 0) {
    add([first, ...lastTokens].join(" "));
  }
  if (lastTokens.length > 1) add(lastTokens.join(" "));
  for (const token of lastTokens) {
    if (shouldMaskNamePart(token, { isFirstName: false })) add(token);
  }
  if (firstUsable) add(first);
  if (firstUsable && firstTokens.length > 1) {
    for (const token of firstTokens) {
      if (shouldMaskNamePart(token, { isFirstName: false })) add(token);
    }
  }

  return out.sort(
    (a, b) => matchKey(b.name).length - matchKey(a.name).length
  );
}

function issueNameToken(
  maskCtx: NameMaskContext,
  surface: string
): string {
  const id = maskCtx.nextIndex;
  maskCtx.nextIndex += 1;
  const token = nameTokenPlaceholder(id);
  maskCtx.restoreMap[`NAME_${id}`] = surface;
  return token;
}

function occupySpan(occupied: boolean[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (occupied[i]) return false;
  }
  for (let i = start; i < end; i++) occupied[i] = true;
  return true;
}

/**
 * תופס אסימונים שהמורה הקלידה: [[NAME_n]] נשאר במקום (והמספור מדלג מעליו).
 * [[PUPIL]] במקור מוחלף ב־NAME שהונפק — כדי ש־[[PUPIL]] מהמודל עדיין
 * ישוחזר לשם הפרטי.
 */
function protectTeacherTokens(
  text: string,
  maskCtx: NameMaskContext,
  occupied: boolean[],
  replacements: { start: number; end: number; token: string }[]
): void {
  NAME_TOKEN_RE.lastIndex = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  for (const match of text.matchAll(NAME_TOKEN_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    maskCtx.teacherLiterals.add(raw);
    const n = Number(match[1] ?? match[2]);
    if (Number.isFinite(n) && n >= maskCtx.nextIndex) {
      maskCtx.nextIndex = n + 1;
    }
    occupySpan(occupied, start, end);
  }

  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    if (!occupySpan(occupied, start, end)) continue;
    replacements.push({
      start,
      end,
      token: issueNameToken(maskCtx, raw),
    });
  }
}

/** מחליף טווחי שם באסימון; שאר הטקסט (מקפים, תאריכים, טווחים) נשאר. */
export function maskStudentNamesForAi(
  text: string,
  parts: StudentNamePartsForAi,
  ctx?: NameMaskContext
): string {
  const names = uniqueNameRecords(parts);
  const maskCtx = ctx ?? createNameMaskContext(text);
  const occupied = new Array<boolean>(text.length).fill(false);
  const replacements: { start: number; end: number; token: string }[] = [];
  protectTeacherTokens(text, maskCtx, occupied, replacements);

  if (!names.length) {
    replacements.sort((a, b) => b.start - a.start);
    let out = text;
    for (const { start, end, token } of replacements) {
      out = `${out.slice(0, start)}${token}${out.slice(end)}`;
    }
    return out;
  }

  const { copy, origIndex } = buildMatchCopy(text);

  for (const record of names) {
    const re = nameOccurrenceRe(record.name);
    for (const match of copy.matchAll(re)) {
      const prefix = match[1] ?? "";
      const index = match.index ?? 0;
      const nameStartInCopy = index + prefix.length;
      const nameEndInCopy = index + match[0].length;
      const [origStart, rawEnd] = origSpan(
        origIndex,
        nameStartInCopy,
        nameEndInCopy,
        text.length
      );
      const origEnd = extendEndOverSkipped(text, rawEnd);
      if (origStart >= origEnd) continue;
      let blocked = false;
      for (let i = origStart; i < origEnd; i++) {
        if (occupied[i]) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      for (let i = origStart; i < origEnd; i++) occupied[i] = true;

      replacements.push({
        start: origStart,
        end: origEnd,
        token: issueNameToken(maskCtx, text.slice(origStart, origEnd)),
      });
    }
  }

  const latinPatterns = latinPatternsForParts(parts);
  if (latinPatterns.length) {
    for (const match of text.matchAll(LATIN_TOKEN_RE)) {
      const raw = match[0] ?? "";
      const origStart = match.index ?? 0;
      if (!raw) continue;
      for (const piece of latinPiecesToMask(raw, latinPatterns)) {
        const start = origStart + piece.offset;
        const end = start + piece.length;
        if (start >= end) continue;
        if (!occupySpan(occupied, start, end)) continue;
        replacements.push({
          start,
          end,
          token: issueNameToken(maskCtx, text.slice(start, end)),
        });
      }
    }
  }

  replacements.sort((a, b) => b.start - a.start);
  let out = text;
  for (const { start, end, token } of replacements) {
    out = `${out.slice(0, start)}${token}${out.slice(end)}`;
  }
  return out;
}

function wrapProtectedSurface(surface: string, parked: string[]): string {
  const i = parked.push(surface) - 1;
  return `${KEEP_SURFACE_START}${i}${KEEP_SURFACE_END}`;
}

function unwrapProtectedSurfaces(text: string, parked: string[]): string {
  return text.replace(
    new RegExp(`${KEEP_SURFACE_START}(\\d+)${KEEP_SURFACE_END}`, "g"),
    (_match, rawIndex: string) => parked[Number(rawIndex)] ?? ""
  );
}

/**
 * [[NAME_n]] שהמאסקר הנפיק בשיחה הזו → המשטח המקורי.
 * אסימון שהמורה הקלידה ולא הונפק — נשאר. אסימון שהמודל המציא — מוסר.
 * [[PUPIL]] חדש מהמודל → שם פרטי מהכרטיס.
 * לא משכתב «התלמיד/ה». כתלמיד/כתלמידה נשארים.
 */
export function restoreStudentFirstName(
  text: string,
  firstName: string,
  restoreMap?: NameRestoreMap,
  teacherLiterals?: Iterable<string>
): string {
  const keep = new Set(teacherLiterals ?? []);
  const parked: string[] = [];
  let out = text.replace(NAME_TOKEN_RE, (match, a?: string, b?: string) => {
    const n = a ?? b;
    if (!n) return keep.has(match) ? match : "";
    const key = `NAME_${n}`;
    if (restoreMap && Object.prototype.hasOwnProperty.call(restoreMap, key)) {
      const surface = restoreMap[key] ?? "";
      return OFFICIAL_PUPIL_LITERAL_RE.test(surface)
        ? wrapProtectedSurface(surface, parked)
        : surface;
    }
    if (keep.has(match)) return match;
    return "";
  });

  const name = sanitizeNamePart(firstName);
  if (letterCount(name) < MIN_FIRST_NAME_CHARS) {
    out = out.replace(PLACEHOLDER_RE, "");
  } else {
    out = out.replace(PLACEHOLDER_RE, name);
  }

  return unwrapProtectedSurfaces(out, parked);
}

export function prepareTranscriptForAi(
  text: string,
  studentName?: string | null,
  explicit?: StudentNameExplicitParts
): {
  textForModel: string;
  firstName: string;
  restoreMap: NameRestoreMap;
  teacherLiterals: string[];
} {
  const parts = studentNamePartsForAi(studentName, explicit);
  // Fail-safe: תמיד מנקים טלפון / ת.ז. / מייל, גם בלי שם בר-שימוש.
  const scrubbed = scrubIdentifyingPatterns(text);
  const ctx = createNameMaskContext(scrubbed);
  return {
    textForModel: maskStudentNamesForAi(scrubbed, parts, ctx),
    firstName: parts.firstName,
    restoreMap: ctx.restoreMap,
    teacherLiterals: [...ctx.teacherLiterals],
  };
}
