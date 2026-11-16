import type ExcelJS from "exceljs";
import { joinPersonName } from "@/lib/person-name";
import {
  checkClassCreateAllowed,
  checkStudentWriteAllowed,
  formatClassQuotaMessage,
  planLimitErrorMessage,
} from "@/lib/plan-limits";
import {
  canonicalSpecialEdClassName,
  fallbackSpecialEdClassWhenQuotaBlocks,
  normalizeSpecialEdClassName,
  resolveSpecialEdImportClassAssignment,
  specialEdClassKeyFromStudent,
  specialEdClassMatchKey,
} from "@/lib/special-ed-classes";
import { normalizeEmail } from "@/lib/normalize-email";
import { formatHebrewYear, parseCalendarYear } from "@/lib/calendar-year";
import { isValid, parseISO } from "date-fns";
import {
  FAMILY_STATUS_VALUES,
  type Category,
  type FamilyStatus,
  type Student,
  type StudentStatus,
} from "@/lib/supabase/types";

function excelCellValue(value: ExcelJS.CellValue): unknown {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return value.result ?? "";
  }
  return String(value);
}

/** Excel serial date → YYYY-MM-DD (epoch 1899-12-30, SheetJS-compatible) */
function excelSerialToIso(serial: number): string | null {
  const whole = Math.floor(serial);
  if (!Number.isFinite(whole)) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + whole * 86400000);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type ImportFieldKey =
  | "full_name"
  | "first_name"
  | "last_name"
  | "phone"
  | "email"
  | "father_email"
  | "mother_email"
  | "birth_date"
  | "id_number"
  | "gender"
  | "home_address"
  | "city"
  | "father_name"
  | "mother_name"
  | "father_mobile"
  | "mother_mobile"
  | "class_name"
  | "notes"
  | "teacher_name"
  | "characterization"
  | "functioning"
  | "frequency"
  | "integration_start_date"
  | "family_status"
  | "single_responsible_party"
  | "homeroom_teacher"
  | "eligibility_committee_date"
  | "education_support"
  | "additional_treatments"
  | "calendar_year";

/** כותרות נפוצות בעברית מקבצי אקסל ישנים */
const HEADER_ALIASES: Record<ImportFieldKey, string[]> = {
  full_name: [
    "שם מלא",
    "שם התלמיד",
    "שם התלמידה",
    "שם הילד",
    "שם הילדה",
    "שם מלא ומשפחה",
    "שם",
  ],
  first_name: [
    "שם פרטי",
    "פרטי",
    "first name",
    "firstname",
    "given name",
    "שם",
  ],
  last_name: [
    "שם משפחה",
    "משפחה",
    "שם משפחת",
    "last name",
    "lastname",
    "surname",
    "family name",
  ],
  phone: [
    "טלפון",
    "נייד",
    "פלאפון",
    "טלפון נייד",
    "מספר טלפון",
    "טלפון ראשי",
    "טלפון בבית",
    "טלפון התלמיד",
    "טל'",
  ],
  email: [
    "מייל",
    "אימייל",
    "דואל",
    "דואר אלקטרוני",
    "כתובת מייל",
    "כתובת דואל",
    "מייל הורים",
    "email",
    "e-mail",
  ],
  father_email: [
    "מייל אבא",
    "מייל האב",
    "אימייל אב",
    "דואל אב",
    "כתובת מייל אב",
    "כתובת מייל אבא",
    "כתובת מייל האב",
    "father email",
  ],
  mother_email: [
    "מייל אמא",
    "מייל האם",
    "אימייל אם",
    "דואל אם",
    "כתובת מייל אם",
    "כתובת מייל אמא",
    "כתובת מייל האם",
    "mother email",
  ],
  birth_date: [
    "תאריך לידה",
    "ת. לידה",
    "ת לידה",
    "יום הולדת",
    "תאריך הלידה",
    "לידה",
    "birth date",
    "dob",
  ],
  id_number: ["ת.ז.", "ת.ז", "תז", "תעודת זהות", "מספר זהות", "מס תז", "id"],
  gender: ["מין", "ז/נ", "מגדר"],
  home_address: ["רחוב", "כתובת", "כתובת מגורים", "כתובת פרטית"],
  city: ["ישוב", "יישוב", "עיר"],
  father_name: ["שם האב", "שם האבא", "שם אב", "אבא", "אב"],
  mother_name: ["שם האם", "שם האמא", "שם אם", "אמא", "אם"],
  father_mobile: [
    "נייד אב",
    "נייד האב",
    "טלפון אב",
    "טלפון האב",
    "נייד אבא",
    "טלפון אבא",
  ],
  mother_mobile: [
    "נייד אם",
    "נייד האם",
    "טלפון אם",
    "טלפון האם",
    "נייד אמא",
    "טלפון אמא",
  ],
  class_name: ["כיתה", "כתה", "קבוצה", "שכבה"],
  notes: ["הערות", "הערה"],
  teacher_name: ["שם המורה", "שם מורה", "מורה", "מורה אחראית"],
  homeroom_teacher: ["מחנכת", "שם המחנכת", "שם המחנך"],
  characterization: ["אפיון", "קוד אפיון", "סיווג"],
  functioning: [
    "תיאור תפקוד",
    "תיאור התפקוד",
    "תפקוד",
    "תיאור תפקוד כללי",
  ],
  frequency: [
    "שכיחות",
    "שכיחות גבוהה/נמוכה",
    "רמת שכיחות",
    "סוג שכיחות",
  ],
  integration_start_date: [
    "תאריך כניסה לשילוב",
    "תאריך כניסה למערך השילוב",
    "כניסה למערך השילוב",
    "כניסה לשילוב",
    "תאריך שילוב",
    "integration start date",
    "integration entry date",
  ],
  family_status: ["מצב משפחתי", "סטטוס משפחתי"],
  single_responsible_party: [
    "אחראי יחיד",
    "כן — אחראי יחיד",
    "הורה יחיד",
  ],
  eligibility_committee_date: [
    "תאריך וועדת אפיון וזכאות",
    "תאריך ועדת אפיון וזכאות",
    "ועדת אפיון וזכאות",
  ],
  education_support: ["תומכת חינוך", "תומך חינוך"],
  additional_treatments: ["טיפולים נוספים", "טיפולים"],
  calendar_year: ["שנה קלנדרית", "שנת לימודים"],
};

