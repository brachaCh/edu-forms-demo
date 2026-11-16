/** הגדרות טבלאות לטפסים — לפי תיק שילוב מוכן (Word) */

import type { FormFieldDef } from "@/lib/form-fields";

export type FormTableColumn = {
  key: string;
  label: string;
  /** רוחב יחסי / hint */
  wide?: boolean;
  /** גובה textarea (ברירת מחדל: 2 ל-wide, 1 לשאר) */
  rows?: number;
  /**
   * האם מילוי AI יכול למלא את העמודה.
   * ברירת מחדל: true. false = רק המורה ממלאת ידנית.
   */
  aiFillable?: boolean;
  /** סוג קלט בתא. ברירת מחדל: טקסט */
  input?: "text" | "checkbox" | "date" | "team-role";
};

export type FormTableDef = {
  id: string;
  columns: FormTableColumn[];
  /** מספר שורות ברירת מחדל */
  defaultRows: number;
  /** אפשר להוסיף שורות */
  allowAddRows?: boolean;
  /** הערה/הנחיה מעל הטבלה */
  hint?: string;
  /** תוויות שורה קבועות (עמודה ראשונה בלי קלט) */
  rowLabels?: string[];
  /** כותרת עמודת תוויות השורה */
  rowHeaderLabel?: string;
  /**
   * מפתחות שורה ל-SimpleSign. אם מוגדר, תא נשמר כ-
   * `{cellKeyPrefix}_{rowKey}_{columnKey}` במקום `tbl_…`.
   */
  rowKeys?: string[];
  /** קידומת למפתח תא כשיש rowKeys. ברירת מחדל: id של הטבלה */
  cellKeyPrefix?: string;
  /** שדה טקסט לשורת «אחר» (בתוך תא התווית) */
  otherLabelFieldKey?: string;
};

export const SCHEDULE_DAYS = [
  { key: "sun", label: "ראשון" },
  { key: "mon", label: "שני" },
  { key: "tue", label: "שלישי" },
  { key: "wed", label: "רביעי" },
  { key: "thu", label: "חמישי" },
  { key: "fri", label: "שישי" },
] as const;

/** ברירת מחדל לסל אישי / מפורטת */
export const SCHEDULE_PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;

export type ScheduleGridVariant =
  | "simple"
  | "detailed"
  | "tlk-weekly"
  | "tlk-paramedical"
  | "tlk-inclusion"
  | "tlk-personal"
  | "staff-weekly";

/** מספר שיעורים לפי מסמך התל"כ */
export function schedulePeriodsForVariant(
  variant: ScheduleGridVariant = "detailed"
): readonly number[] {
  switch (variant) {
    case "tlk-weekly":
    case "tlk-paramedical":
      return [1, 2, 3, 4, 5, 6, 7, 8];
    case "tlk-inclusion":
      return [1, 2, 3, 4, 5, 6];
    case "tlk-personal":
    case "simple":
    case "staff-weekly":
      return [1, 2, 3, 4, 5, 6, 7];
    default:
      return SCHEDULE_PERIODS;
  }
}

export function scheduleCellKey(dayKey: string, period: number): string {
  return `sched_${dayKey}_p${period}`;
}

/** שדה משנה בתוך תא מערכת שעות (תל"כ) */
export function scheduleSubCellKey(
  dayKey: string,
  period: number,
  subKey: string
): string {
  return `sched_${dayKey}_p${period}_${subKey}`;
}

/** סימון "בכיתה" בתא מערכת שעות */
export function scheduleInClassKey(dayKey: string, period: number): string {
  return `sched_${dayKey}_p${period}_in_class`;
}

/** סימון "אחר" בתא מערכת שעות */
export function scheduleOtherKey(dayKey: string, period: number): string {
  return `sched_${dayKey}_p${period}_other`;
}

/** טקסט חופשי כשמסומן "אחר" (סייעת / טיפול וכו') */
export function scheduleOtherLabelKey(dayKey: string, period: number): string {
  return `sched_${dayKey}_p${period}_other_label`;
}

