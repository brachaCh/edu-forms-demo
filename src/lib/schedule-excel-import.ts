import type ExcelJS from "exceljs";
import {
  SCHEDULE_DAYS,
  SCHEDULE_PERIODS,
  scheduleCellKey,
  scheduleInClassKey,
  scheduleOtherKey,
} from "@/lib/form-table-grids";

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

type DayKey = (typeof SCHEDULE_DAYS)[number]["key"];

export type ScheduleImportResult = {
  cells: Record<string, string>;
  filledCount: number;
};

const DAY_ALIASES: Record<string, DayKey> = {
  ראשון: "sun",
  "יום ראשון": "sun",
  "יום א": "sun",
  א: "sun",
  sunday: "sun",
  sun: "sun",
  שני: "mon",
  "יום שני": "mon",
  "יום ב": "mon",
  ב: "mon",
  monday: "mon",
  mon: "mon",
  שלישי: "tue",
  "יום שלישי": "tue",
  "יום ג": "tue",
  ג: "tue",
  tuesday: "tue",
  tue: "tue",
  רביעי: "wed",
  "יום רביעי": "wed",
  "יום ד": "wed",
  ד: "wed",
  wednesday: "wed",
  wed: "wed",
  חמישי: "thu",
  "יום חמישי": "thu",
  "יום ה": "thu",
  ה: "thu",
  thursday: "thu",
  thu: "thu",
  שישי: "fri",
  "יום שישי": "fri",
  "יום ו": "fri",
  ו: "fri",
  friday: "fri",
  fri: "fri",
};

function cellText(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string): string {
  return value
    .replace(/['׳"]/g, "")
    .replace(/[.:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchDay(raw: string): DayKey | null {
  const normalized = normalizeHeader(raw);
  if (!normalized) return null;
  return DAY_ALIASES[normalized] ?? DAY_ALIASES[raw.trim()] ?? null;
}

function matchPeriod(raw: string): number | null {
  const normalized = normalizeHeader(raw)
    .replace(/שיעור/g, "")
    .replace(/שעה/g, "")
    .replace(/period/g, "")
    .replace(/^p/, "")
    .trim();
  const num = Number.parseInt(normalized, 10);
  if (!Number.isFinite(num)) return null;
  return (SCHEDULE_PERIODS as readonly number[]).includes(num) ? num : null;
}

async function sheetToMatrix(buffer: ArrayBuffer): Promise<unknown[][]> {
  // טעינה עצלה — ExcelJS (~1MB) לא נכנס ל-bundle של דפי הרשימות
  const { default: Excel } = await import("exceljs");
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const matrix: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = excelCellValue(cell.value);
    });
    // Fill holes left by sparse cells
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] === undefined) values[i] = "";
    }
    matrix.push(values);
  });
  return matrix;
}

function parseFlags(text: string): {
  subject: string;
  inClass: boolean;
  other: boolean;
} {
  const inClass = /בכיתה/.test(text);
  const other = /(?:^|[\s,;|/])אחר(?:$|[\s,;|/])/.test(text) || /\[אחר\]/.test(text);
  const subject = text
    .replace(/\[בכיתה\]/g, "")
    .replace(/\[אחר\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { subject, inClass, other };
}

function applyCell(
  cells: Record<string, string>,
  dayKey: DayKey,
  period: number,
  raw: string
): boolean {
  const text = cellText(raw);
  if (!text) return false;
  const { subject, inClass, other } = parseFlags(text);
  if (subject) cells[scheduleCellKey(dayKey, period)] = subject;
  if (inClass) cells[scheduleInClassKey(dayKey, period)] = "1";
  if (other) cells[scheduleOtherKey(dayKey, period)] = "1";
  return Boolean(subject || inClass || other);
}

function detectDayHeader(row: unknown[]): Map<number, DayKey> | null {
  const mapped = new Map<number, DayKey>();
  row.forEach((cell, index) => {
    const day = matchDay(cellText(cell));
    if (day) mapped.set(index, day);
  });
  return mapped.size >= 3 ? mapped : null;
}

function detectPeriodHeader(row: unknown[]): Map<number, number> | null {
  const mapped = new Map<number, number>();
  row.forEach((cell, index) => {
    const period = matchPeriod(cellText(cell));
    if (period) mapped.set(index, period);
  });
  return mapped.size >= 3 ? mapped : null;
}

function findDayInRow(
  row: unknown[],
  skipCols: Map<number, number>
): DayKey | null {
  for (let index = 0; index < row.length; index += 1) {
    if (skipCols.has(index)) continue;
    const found = matchDay(cellText(row[index]));
    if (found) return found;
  }
  return null;
}

export async function parseScheduleImportFile(
  buffer: ArrayBuffer
): Promise<ScheduleImportResult> {
  const matrix = await sheetToMatrix(buffer);
  const cells: Record<string, string> = {};

  let headerIndex = -1;
  let dayCols: Map<number, DayKey> | null = null;
  let periodCols: Map<number, number> | null = null;

  for (let i = 0; i < Math.min(matrix.length, 12); i += 1) {
    const row = matrix[i] ?? [];
    const days = detectDayHeader(row);
    if (days) {
      headerIndex = i;
      dayCols = days;
      break;
    }
    const periods = detectPeriodHeader(row);
    if (periods) {
      headerIndex = i;
      periodCols = periods;
      break;
    }
  }

  if (headerIndex < 0 || (!dayCols && !periodCols)) {
    return { cells, filledCount: 0 };
  }

  if (dayCols) {
    for (let r = headerIndex + 1; r < matrix.length; r += 1) {
      const row = matrix[r] ?? [];
      let period: number | null = null;
      row.forEach((cell, index) => {
        if (dayCols.has(index)) return;
        const found = matchPeriod(cellText(cell));
        if (found) period = found;
      });
      if (period == null) {
        const sequential = r - headerIndex;
        period = (SCHEDULE_PERIODS as readonly number[]).includes(sequential)
          ? sequential
          : null;
      }
      if (period == null) continue;
      for (const [col, dayKey] of dayCols) {
        applyCell(cells, dayKey, period, cellText(row[col]));
      }
    }
  } else if (periodCols) {
    for (let r = headerIndex + 1; r < matrix.length; r += 1) {
      const row = matrix[r] ?? [];
      const dayKey = findDayInRow(row, periodCols);
      if (!dayKey) continue;
      for (const [col, period] of periodCols) {
        applyCell(cells, dayKey, period, cellText(row[col]));
      }
    }
  }

  return {
    cells,
    filledCount: Object.keys(cells).filter(
      (key) => !key.endsWith("_in_class") && !key.endsWith("_other")
    ).length,
  };
}
