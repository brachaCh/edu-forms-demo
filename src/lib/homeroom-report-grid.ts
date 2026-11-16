/** טבלת דוח מחנכת הכיתה — לפי תיק שילוב מוכן (Word) */

import type { FormFieldDef } from "@/lib/form-fields";
import {
  currentCalendarYear,
  formatHebrewYear,
} from "@/lib/calendar-year";

export const HOMEROOM_RATINGS = [
  { value: "weak", label: "חלש" },
  { value: "medium", label: "בינוני" },
  { value: "good", label: "טוב" },
] as const;

export type HomeroomRatingValue = (typeof HOMEROOM_RATINGS)[number]["value"];

export const HOMEROOM_REPORT_YEARS = [
  { key: "y1", defaultLabel: 'שנה"ל' },
  { key: "y2", defaultLabel: 'שנה"ל' },
  { key: "y3", defaultLabel: 'שנה"ל' },
] as const;

export type HomeroomReportYearKey =
  (typeof HOMEROOM_REPORT_YEARS)[number]["key"];

export interface HomeroomReportRow {
  key: string;
  label: string;
}

export interface HomeroomReportGroup {
  title: string;
  rows: HomeroomReportRow[];
}

/** קבוצות ושורות בטבלה — כמו בקובץ Word */
export const HOMEROOM_REPORT_GROUPS: readonly HomeroomReportGroup[] = [
  {
    title: "הרגלי למידה:",
    rows: [
      { key: "attendance", label: "1. הופעה סדירה." },
      { key: "order", label: "2. סדר וארגון." },
      { key: "homework", label: "3. הכנת ש.ב." },
      { key: "attention", label: "4. קשב וריכוז." },
      { key: "motivation", label: "5. מוטיבציה ללמידה" },
    ],
  },
  {
    title: "השגים לימודיים:",
    rows: [
      { key: "torah", label: "1. תורה" },
      { key: "hebrew", label: "2. קריאה ועברית." },
      { key: "math", label: "3. חשבון." },
      { key: "other", label: "4. אחרים(פרטי)" },
    ],
  },
  {
    title: "תחום חברתי – התנהגותי:",
    rows: [
      { key: "authority", label: "1. קבלת סמכות" },
      { key: "coping", label: "2. התמודדות עם קושי" },
    ],
  },
];

export const HOMEROOM_REPORT_FIELD_KEY = "homeroom_report_grid";

export function homeroomYearLabelKey(yearKey: HomeroomReportYearKey): string {
  return `hr_year_${yearKey}_label`;
}

export function homeroomCellKey(
  rowKey: string,
  yearKey: HomeroomReportYearKey
): string {
  return `hr_${rowKey}_${yearKey}`;
}

export function homeroomReportGridField(): FormFieldDef {
  return {
    key: HOMEROOM_REPORT_FIELD_KEY,
    label: "דוח מחנכת הכיתה",
    type: "rating-grid",
  };
}

export function homeroomReportFlatKeys(): string[] {
  const keys: string[] = [];
  for (const year of HOMEROOM_REPORT_YEARS) {
    keys.push(homeroomYearLabelKey(year.key));
  }
  for (const group of HOMEROOM_REPORT_GROUPS) {
    for (const row of group.rows) {
      for (const year of HOMEROOM_REPORT_YEARS) {
        keys.push(homeroomCellKey(row.key, year.key));
      }
    }
  }
  return keys;
}

export function homeroomReportInitialData(): Record<string, string> {
  const initial: Record<string, string> = {};
  const current = currentCalendarYear();
  for (const [index, year] of HOMEROOM_REPORT_YEARS.entries()) {
    // y1 = שנה נוכחית (תשפ״ז), y2/y3 = שנים קודמות
    initial[homeroomYearLabelKey(year.key)] = formatHebrewYear(
      current - index
    );
  }
  for (const group of HOMEROOM_REPORT_GROUPS) {
    for (const row of group.rows) {
      for (const year of HOMEROOM_REPORT_YEARS) {
        initial[homeroomCellKey(row.key, year.key)] = "";
      }
    }
  }
  return initial;
}

export function ratingLabel(value: string): string {
  return HOMEROOM_RATINGS.find((r) => r.value === value)?.label ?? "";
}