export function scheduleFlatKeys(
  variant: ScheduleGridVariant = "detailed"
): string[] {
  const keys: string[] = [];
  const periods = schedulePeriodsForVariant(variant);
  for (const period of periods) {
    for (const day of SCHEDULE_DAYS) {
      keys.push(scheduleCellKey(day.key, period));
      if (variant === "detailed") {
        keys.push(scheduleInClassKey(day.key, period));
        keys.push(scheduleOtherKey(day.key, period));
        keys.push(scheduleOtherLabelKey(day.key, period));
      } else if (variant === "tlk-weekly") {
        keys.push(scheduleSubCellKey(day.key, period, "staff"));
      } else if (variant === "staff-weekly") {
        keys.push(scheduleSubCellKey(day.key, period, "student"));
        keys.push(scheduleSubCellKey(day.key, period, "subject"));
      } else if (variant === "tlk-paramedical") {
        keys.push(scheduleSubCellKey(day.key, period, "student"));
        keys.push(scheduleSubCellKey(day.key, period, "therapist"));
      } else if (variant === "tlk-inclusion") {
        keys.push(scheduleSubCellKey(day.key, period, "student"));
        keys.push(scheduleSubCellKey(day.key, period, "class"));
        keys.push(scheduleSubCellKey(day.key, period, "teacher"));
        keys.push(scheduleSubCellKey(day.key, period, "subject"));
      }
    }
  }
  return keys;
}

export function scheduleInitialData(
  variant: ScheduleGridVariant = "detailed"
): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const key of scheduleFlatKeys(variant)) initial[key] = "";
  return initial;
}

export function scheduleGridField(opts?: {
  variant?: ScheduleGridVariant;
  hint?: string;
}): FormFieldDef {
  return {
    key: "schedule_grid",
    label: "מערכת שעות",
    type: "schedule-grid",
    scheduleVariant: opts?.variant ?? "detailed",
    hint: opts?.hint,
  };
}