export type ImportRowStatus =
  | "ok"
  | "update"
  | "error"
  | "duplicate_in_file"
  | "over_capacity"
  | "invalid_class";

export interface ParsedImportRow {
  rowNumber: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  father_email: string | null;
  mother_email: string | null;
  birth_date: string | null;
  id_number: string | null;
  gender: "ז" | "נ" | null;
  home_address: string | null;
  city: string | null;
  father_name: string | null;
  mother_name: string | null;
  father_mobile: string | null;
  mother_mobile: string | null;
  class_name: string | null;
  notes: string | null;
  teacher_name: string | null;
  characterization: string | null;
  functioning: string | null;
  frequency: "high" | "low" | null;
  /** תאריך כניסה לשילוב (ISO YYYY-MM-DD) — עמודה אופציונלית */
  integration_start_date: string | null;
  family_status: FamilyStatus | null;
  single_responsible_party: boolean | null;
  homeroom_teacher: string | null;
  eligibility_committee_date: string | null;
  education_support: string | null;
  additional_treatments: string | null;
  calendar_year: number | null;
  /** ערכי בחירה לא מוכרים — השדה דולג, הייבוא נמשך */
  fieldWarnings: string[];
  status: ImportRowStatus;
  message: string | null;
  /** ID of existing student to update (when status === "update") */
  existingStudentId: string | null;
  /** Excel class label when the row was assigned to a different existing class. */
  classMappedFrom?: string | null;
}

export interface ParseImportResult {
  rows: ParsedImportRow[];
  mappedFields: ImportFieldKey[];
  unrecognizedHeaders: string[];
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/[\s_:.\-/\\]+/g, " ")
    .replace(/['"`״׳]/g, "")
    .trim()
    .toLowerCase();
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatIsoDate(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return String(value).trim();
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** המרת תאריך מאקסל (מספר סידורי / מחרוזת / Date) ל־YYYY-MM-DD */
export function parseImportDate(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatIsoDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // מספר סידורי של אקסל (ימים מאז 1899-12-30)
    if (value > 20000 && value < 80000) {
      return excelSerialToIso(value);
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // YYYY-MM-DD או YYYY/MM/DD
  const iso = raw.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    if (!isValid(parseISO(candidate))) return null;
    return candidate;
  }

  // DD/MM/YYYY או DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    const candidate = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    if (!isValid(parseISO(candidate))) return null;
    return candidate;
  }

  // DD/MM/YY
  const dmyShort = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/);
  if (dmyShort) {
    const yy = Number(dmyShort[3]);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    const candidate = `${year}-${dmyShort[2].padStart(2, "0")}-${dmyShort[1].padStart(2, "0")}`;
    if (!isValid(parseISO(candidate))) return null;
    return candidate;
  }

  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime()) && asDate.getFullYear() > 1900) {
    return formatIsoDate(asDate);
  }

  return null;
}

/** תאימות לאחור — אותו פענוח משמש גם לתאריך לידה וגם לתאריך כניסה לשילוב */
export const parseImportBirthDate = parseImportDate;

/** ת.ז. — ספרות בלבד, עם אפסים מובילים ל־9 תווים (אקסל מוריד אותם לעיתים).
 *  For matching and in-file duplicate checks only — not for saving. */
export function normalizeIdNumber(
  value: string | number | null | undefined
): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 9) return digits.padStart(9, "0");
  return digits;
}

/**
 * Persist ת.ז. as typed (trimmed). Pad to 9 only when the value is all digits.
 * Passports / foreign IDs keep their letters.
 */
export function formatIdNumberForSave(
  value: string | number | null | undefined
): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return trimmed.length < 9 ? trimmed.padStart(9, "0") : trimmed;
  }
  return trimmed;
}

/** Match/duplicate key: normalize numeric IDs; alphanumeric IDs ignore spaces/dashes (case-insensitive). */
export function idNumberMatchKey(
  value: string | number | null | undefined
): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const withoutPunct = trimmed.replace(/[\s\-./]/g, "");
  if (!withoutPunct) return null;
  if (!/^\d+$/.test(withoutPunct)) return withoutPunct.toUpperCase();
  return normalizeIdNumber(trimmed);
}

/** CMS path for an import preview error row. Missing-name is the default. */
export function importExcelErrorStatusTextPath(
  message: string | null | undefined
):
  | "personalArea.importExcelIdNumberOtherStatus"
  | "personalArea.importExcelMissingName" {
  if (message === "id_number_other_status") {
    return "personalArea.importExcelIdNumberOtherStatus";
  }
  return "personalArea.importExcelMissingName";
}

