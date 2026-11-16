/** שנה עברית — בחירה בכרטיס וחלוקת ארכיון (נשמר כמספר עברי, מוצג כתשפ״ו) */

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"] as const;
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"] as const;
const HUNDREDS = [
  "",
  "ק",
  "ר",
  "ש",
  "ת",
  "תק",
  "תר",
  "תש",
  "תת",
  "תתק",
] as const;

/**
 * שנת לימודים נוכחית (למשל 5787 = תשפ״ז).
 * מאוגוסט משתמשים בשנה העברית של תשרי הקרוב — לפני ראש השנה בלוח.
 */
export function currentCalendarYear(date: Date = new Date()): number {
  // אוגוסט–דצמבר: כבר בשנת הלימודים הבאה (תשרי)
  if (date.getMonth() >= 7) {
    const afterTishrei = new Date(date.getFullYear(), 9, 1);
    const schoolYear = hebrewYearFromIntl(afterTishrei);
    if (schoolYear != null) return schoolYear;
    return date.getFullYear() + 3761;
  }

  const fromIntl = hebrewYearFromIntl(date);
  if (fromIntl != null) return fromIntl;
  return date.getFullYear() + 3760;
}

/** טווח שנים לבחירה (מ-10 שנים אחורה עד שנה קדימה) */
export function calendarYearOptions(
  aroundYear = currentCalendarYear()
): number[] {
  const years: number[] = [];
  for (let y = aroundYear + 1; y >= aroundYear - 10; y -= 1) {
    years.push(y);
  }
  return years;
}

/**
 * מציג שנה עברית באותיות (5786 → תשפ״ו).
 * אלפי השנים מושמטים כמקובל בכתיבה עברית מודרנית.
 */
export function formatHebrewYear(year: number): string {
  const normalized = normalizeYearNumber(year);
  if (normalized == null) return String(year);

  let n = normalized % 1000;
  if (n <= 0) return String(normalized);

  const hundreds = Math.floor(n / 100);
  n %= 100;

  let rest: string;
  if (n === 15) rest = "טו";
  else if (n === 16) rest = "טז";
  else {
    rest = `${TENS[Math.floor(n / 10)]}${ONES[n % 10]}`;
  }

  const body = `${HUNDREDS[hundreds]}${rest}`;
  if (body.length <= 1) return `${body}'`;
  return `${body.slice(0, -1)}"${body.slice(-1)}`;
}

/**
 * מקבל שנה עברית (5700–6000) או שנה לועזית ישנה (1990–2100) ומחזיר שנה עברית.
 */
export function parseCalendarYear(
  value: string | number | null | undefined
): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return normalizeYearNumber(n);
}

export function yearFromDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return currentCalendarYear(new Date(ms));
}

export function resolveDocumentCalendarYear(input: {
  calendar_year?: number | null;
  uploaded_at?: string | null;
  archived_at?: string | null;
  fallbackYear?: number | null;
}): number {
  return (
    parseCalendarYear(input.calendar_year) ??
    yearFromDate(input.archived_at) ??
    yearFromDate(input.uploaded_at) ??
    parseCalendarYear(input.fallbackYear) ??
    currentCalendarYear()
  );
}

function normalizeYearNumber(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const rounded = Math.trunc(n);
  if (rounded >= 5700 && rounded <= 6000) return rounded;
  // נתונים ישנים שנשמרו כשנה לועזית
  if (rounded >= 1990 && rounded <= 2100) {
    return rounded + 3760;
  }
  return null;
}

function hebrewYearFromIntl(date: Date): number | null {
  if (typeof Intl === "undefined") return null;
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-hebrew", {
      year: "numeric",
    }).formatToParts(date);
    const raw = parts.find((p) => p.type === "year")?.value;
    if (!raw) return null;
    const n = Number.parseInt(raw.replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n < 5700 || n > 6000) return null;
    return n;
  } catch {
    return null;
  }
}