/** טבלאות רב־שורתיות (תכנון למידה, התאמות, ישיבות וכו') */
export const FORM_TABLE_DEFS: Record<string, FormTableDef> = {
  "daily-learning": {
    id: "daily-learning",
    defaultRows: 6,
    allowAddRows: true,
    columns: [
      { key: "date", label: "תאריך" },
      { key: "domain", label: "תחום" },
      { key: "goals", label: "מטרות", wide: true },
      { key: "lesson", label: "מהלך השיעור והאמצעים", wide: true },
      // המורה כותבת אחרי השיעור — לא מילוי AI
      { key: "summary", label: "סיכום והמלצות", wide: true, aiFillable: false },
    ],
  },
  accommodations: {
    id: "accommodations",
    defaultRows: 1,
    allowAddRows: true,
    hint: "הטבלה מתמלאת אוטומטית לפי התחומים שנבחרו למעלה. אפשר לערוך התאמות, מקצוע ואחראית לכל תחום.",
    columns: [
      { key: "domain", label: "תחום", aiFillable: false },
      { key: "classroom", label: "התאמות בכיתה", wide: true, aiFillable: false },
      { key: "exams", label: "התאמות במבחנים", wide: true, aiFillable: false },
      { key: "subject", label: "המקצוע", aiFillable: false },
      { key: "responsible", label: "אחראית התאמה", aiFillable: false },
    ],
  },
  "formative-domains": {
    id: "formative-domains",
    defaultRows: 5,
    allowAddRows: true,
    columns: [
      { key: "domain", label: "תחום" },
      { key: "initial", label: "מצב התחלתי", wide: true },
      { key: "current", label: "מצב נוכחי", wide: true },
      { key: "goals", label: "מטרות להמשך השנה", wide: true },
    ],
  },
  "summative-domains": {
    id: "summative-domains",
    defaultRows: 4,
    allowAddRows: true,
    columns: [
      { key: "topic", label: "נושא" },
      { key: "initial", label: "מצב התחלתי", wide: true },
      { key: "process", label: "מטרות ותהליך העבודה", wide: true },
      { key: "current", label: "מצב נוכחי", wide: true },
      { key: "recommendations", label: "המלצות", wide: true },
    ],
  },
  "staff-meetings": {
    id: "staff-meetings",
    defaultRows: 8,
    allowAddRows: true,
    columns: [
      { key: "date", label: "תאריך" },
      { key: "participants", label: "משתתפים", wide: true },
      { key: "summary", label: "סיכום והמלצות", wide: true, rows: 5 },
    ],
  },
  "parent-conversations": {
    id: "parent-conversations",
    defaultRows: 8,
    allowAddRows: true,
    columns: [
      { key: "date", label: "תאריך" },
      { key: "summary", label: "סיכום השיחה", wide: true },
    ],
  },
  "external-correspondence": {
    id: "external-correspondence",
    defaultRows: 8,
    allowAddRows: true,
    columns: [
      { key: "date", label: "תאריך" },
      { key: "summary", label: "סיכום השיחה", wide: true },
    ],
  },
  "expert-guidance": {
    id: "expert-guidance",
    defaultRows: 6,
    allowAddRows: true,
    hint: "ניתן לצלם / להעתיק מיומן מורה",
    columns: [
      { key: "date", label: "תאריך" },
      { key: "summary", label: "סיכום הדרכה", wide: true },
    ],
  },
  "tachi-goals": {
    id: "tachi-goals",
    defaultRows: 5,
    allowAddRows: true,
    columns: [
      { key: "goal", label: "יעדים (תתי מטרות)", wide: true },
      { key: "timeframe", label: "פרק הזמן להשגתם" },
      { key: "methods", label: "דרכי ההוראה, השיטות, האמצעים", wide: true },
      { key: "criteria", label: "אמות המידה להערכה", wide: true },
      { key: "followup", label: "מעקב והערכה (יש לציין תאריך)", wide: true },
    ],
  },
  "tachi-integrative-goals": {
    id: "tachi-integrative-goals",
    defaultRows: 4,
    allowAddRows: true,
    hint: "יש למלא על כל תחום בנפרד",
    columns: [
      { key: "goal", label: "יעדים", wide: true },
      { key: "teacher", label: "מורה", wide: true },
      { key: "aide", label: "סייעת", wide: true },
      { key: "other", label: "אחר", wide: true },
      { key: "formative", label: "הערכה מעצבת", wide: true },
      { key: "summative", label: "הערכה מסכמת", wide: true },
      { key: "notes", label: "הערות", wide: true },
    ],
  },
  "tachi-treatments": {
    id: "tachi-treatments",
    defaultRows: 5,
    allowAddRows: true,
    hint: 'יש לצרף תל"א של שנה"ל הקודמת.',
    columns: [
      { key: "year_class", label: "שנה-כיתה" },
      { key: "treatment", label: "טיפול" },
      { key: "provider", label: "מטפל" },
      { key: "impact", label: "מידת השפעה", wide: true },
    ],
  },
  "student-team": {
    id: "student-team",
    defaultRows: 5,
    allowAddRows: true,
    columns: [
      { key: "name", label: "שם" },
      { key: "role", label: "תפקיד", input: "team-role" },
      { key: "phone", label: "טלפון" },
      { key: "hours", label: "ימי עבודה ושעות", wide: true },
    ],
  },
  "class-students": {
    id: "class-students",
    defaultRows: 8,
    allowAddRows: true,
    columns: [
      { key: "name", label: "שם התלמיד/ה" },
      { key: "characterization", label: "אפיון" },
      { key: "functioning", label: "תיאור התפקוד", wide: true },
    ],
  },
  /** טופס ריכוז תל"כ — פירוט מקצועות, שעות ובעלי תפקידים */
  "tlk-summary-subjects": {
    id: "tlk-summary-subjects",
    defaultRows: 8,
    allowAddRows: true,
    hint: "פירוט המקצועות הנלמדים בכיתה",
    columns: [
      { key: "cluster", label: "האשכול" },
      { key: "subject", label: "המקצוע" },
      { key: "weekly_hours", label: "מס' שעות שבועיות" },
      { key: "role_class", label: "בעל תפקיד — כיתתי" },
      { key: "role_group", label: "בעל תפקיד — קבוצתי" },
      { key: "role_individual", label: "בעל תפקיד — פרטני" },
    ],
  },
  "adapted-curriculum": {
    id: "adapted-curriculum",
    defaultRows: 6,
    allowAddRows: true,
    hint: "פירוט נושאי הלימוד בהלימה לתוכנית הלימודים",
    columns: [
      { key: "cluster", label: "האשכול" },
      { key: "subject", label: "המקצוע" },
      { key: "alignment", label: "הלימה לתוכנית הלימודים", wide: true },
      { key: "program", label: "תוכנית לימודים מותאמת", wide: true },
      {
        key: "textbooks",
        label: "רשימת ספרי לימוד ועזרים דידקטיים",
        wide: true,
      },
    ],
  },
  "class-teaching-plan": {
    id: "class-teaching-plan",
    defaultRows: 6,
    allowAddRows: true,
    hint: "תוכנית הוראה כיתתית — המשך",
    columns: [
      { key: "unit", label: "יחידת הלימוד", wide: true },
      { key: "goals", label: "מטרות", wide: true },
      { key: "target_date", label: "תאריך יעד" },
      { key: "methods", label: "דרכי הוראה", wide: true },
      {
        key: "language_opportunities",
        label:
          "הזדמנויות למידה בשילוב החינוך הלשוני (קריאה, כתיבה, הבעה בע״פ/בכתב, מושגים והעשרה)",
        wide: true,
      },
      {
        key: "summary_eval",
        label: "סיכום והערכה (לציין תאריך)",
        wide: true,
      },
    ],
  },
  "class-multi-year-goals": {
    id: "class-multi-year-goals",
    defaultRows: 4,
    allowAddRows: true,
    columns: [
      { key: "school_year", label: 'שנה"ל' },
      { key: "class_name", label: "כיתה" },
      { key: "goal", label: "מטרה", wide: true },
    ],
  },
  "personal-basket-goals": {
    id: "personal-basket-goals",
    defaultRows: 6,
    allowAddRows: true,
    columns: [
      { key: "domain", label: "התחום" },
      { key: "main_goal", label: "מטרת העל", wide: true },
      { key: "partners", label: "שותפים לביצוע", wide: true },
    ],
  },
  /** המלצת פסיכולוג — משתתפי דיון בצוות רב-מקצועי */
  "meeting-attendees": {
    id: "meeting-attendees",
    defaultRows: 4,
    allowAddRows: true,
    columns: [
      { key: "name", label: "שם" },
      { key: "role", label: "תפקיד", wide: true },
    ],
  },
  /** אישור הורים לוועדה — נוכחים בדיון במסגרת */
  "committee-attendees": {
    id: "committee-attendees",
    defaultRows: 4,
    allowAddRows: true,
    columns: [
      { key: "name", label: "שם" },
      { key: "role", label: "תפקיד", wide: true },
    ],
  },
  "kindergarten-treatments": {
    id: "kindergarten-treatments",
    defaultRows: 8,
    allowAddRows: false,
    rowHeaderLabel: "טיפולים – הגורם המטפל",
    cellKeyPrefix: "support",
    otherLabelFieldKey: "support_other",
    rowKeys: [
      "psychologist",
      "medical",
      "social_worker",
      "physiotherapist",
      "occupational",
      "speech",
      "integration_teacher",
      "other",
    ],
    rowLabels: [
      "פסיכולוג",
      "גורם רפואי (רופא התפתחותי, נוירולוג, פסיכיאטר)",
      "עובד/ת סוציאלי/ת",
      "פיזיותרפיסט/ית",
      "מרפא/ה בעיסוק",
      "קלינאי/ת תקשורת",
      "גננת שילוב",
      "אחר:",
    ],
    columns: [
      { key: "gan", label: "הגן", input: "checkbox" },
      { key: "community", label: "הקהילה", input: "checkbox" },
      { key: "kupat_holim", label: 'קופ"ח', input: "checkbox" },
      { key: "private", label: "פרטי", input: "checkbox" },
      { key: "frequency", label: "תדירות הטיפול" },
      { key: "duration", label: "תקופת הטיפול" },
    ],
  },
};