function parseGender(value: string): "ז" | "נ" | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["ז", "זכר", "בן", "male", "m", "boy"].includes(v)) return "ז";
  if (["נ", "נקבה", "בת", "female", "f", "girl"].includes(v)) return "נ";
  return null;
}

function parseFamilyStatus(value: string): FamilyStatus | null {
  const raw = value.trim();
  if (!raw) return null;
  const exact = FAMILY_STATUS_VALUES.find((item) => item === raw);
  if (exact) return exact;
  const normalized = normalizeHeader(raw);
  return (
    FAMILY_STATUS_VALUES.find((item) => normalizeHeader(item) === normalized) ??
    null
  );
}

function parseSingleResponsibleParty(value: string): boolean | null {
  const v = normalizeHeader(value)
    .replace(/[—–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!v) return null;
  if (
    ["כן", "כן אחראי יחיד", "אחראי יחיד", "true", "1", "yes"].includes(v)
  ) {
    return true;
  }
  if (
    ["לא", "לא שני הורים", "שני הורים", "false", "0", "no"].includes(v)
  ) {
    return false;
  }
  return null;
}

const HEBREW_YEAR_BY_LABEL = new Map<string, number>();
for (let year = 5700; year <= 6000; year += 1) {
  HEBREW_YEAR_BY_LABEL.set(
    formatHebrewYear(year).replace(/['"`״׳]/g, ""),
    year
  );
}

interface CalendarYearParseResult {
  year: number | null;
  convertedFromGregorian: boolean;
}

function parseImportCalendarYear(value: unknown): CalendarYearParseResult {
  if (value == null || value === "") return { year: null, convertedFromGregorian: false };
  const numericValue = typeof value === "number" ? value : Number.parseInt(cellText(value), 10);
  if (Number.isFinite(numericValue)) {
    if (numericValue >= 5700 && numericValue <= 6000) {
      return { year: numericValue, convertedFromGregorian: false };
    }
    if (numericValue >= 1990 && numericValue <= 2100) {
      return { year: numericValue + 3760, convertedFromGregorian: true };
    }
  }
  const label = cellText(value).replace(/['"`״׳]/g, "");
  if (!label) return { year: null, convertedFromGregorian: false };
  const fromLabel = HEBREW_YEAR_BY_LABEL.get(label) ?? null;
  return { year: fromLabel, convertedFromGregorian: false };
}

function unknownSelectWarning(label: string, raw: string): string {
  return `${label} לא מוכר: «${raw}» — השדה דולג`;
}

function unknownFrequencyWarning(raw: string): string {
  return `שכיחות לא מוכרת: «${raw}» — לא נשמרת מהקובץ`;
}

function gregorianYearConvertedWarning(gregorian: number, hebrew: number): string {
  return `שנה קלנדרית «${gregorian}» הומרה לשנה עברית ${hebrew}`;
}

function truncateWithWarning(
  value: string | null,
  maxLen: number,
  label: string,
  warnings: string[]
): string | null {
  if (!value) return null;
  if (value.length <= maxLen) return value;
  warnings.push(`${label} קוצר ל־${maxLen} תווים`);
  return value.slice(0, maxLen);
}

function unparsedDateWarning(label: string, raw: string): string {
  return `${label} לא מזוהה: «${raw}»`;
}

function readSelectField<T>(
  raw: string,
  parsed: T | null,
  label: string,
  warnings: string[]
): T | null {
  if (!raw) return null;
  if (parsed != null) return parsed;
  warnings.push(unknownSelectWarning(label, raw));
  return null;
}

/** Parse frequency value from Excel to high/low */
export function parseFrequency(value: string): "high" | "low" | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (
    [
      "גבוהה",
      "גבוה",
      "high",
      "h",
      "שכיחות גבוהה",
    ].includes(v)
  ) {
    return "high";
  }
  if (
    [
      "נמוכה",
      "נמוך",
      "low",
      "l",
      "שכיחות נמוכה",
    ].includes(v)
  ) {
    return "low";
  }
  return null;
}

function matchField(header: string): ImportFieldKey | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  let best: { field: ImportFieldKey; aliasLen: number; exact: boolean } | null =
    null;

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    ImportFieldKey,
    string[],
  ][]) {
    for (const alias of aliases) {
      const aliasNorm = normalizeHeader(alias);
      if (!aliasNorm) continue;

      let hit = false;
      let exact = false;
      if (normalized === aliasNorm) {
        hit = true;
        exact = true;
      } else if (
        aliasNorm.length >= 2 &&
        (normalized.includes(aliasNorm) || aliasNorm.includes(normalized))
      ) {
        // הימנעות מבלבול: "אב" לא יתפוס "אביב", אבל "שם האב" כן
        const shortAlias = aliasNorm.length <= 2;
        if (shortAlias && normalized !== aliasNorm) continue;
        hit = true;
      }

      if (!hit) continue;
      const aliasLen = aliasNorm.length;
      if (
        !best ||
        (exact && !best.exact) ||
        (exact === best.exact && aliasLen > best.aliasLen)
      ) {
        best = { field, aliasLen, exact };
      }
    }
  }

  return best?.field ?? null;
}

function buildHeaderMap(headers: string[]): {
  map: Partial<Record<ImportFieldKey, string>>;
  unrecognized: string[];
} {
  const map: Partial<Record<ImportFieldKey, string>> = {};
  const unrecognized: string[] = [];
  const scored: { header: string; field: ImportFieldKey; score: number }[] =
    [];

  for (const header of headers) {
    const field = matchField(header);
    if (!field) {
      if (header.trim()) unrecognized.push(header.trim());
      continue;
    }
    scored.push({
      header,
      field,
      score: normalizeHeader(header).length,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  for (const item of scored) {
    if (!map[item.field]) {
      map[item.field] = item.header;
    }
  }

  reconcilePairedNameHeaders(map);

  return { map, unrecognized };
}

/**
 * קבצי אקסל נפוצים: עמודת «שם» + «משפחה» — לא שם מלא בודד.
 * אם יש משפחה בלי שם פרטי ממופה, מעבירים את עמודת «שם» לשם פרטי.
 */
function reconcilePairedNameHeaders(
  map: Partial<Record<ImportFieldKey, string>>
): void {
  if (!map.last_name || map.first_name) return;
  const fullHeader = map.full_name;
  if (!fullHeader) return;
  const fullNorm = normalizeHeader(fullHeader);
  if (fullNorm === "שם" || fullNorm === "פרטי" || fullNorm === "firstname") {
    map.first_name = fullHeader;
    delete map.full_name;
  }
}

function readField(
  row: Record<string, unknown>,
  map: Partial<Record<ImportFieldKey, string>>,
  field: ImportFieldKey
): string {
  const header = map[field];
  if (!header) return "";
  return cellText(row[header]);
}

function readRaw(
  row: Record<string, unknown>,
  map: Partial<Record<ImportFieldKey, string>>,
  field: ImportFieldKey
): unknown {
  const header = map[field];
  if (!header) return null;
  return row[header];
}

function resolveFullName(
  row: Record<string, unknown>,
  map: Partial<Record<ImportFieldKey, string>>
): string {
  const first = readField(row, map, "first_name");
  const last = readField(row, map, "last_name");
  if (first || last) {
    return joinPersonName(first, last);
  }
  return readField(row, map, "full_name");
}

type FindExistingResult =
  | { type: "match"; student: Student }
  | { type: "conflict"; reason: string }
  | { type: "none" };

function findExistingStudent(
  fullName: string,
  status: StudentStatus,
  category: Category,
  existing: Student[],
  className?: string | null,
  idNumber?: string | null
): FindExistingResult {
  const inScope = (s: Student) =>
    s.category === category && s.status === status && !s.archived_at;

  const rowIdKey = idNumberMatchKey(idNumber);
  if (rowIdKey) {
    const byIdInScope = existing.find(
      (s) => inScope(s) && idNumberMatchKey(s.id_number) === rowIdKey
    );
    if (byIdInScope) return { type: "match", student: byIdInScope };

    const byIdElsewhere = existing.find(
      (s) =>
        !s.archived_at &&
        !inScope(s) &&
        idNumberMatchKey(s.id_number) === rowIdKey
    );
    if (byIdElsewhere) {
      return { type: "conflict", reason: "id_number_other_status" };
    }
  }

  const needle = fullName.trim().toLowerCase();
  // Special-ed name match is class-scoped. Without a usable class, never treat
  // a same-name student in another/any class as an update (safer: new / unmatched).
  // Check trim before normalize — normalizeSpecialEdClassName("") falls back to "כיתה".
  const usableClass = (className ?? "").trim();
  if (status === "special-ed-class" && !usableClass) {
    return { type: "none" };
  }
  const byName =
    existing.find((s) => {
      if (!inScope(s)) return false;
      if ((s.full_name ?? "").trim().toLowerCase() !== needle) return false;
      // Name fallback only when the row has no ת.ז. or the existing student has none.
      // If both have a ת.ז. they already didn't match by ID — not the same person.
      if (rowIdKey && idNumberMatchKey(s.id_number)) return false;
      // For special-ed-class, the same student name can exist in different classes
      // so we require class_name match. Normalize both sides (Excel + DB).
      if (status === "special-ed-class") {
        if (
          specialEdClassMatchKey(s.class_name) !==
          specialEdClassMatchKey(usableClass)
        ) {
          return false;
        }
      }
      return true;
    }) ?? null;
  return byName ? { type: "match", student: byName } : { type: "none" };
}

function emptyRow(
  index: number,
  partial: Partial<ParsedImportRow> & {
    status: ImportRowStatus;
    message: string | null;
  }
): ParsedImportRow {
  return {
    rowNumber: index + 2,
    full_name: "",
    phone: null,
    email: null,
    father_email: null,
    mother_email: null,
    birth_date: null,
    id_number: null,
    gender: null,
    home_address: null,
    city: null,
    father_name: null,
    mother_name: null,
    father_mobile: null,
    mother_mobile: null,
    class_name: null,
    notes: null,
    teacher_name: null,
    characterization: null,
    functioning: null,
    frequency: null,
    integration_start_date: null,
    family_status: null,
    single_responsible_party: null,
    homeroom_teacher: null,
    eligibility_committee_date: null,
    education_support: null,
    additional_treatments: null,
    calendar_year: null,
    fieldWarnings: [],
    existingStudentId: null,
    classMappedFrom: null,
    ...partial,
  };
}

const CHARACTERIZATION_NOTE_RE = /^אפיון:\s*(.*)$/;

/** הערות כרטיס — תפקוד (אין שדה ייעודי) + עמודת הערות. אפיון נשמר בשדה characterization. */
export function buildStudentImportNotes(options: {
  notes?: string | null;
  functioning?: string | null;
}): string | null {
  const parts: string[] = [];
  const functioning = (options.functioning ?? "").trim();
  const notes = (options.notes ?? "").trim();
  if (functioning) parts.push(`תפקוד: ${functioning}`);
  if (notes) parts.push(notes);
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Removes leftover «אפיון: X» notes lines from the old import, only when X
 * matches the file's אפיון or the existing card's characterization (trimmed).
 * Teacher-written lines are kept.
 */
export function stripCharacterizationNoteLines(
  notes: string | null | undefined,
  matchingCharacterizations: Array<string | null | undefined> = []
): string | null {
  if (notes == null) return null;
  const allowed = new Set(
    matchingCharacterizations
      .map((value) => (value ?? "").trim())
      .filter(Boolean)
  );
  const lines = notes.split(/\n/);
  const kept = lines.filter((line) => {
    const match = CHARACTERIZATION_NOTE_RE.exec(line.trim());
    if (!match) return true;
    const value = (match[1] ?? "").trim();
    return !allowed.has(value);
  });
  if (kept.length === lines.length) return notes;
  const cleaned = kept.join("\n").trim();
  return cleaned || null;
}

/**
 * Append Excel notes/functioning onto existing card notes.
 * Returns null when there is nothing new to write (caller should leave notes untouched).
 */
export function mergeStudentImportNotes(
  existingNotes: string | null | undefined,
  incoming: {
    notes?: string | null;
    functioning?: string | null;
  }
): string | null {
  const built = buildStudentImportNotes(incoming);
  if (!built) return null;
  const existing = (existingNotes ?? "").trim();
  if (!existing) return built;
  const existingLines = new Set(
    existing
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const additions = built
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !existingLines.has(line));
  if (additions.length === 0) return null;
  return `${existing}\n${additions.join("\n")}`;
}

export interface ParseImportOptions {
  status: StudentStatus;
  category: Category;
  existingStudents: Student[];
  /** אם כבר ידוע מהרשימה — לא חובה באקסל */
  defaultTeacherName?: string | null;
  /** כיתה נוכחית ברשימת חינוך מיוחד — לא חובה באקסל */
  defaultClassName?: string | null;
  /** Known class names for validation */
  knownClassNames?: string[];
  /** Plan limit checking context */
  planContext?: {
    planId: string | null;
    institutionType?: Category | null;
    educationFramework?: "regular" | "special" | null;
    planCustomClasses?: number | null;
    planCustomStudents?: number | null;
  } | null;
  /** TZ-32: Only owner/is_admin may assign teacher_name from the file */
  canAssignTeachers?: boolean;
}

/** פענוח קובץ אקסל/CSV לתצוגה מקדימה */
export async function parseStudentImportFile(
  data: ArrayBuffer,
  options: ParseImportOptions
): Promise<ParseImportResult> {
  // טעינה עצלה — ExcelJS (~1MB) לא נכנס ל-bundle של דפי הרשימות
  const { default: Excel } = await import("exceljs");
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) {
    return { rows: [], mappedFields: [], unrecognizedHeaders: [] };
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(excelCellValue(cell.value) ?? "").trim();
  });

  const rawRows: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = excelCellValue(row.getCell(index + 1).value);
      if (value !== "" && value != null) hasValue = true;
      record[header] = value;
    });
    if (hasValue) rawRows.push(record);
  });

  if (rawRows.length === 0) {
    return { rows: [], mappedFields: [], unrecognizedHeaders: [] };
  }

  const { map, unrecognized } = buildHeaderMap(
    headers.filter((h) => Boolean(h))
  );
  const mappedFields = Object.keys(map) as ImportFieldKey[];
  const seenNames = new Set<string>();
  const seenNamesWithoutId = new Set<string>();
  const seenIds = new Set<string>();
  
  const isSpecialEdImport = options.status === "special-ed-class";
  const knownDisplayNames: string[] = [];
  const seenKnownKeys = new Set<string>();
  const rememberKnown = (name: string | null | undefined) => {
    const display = normalizeSpecialEdClassName(name);
    const key = specialEdClassMatchKey(display);
    if (seenKnownKeys.has(key)) return;
    seenKnownKeys.add(key);
    knownDisplayNames.push(display);
  };
  const liveDisplayNames: string[] = [];
  const seenLiveKeys = new Set<string>();
  const rememberLive = (name: string | null | undefined) => {
    const display = normalizeSpecialEdClassName(name);
    const key = specialEdClassMatchKey(display);
    if (seenLiveKeys.has(key)) return;
    seenLiveKeys.add(key);
    liveDisplayNames.push(display);
  };
  if (isSpecialEdImport) {
    for (const name of options.knownClassNames ?? []) {
      rememberKnown(name);
    }
    for (const student of options.existingStudents) {
      if (student.archived_at) continue;
      if (student.status !== "special-ed-class") continue;
      const liveName = specialEdClassKeyFromStudent(student);
      rememberKnown(liveName);
      rememberLive(liveName);
    }
  }

  const defaultClassNormalized = options.defaultClassName?.trim()
    ? isSpecialEdImport
      ? canonicalSpecialEdClassName(options.defaultClassName, knownDisplayNames)
      : options.defaultClassName.trim()
    : null;

  // Live classes + rows accepted earlier in the file (not stale localStorage alone).
  const knownClasses = new Set(
    liveDisplayNames.map((name) => specialEdClassMatchKey(name))
  );
  
  // Track virtual students we're adding for capacity check
  // These are students accepted in earlier rows that need to be counted
  const virtualStudents: Student[] = [];

  const rows: ParsedImportRow[] = rawRows.map((row, index) => {
    const full_name = resolveFullName(row, map);
    const phone = readField(row, map, "phone") || null;
    const email = readField(row, map, "email") || null;
    const father_email =
      normalizeEmail(readField(row, map, "father_email")) || null;
    const mother_email =
      normalizeEmail(readField(row, map, "mother_email")) || null;
    const rawBirthDate = readRaw(row, map, "birth_date");
    const birth_date = parseImportDate(rawBirthDate);
    const rawIntegrationDate = readRaw(row, map, "integration_start_date");
    const integration_start_date = parseImportDate(rawIntegrationDate);
    const rawIdNumber = readField(row, map, "id_number") || null;
    const id_number = formatIdNumberForSave(rawIdNumber);
    const fieldWarnings: string[] = [];
    if (rawBirthDate != null && cellText(rawBirthDate) && birth_date == null) {
      fieldWarnings.push(unparsedDateWarning("תאריך לידה", cellText(rawBirthDate)));
    }
    if (rawIntegrationDate != null && cellText(rawIntegrationDate) && integration_start_date == null) {
      fieldWarnings.push(unparsedDateWarning("תאריך כניסה לשילוב", cellText(rawIntegrationDate)));
    }
    const rawGender = readField(row, map, "gender");
    const gender = readSelectField(
      rawGender,
      parseGender(rawGender),
      "מין",
      fieldWarnings
    );
    const home_address = readField(row, map, "home_address") || null;
    const city = readField(row, map, "city") || null;
    const father_name = readField(row, map, "father_name") || null;
    const mother_name = readField(row, map, "mother_name") || null;
    const father_mobile = readField(row, map, "father_mobile") || null;
    const mother_mobile = readField(row, map, "mother_mobile") || null;
    
    // Special-ed maps aliases (ד → כיתה ד׳). Unknown Excel names are assigned
    // to the import target class (sample files use «ד»; the school class may
    // be «איידי»). Other imports keep the trimmed cell.
    // Empty / whitespace-only stays empty — never invent «כיתה».
    const rawClassName = readField(row, map, "class_name");
    let class_name: string | null;
    let classMappedFrom: string | null = null;
    if (isSpecialEdImport) {
      const registeredClassKeys = new Set(
        knownDisplayNames.map((name) => specialEdClassMatchKey(name))
      );
      const liveClassKeys = new Set(
        liveDisplayNames.map((name) => specialEdClassMatchKey(name))
      );
      const hasRegisteredClassWithoutLiveRoster = Array.from(
        registeredClassKeys
      ).some((key) => !liveClassKeys.has(key));

      const assignment = resolveSpecialEdImportClassAssignment({
        excelClassName: rawClassName || null,
        defaultClassName: defaultClassNormalized,
        knownClassNames: knownDisplayNames,
        ...(liveDisplayNames.length > 0 && !hasRegisteredClassWithoutLiveRoster
          ? { liveClassNames: liveDisplayNames }
          : {}),
      });
      class_name = assignment.className;
      classMappedFrom = assignment.mappedFrom;
    } else {
      class_name = rawClassName || defaultClassNormalized;
    }
    
    const notes = readField(row, map, "notes") || null;
    const characterization = readField(row, map, "characterization") || null;
    const functioning = readField(row, map, "functioning") || null;
    const rawHomeroomTeacher = readField(row, map, "homeroom_teacher") || null;
    const homeroom_teacher = truncateWithWarning(
      rawHomeroomTeacher,
      120,
      "מחנכת",
      fieldWarnings
    );
    const fromFile = readField(row, map, "teacher_name");
    const hasTeacherNameColumn = map.teacher_name != null;
    const teacher_name =
      options.canAssignTeachers === false
        ? null
        : options.defaultTeacherName?.trim() ||
          fromFile ||
          (!hasTeacherNameColumn ? homeroom_teacher : null) ||
          null;
    const rawFrequency = readField(row, map, "frequency");
    const parsedFrequency = parseFrequency(rawFrequency);
    const frequency = parsedFrequency;
    if (rawFrequency && parsedFrequency == null) {
      fieldWarnings.push(unknownFrequencyWarning(rawFrequency));
    }
    const rawFamilyStatus = readField(row, map, "family_status");
    const family_status = readSelectField(
      rawFamilyStatus,
      parseFamilyStatus(rawFamilyStatus),
      "מצב משפחתי",
      fieldWarnings
    );
    const rawSingleResponsible = readField(row, map, "single_responsible_party");
    const single_responsible_party = readSelectField(
      rawSingleResponsible,
      parseSingleResponsibleParty(rawSingleResponsible),
      "אחראי יחיד",
      fieldWarnings
    );
    const rawEligibilityDate = readRaw(row, map, "eligibility_committee_date");
    const eligibility_committee_date = parseImportDate(rawEligibilityDate);
    if (rawEligibilityDate != null && cellText(rawEligibilityDate) && eligibility_committee_date == null) {
      fieldWarnings.push(unparsedDateWarning("תאריך ועדה", cellText(rawEligibilityDate)));
    }
    const rawEducationSupport = readField(row, map, "education_support") || null;
    const education_support = truncateWithWarning(
      rawEducationSupport,
      120,
      "תומכת חינוך",
      fieldWarnings
    );
    const additional_treatments =
      readField(row, map, "additional_treatments") || null;
    const rawCalendarYear = readRaw(row, map, "calendar_year");
    const calendarYearResult = parseImportCalendarYear(rawCalendarYear);
    const calendar_year = calendarYearResult.year;
    if (
      rawCalendarYear != null &&
      cellText(rawCalendarYear) &&
      calendar_year == null
    ) {
      fieldWarnings.push(
        unknownSelectWarning("שנה קלנדרית", cellText(rawCalendarYear))
      );
    }
    if (calendarYearResult.convertedFromGregorian && calendar_year != null) {
      const originalGregorian = calendar_year - 3760;
      fieldWarnings.push(gregorianYearConvertedWarning(originalGregorian, calendar_year));
    }

    const base = {
      full_name,
      phone,
      email,
      father_email,
      mother_email,
      birth_date,
      id_number,
      gender,
      home_address,
      city,
      father_name,
      mother_name,
      father_mobile,
      mother_mobile,
      class_name,
      notes,
      teacher_name,
      characterization,
      functioning,
      frequency,
      integration_start_date,
      family_status,
      single_responsible_party,
      homeroom_teacher,
      eligibility_committee_date,
      education_support,
      additional_treatments,
      calendar_year,
      fieldWarnings,
    };

    if (!full_name) {
      return emptyRow(index, {
        ...base,
        classMappedFrom,
        status: "error",
        message: "missing_name",
      });
    }

    const nameKey = full_name.trim().toLowerCase();
    const idKey = idNumberMatchKey(rawIdNumber);
    const classNameBeforeQuotaFallback = class_name;
    const buildDuplicateKey = (classForDuplicate: string | null) => {
      const classKeyForDuplicate = specialEdClassMatchKey(classForDuplicate);
      return options.status === "special-ed-class"
        ? `${nameKey}::${classKeyForDuplicate}`
        : nameKey;
    };
    const isDuplicateInFile = (classForDuplicate: string | null) => {
      const duplicateKey = buildDuplicateKey(classForDuplicate);
      return Boolean(
        (idKey && seenIds.has(idKey)) ||
          (!idKey && seenNames.has(duplicateKey)) ||
          (idKey && seenNamesWithoutId.has(duplicateKey))
      );
    };
    const rememberInFileStudent = (classForDuplicate: string | null) => {
      const duplicateKey = buildDuplicateKey(classForDuplicate);
      seenNames.add(duplicateKey);
      if (idKey) {
        seenIds.add(idKey);
      } else {
        seenNamesWithoutId.add(duplicateKey);
      }
    };
    const rejectDuplicateInFile = () =>
      emptyRow(index, {
        ...base,
        class_name,
        classMappedFrom,
        status: "duplicate_in_file",
        message: "duplicate_in_file",
      });
    if (isDuplicateInFile(class_name)) {
      return rejectDuplicateInFile();
    }
    const rememberInFileStudentWithAliases = () => {
      rememberInFileStudent(class_name);
      const beforeKey = specialEdClassMatchKey(classNameBeforeQuotaFallback);
      const afterKey = specialEdClassMatchKey(class_name);
      if (beforeKey !== afterKey) {
        rememberInFileStudent(classNameBeforeQuotaFallback);
      }
    };

    // Check if student already exists (for update) — ת.ז. first, then name.
    const existingMatch = findExistingStudent(
      full_name,
      options.status,
      options.category,
      options.existingStudents,
      class_name,
      id_number
    );

    if (existingMatch.type === "conflict") {
      if (isDuplicateInFile(class_name)) {
        return rejectDuplicateInFile();
      }
      rememberInFileStudent(class_name);
      return emptyRow(index, {
        ...base,
        class_name,
        classMappedFrom,
        status: "error",
        message: existingMatch.reason,
      });
    }

    if (existingMatch.type === "match") {
      if (isDuplicateInFile(class_name)) {
        return rejectDuplicateInFile();
      }
      rememberInFileStudent(class_name);
      // Existing student → will be updated (no capacity impact unless class changes)
      return emptyRow(index, {
        ...base,
        class_name,
        classMappedFrom,
        status: "update",
        message: null,
        existingStudentId: existingMatch.student.id,
      });
    }

    // New student → validate class and check capacity
    let targetClass = class_name || "";
    let targetClassKey = specialEdClassMatchKey(targetClass);
    
    // For special-ed-class, validate the class exists or can be created
    if (options.status === "special-ed-class" && targetClass) {
      const isKnownClass = knownClasses.has(targetClassKey);
      const inStoredKnownClasses = knownDisplayNames.some(
        (name) => specialEdClassMatchKey(name) === targetClassKey
      );

      // Without planId: only accept known classes or explicit default from dialog
      if (!isKnownClass && !options.planContext?.planId) {
        const defaultKey = defaultClassNormalized
          ? specialEdClassMatchKey(defaultClassNormalized)
          : null;
        if (!inStoredKnownClasses && targetClassKey !== defaultKey) {
          return emptyRow(index, {
            ...base,
            class_name,
            classMappedFrom,
            status: "invalid_class",
            message: `כיתה לא קיימת: "${targetClass}"`,
          });
        }
        knownClasses.add(targetClassKey);
        rememberKnown(targetClass);
      }
      
      if (!isKnownClass && options.planContext?.planId) {
        const violation = checkClassCreateAllowed({
          planId: options.planContext.planId,
          institutionType: options.planContext.institutionType ?? options.category,
          educationFramework: options.planContext.educationFramework ?? null,
          students: [...options.existingStudents, ...virtualStudents],
          className: targetClass,
          knownClassNames: knownDisplayNames,
          planCustomClasses: options.planContext.planCustomClasses ?? null,
          planCustomStudents: options.planContext.planCustomStudents ?? null,
        });
        
        if (violation) {
          const fallback = fallbackSpecialEdClassWhenQuotaBlocks({
            requestedClassName: targetClass,
            knownClassNames: liveDisplayNames,
          });
          if (fallback) {
            classMappedFrom = classMappedFrom ?? targetClass;
            class_name = fallback;
            targetClass = fallback;
            targetClassKey = specialEdClassMatchKey(fallback);
            const remappedMatch = findExistingStudent(
              full_name,
              options.status,
              options.category,
              options.existingStudents,
              class_name,
              id_number
            );
            if (remappedMatch.type === "match") {
              if (isDuplicateInFile(class_name)) {
                return rejectDuplicateInFile();
              }
              rememberInFileStudentWithAliases();
              return emptyRow(index, {
                ...base,
                class_name,
                classMappedFrom,
                status: "update",
                message: null,
                existingStudentId: remappedMatch.student.id,
              });
            }
          } else {
            return emptyRow(index, {
              ...base,
              class_name,
              classMappedFrom,
              status: "invalid_class",
            message: formatClassQuotaMessage(violation, {
              existingClassNames:
                liveDisplayNames.length > 0
                  ? liveDisplayNames
                  : knownDisplayNames,
              requestedClassName: targetClass,
            }),
            });
          }
        } else {
          knownClasses.add(targetClassKey);
          rememberKnown(targetClass);
        }
      }
    }

    if (isDuplicateInFile(class_name)) {
      return rejectDuplicateInFile();
    }
    rememberInFileStudentWithAliases();

    // Check student write allowed (capacity per class)
    // Include virtual students (already accepted rows) in the check
    const allStudentsForCheck = [...options.existingStudents, ...virtualStudents];
    
    if (options.planContext?.planId) {
      const violation = checkStudentWriteAllowed({
        planId: options.planContext.planId,
        institutionType: options.planContext.institutionType ?? options.category,
        educationFramework: options.planContext.educationFramework ?? null,
        students: allStudentsForCheck,
        student: {
          category: options.category,
          full_name,
          status: options.status,
          class_name: targetClass || null,
          teacher_name,
        },
        knownClassNames: knownDisplayNames,
        planCustomClasses: options.planContext.planCustomClasses ?? null,
        planCustomStudents: options.planContext.planCustomStudents ?? null,
      });
      
      if (violation) {
        return emptyRow(index, {
          ...base,
          class_name,
          classMappedFrom,
          status: "over_capacity",
          message: planLimitErrorMessage(violation),
        });
      }
    }

    // Add this student as a virtual student for subsequent rows' capacity checks
    virtualStudents.push({
      id: `virtual-${index}`,
      institution_id: null,
      category: options.category,
      full_name,
      phone: null,
      father_name: null,
      mother_name: null,
      status: options.status,
      class_name: targetClass || null,
      teacher_name,
      notes: null,
      created_at: "",
      updated_at: "",
    });

    return emptyRow(index, {
      ...base,
      class_name,
      classMappedFrom,
      status: "ok",
      message: null,
    });
  });

  return {
    rows,
    mappedFields,
    unrecognizedHeaders: unrecognized,
  };
}