export function tableCellKey(
  tableId: string,
  rowIndex: number,
  columnKey: string
): string {
  const def = FORM_TABLE_DEFS[tableId];
  const rowKey = def?.rowKeys?.[rowIndex];
  if (rowKey) {
    const prefix = def.cellKeyPrefix ?? tableId;
    return `${prefix}_${rowKey}_${columnKey}`;
  }
  return `tbl_${tableId}_r${rowIndex}_${columnKey}`;
}

export function tableRowCountKey(tableId: string): string {
  return `tbl_${tableId}_rows`;
}

/** עמודות טבלה שמקבלות כפתור הקלטה */
export const TABLE_VOICE_COLUMNS: Record<string, readonly string[]> = {
  "class-teaching-plan": ["unit", "goals", "methods", "language_opportunities", "summary_eval"],
  "adapted-curriculum": ["alignment", "program", "textbooks"],
  "tlk-summary-subjects": ["cluster", "subject"],
  "expert-guidance": ["summary"],
  "staff-meetings": ["summary"],
  "parent-conversations": ["summary"],
  "external-correspondence": ["summary"],
  "tachi-treatments": ["treatment", "impact"],
  "personal-basket-goals": ["main_goal"],
  "tachi-goals": ["goal", "methods", "criteria", "followup"],
  "tachi-integrative-goals": ["goal", "teacher", "aide", "other", "formative", "summative", "notes"],
};