export interface ImportPreviewCounts {
  ok: number;
  update: number;
  error: number;
  duplicate_in_file: number;
  over_capacity: number;
  invalid_class: number;
}

export function countImportPreview(rows: ParsedImportRow[]): ImportPreviewCounts {
  return rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { ok: 0, update: 0, error: 0, duplicate_in_file: 0, over_capacity: 0, invalid_class: 0 }
  );
}

export const SPECIAL_ED_STUDENT_IMPORT_SAMPLE_HREF =
  "/api/samples/special-ed-class-students";

export const INTEGRATION_STUDENT_IMPORT_SAMPLE_HREF =
  "/api/samples/integration-students";

export const PERSONAL_BASKET_STUDENT_IMPORT_SAMPLE_HREF =
  "/api/samples/personal-basket-students";

/** רשימות שמציגות הורדת קובץ אקסל לדוגמה לייבוא */
export function studentImportSupportsSampleDownload(
  status: StudentStatus
): boolean {
  return (
    status === "special-ed-class" ||
    status === "integration" ||
    status === "integration-teacher" ||
    status === "personal-basket"
  );
}

export function studentImportSampleHref(status: StudentStatus): string | null {
  if (status === "special-ed-class") return SPECIAL_ED_STUDENT_IMPORT_SAMPLE_HREF;
  if (status === "integration" || status === "integration-teacher") {
    return INTEGRATION_STUDENT_IMPORT_SAMPLE_HREF;
  }
  if (status === "personal-basket") return PERSONAL_BASKET_STUDENT_IMPORT_SAMPLE_HREF;
  return null;
}