export function tableVoiceColumnKeys(tableId: string): readonly string[] {
  return TABLE_VOICE_COLUMNS[tableId] ?? [];
}

export function rowTableField(tableId: string, label: string): FormFieldDef {
  return {
    key: `row_table_${tableId}`,
    label,
    type: "row-table",
    /** מזהה הטבלה נשמר ב-key של השדה דרך prefix */
  };
}

export function getTableIdFromFieldKey(fieldKey: string): string | null {
  if (!fieldKey.startsWith("row_table_")) return null;
  return fieldKey.slice("row_table_".length);
}

export function rowTableFlatKeys(
  tableId: string,
  rowCount: number
): string[] {
  const def = FORM_TABLE_DEFS[tableId];
  if (!def) return [];
  const keys: string[] = [tableRowCountKey(tableId)];
  for (let r = 0; r < rowCount; r += 1) {
    for (const col of def.columns) {
      keys.push(tableCellKey(tableId, r, col.key));
    }
  }
  return keys;
}

export function rowTableInitialData(tableId: string): Record<string, string> {
  const def = FORM_TABLE_DEFS[tableId];
  if (!def) return {};
  const initial: Record<string, string> = {
    [tableRowCountKey(tableId)]: String(def.defaultRows),
  };
  for (let r = 0; r < def.defaultRows; r += 1) {
    for (const col of def.columns) {
      initial[tableCellKey(tableId, r, col.key)] = "";
    }
  }
  return initial;
}

export function resolveTableRowCount(
  tableId: string,
  data: Record<string, string>
): number {
  const def = FORM_TABLE_DEFS[tableId];
  if (def?.rowKeys?.length) return def.rowKeys.length;
  const raw = Number.parseInt(data[tableRowCountKey(tableId)] ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 30);
  return def?.defaultRows ?? 4;
}
