/**
 * קטלוג התאמות בכיתה ובמבחן לפי סוג קושי —
 * לפי מסמך «התאמות בכיתה ובמבחן לפי הקושי».
 */

import type { FormFieldDef } from "@/lib/form-fields";
import {
  resolveTableRowCount,
  rowTableFlatKeys,
  tableCellKey,
  tableRowCountKey,
} from "@/lib/form-table-grids";

export type AccommodationDomainId =
  | "attention"
  | "writing-motor"
  | "written-expression"
  | "organization"
  | "memory"
  | "comprehension"
  | "reading"
  | "spelling"
  | "math"
  | "language"
  | "slowness"
  | "vision"
  | "hearing";

export interface AccommodationDomain {
  id: AccommodationDomainId;
  label: string;
  classroom: string[];
  exams: string[];
}

export const ACCOMMODATION_DOMAINS: AccommodationDomain[] = [
  {
    id: "attention",
    label: "קשב וריכוז",
    classroom: [
      "סדר יום קבוע",
      'כותרת נושא השיעור ע"ג הלוח',
      "ישיבה קרובה למורה",
      "סילוק גירויים מסיחי דעת מהשולחן",
      "חלוקת המטלה למטלות קטנות",
    ],
    exams: [
      "היבחנות בסביבה שקטה",
      "הפחתת כמות השאלות לכל נושא",
      "שאלות קצרות וממוקדות",
      "25% תוספת זמן",
    ],
  },
  {
    id: "writing-motor",
    label: "קשיי כתיבה / מוטוריים",
    classroom: [
      "הפחתת כמות הכתיבה או ההעתקה",
      "מתן משימות שדורשות תשובות קצרות",
      "צילום סיכומי השיעור מחברה",
    ],
    exams: [
      "שאלות הדורשות תשובות קצרות",
      "מבחן רב ברירה (אמריקאי)",
      'מבחן בע"פ',
      "שעתוק המבחן",
      "25% תוספת זמן",
    ],
  },
  {
    id: "written-expression",
    label: "קשיי הבעה בכתב",
    classroom: [
      'מתן מודלים לארגון טקסט ע"י תרשים וכו\'',
      "נתינת הזדמנות לעניית תשובות קצרות",
      "מתן אפשרות לכתיבת ראשי פרקים או סיכום במקום תשובה ארוכה או חיבור",
      "הכללת פריטים כמו השלמת משפטים, שאלות סגורות וכד'",
    ],
    exams: [
      "מבחן רב ברירה / שאלות סגורות או שאלות קצרות שדורשות תשובות קצרות",
      "ויתור על חיפוש מושגים ושפה מורכבת",
      "התייחסות לתוכן התשובה ולא לסגנון ולניסוח",
      "25% תוספת זמן",
    ],
  },
  {
    id: "organization",
    label: "קשיי ארגון",
    classroom: [
      "כתיבת סדר היום על הלוח בתחילת היום",
      "כתיבת שיעורי הבית ביומן",
      "תיווך לסיוע בארגון השולחן לפני השיעור",
      "חלוקת מטלה לשלבי ביניים, פירוק שאלות מורכבות למספר חלקים",
      "בדיקה יומיומית של הילקוט בסיוע ההורים",
      "שימוש בתרשימי זרימה לארגון החומר",
    ],
    exams: [
      "הסבר על אורך המבחן בהתאם לכמות הזמן",
      "תזכורת על הזמן הנותר עד לסיום המבחן",
      "פירוק שאלות מורכבות למספר חלקים",
    ],
  },
  {
    id: "memory",
    label: "קשיי זיכרון ושליפה",
    classroom: [
      "העדפת שאלות סגורות כן/לא, נכון/לא נכון",
      "גילוי סבלנות בדיווח לא רציף או ממוקד",
      "שינון של מושגים מרכזיים או מושגי יסוד במקצוע הנלמד עד להפנמה — תומכי זיכרון",
      "מתן אסטרטגיות זכירה כגון זכירה לפי א״ב, נושאים, אסוציאציות ותרשימי זרימה",
      "כרטיסי ניווט",
      "סיכום השיעור בכתב",
    ],
    exams: [
      "שאלות סגורות או מבחן רב ברירה",
      "כרטיסי ניווט",
      "תיווך לשימוש באסטרטגיות הזיכרון",
      "25% תוספת זמן",
    ],
  },
  {
    id: "comprehension",
    label: "קשיי הבנה",
    classroom: [
      "לימוד מהמוחש אל המופשט",
      "להדגים שוב ושוב בדוגמאות רבות",
      "לבקש מהתלמיד/ה לחזור במילים שלה/ו",
      "חזרה, הדגשה וסיכום",
      "הקנייה במבנה קבוע שבו נלמד כל פעם חומר חדש",
      "הקפדה על הרצף: הכללה — כותרת, הנושא, העיקר, הפרטים ושוב הכללה",
      "הטרמה לחומר הנלמד יום קודם",
      "הבהרת מילות ומשפטי מפתח על הלוח במקום בולט כהטרמה לחומר הנלמד",
      'פירוש בע"פ ויצירת הקשרים בין מילים וביטויים חדשים לבין החומר הקודם',
      "תרשימי זרימה במעט מלל",
      'בדיקת הפער בין הסבר בע"פ להסבר בכתב',
      "הסבר הרעיון המרכזי ע״י התלמיד/ה ב־5 משפטים — לזהות את העיקר",
    ],
    exams: [
      "מבחן רב ברירה",
      "שימוש במילון להבנת מילים קשות",
      "תיווך בהבנת הנדרש",
      "התייחסות לתוכן התשובה ולא לסגנון ולניסוח",
      "25% תוספת זמן",
    ],
  },
  {
    id: "reading",
    label: "קשיי קריאה",
    classroom: [
      "צמצום מטלות קריאה בקול בכיתה",
      "מתן משימות הדורשות קריאת טקסטים קצרים מספר רב של פעמים",
      "קריאה במקהלה",
      "כיתוב גדול ושורות מרווחות",
      "אימון בקריאת מילים או משפטים מרכזיים",
    ],
    exams: [
      "טקסטים קצרים ושאלות קצרות",
      "שאלות פתוחות ולא רב ברירה",
      "הקראת השאלון",
      "כיתוב גדול ושורות מרווחות",
      "25% תוספת זמן",
    ],
  },
  {
    id: "spelling",
    label: "שגיאות כתיב",
    classroom: [
      "הפחתת כמות הכתיבה",
      "כרטיסי ניווט לחוקי הכתיב — ביקורת עצמית בעזרתם",
      "הצגת מילות מפתח כעוגן לכתיבה",
      "הצגת חוקי כתיבה על הלוח",
      "בניית פנקס מילים המסודר לפי א״ב",
    ],
    exams: [
      "התעלמות משגיאות כתיב",
      "שעתוק מבחנים (במבחן לא קריא)",
      "שימוש בכרטיסי ניווט לחוקי הכתיב ובפנקס שנבנה במהלך הלמידה",
      "התייחסות לתוכן התשובה ולא לסגנון ולניסוח",
    ],
  },
  {
    id: "math",
    label: "קשיים במתמטיקה",
    classroom: [
      "סימון מילות מפתח בשאלות חשבוניות או בבעיות מילוליות",
      "הפחתת כמות התרגילים",
      "כרטיסי ניווט לנוסחאות ולחוקים",
      "שימוש בלוחות כפל/חילוק, חיבור/חיסור",
      "שימוש במחשבון — מומלץ כבקרה ולא באופן קבע",
    ],
    exams: ["הפחתת כמות התרגילים", "שימוש במחשבון"],
  },
  {
    id: "language",
    label: "קשיים ברכישת שפה",
    classroom: [
      "קריאת הטקסטים בקול ע״י המורה",
      "שימוש במילונית אלקטרונית או במילון",
      "בניית תרמילון לאוצר מילים חדשות ותרגולו",
      "מתן תשובות הכתובות בקצרה ובתמצות",
      "כרטיסי ניווט של חוקים לשוניים",
    ],
    exams: [
      "בחינה בע״פ או הקראת הטקסט",
      "התעלמות משגיאות כתיב",
      "שימוש במילון שנבנה",
      "כרטיסי ניווט לחוקים דידקטיים",
      "תשובות קצרות או מבחן רב ברירה",
      "התייחסות לתוכן התשובה ולא לסגנון וניסוח",
      "25% תוספת זמן",
    ],
  },
  {
    id: "slowness",
    label: "איטיות",
    classroom: [
      "תוספת זמן למתן תשובות ולהתנהלות",
      "שמירה על קשר עין ודרבון מתמיד",
      "העתקה מהלוח — התלמיד/ה ישלים/תשלים כפי יכולתה/ו והמורה תדאג להשלמת החומר ממחברת אחרת",
    ],
    exams: ["25% תוספת זמן"],
  },
  {
    id: "vision",
    label: "לקות ראייה",
    classroom: [
      "הגדלת ו/או הדגשת גופן הכתב בדף העבודה",
      "ישיבת התלמיד/ה בשורות הקדמיות, קרוב ללוח ומומלץ במרכז",
      "שמירה על קשר עין",
      "כתיבה ברורה במרכז הלוח",
    ],
    exams: ["הגדלת ו/או הדגשת גופן הכתב במבחן"],
  },
  {
    id: "hearing",
    label: "לקות שמיעה",
    classroom: [
      "ישיבת התלמיד/ה קרוב למורה",
      "לדבר בטון ברור / שימוש ברמקול",
      "לשמור על קשר עין",
      "להשתדל לעמוד מול התלמיד/ה בזמן הכתבה, הקנייה או הסבר משימות",
      "להסביר בקול רם את ההוראות",
      "לוודא באופן אישי שהתלמיד/ה שמע/ה את ההוראות",
      "הפחתת חומר רב מלל",
    ],
    exams: [],
  },
];

export const ACCOMMODATIONS_DOMAINS_KEY = "acc_domains";
export const ACCOMMODATIONS_CLASSROOM_KEY = "acc_classroom";
export const ACCOMMODATIONS_EXAMS_KEY = "acc_exams";
/** בחירות לפי תחום: { [domainId]: { classroom: string[], exams: string[] } } */
export const ACCOMMODATIONS_SELECTIONS_KEY = "acc_selections";

export type DomainAccommodationSelection = {
  classroom: string[];
  exams: string[];
};

export type AccommodationsByDomain = Record<
  string,
  DomainAccommodationSelection
>;

export function parseAccommodationList(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function serializeAccommodationList(items: string[]): string {
  return JSON.stringify(items);
}

export function parseAccommodationsByDomain(
  raw: string | undefined | null
): AccommodationsByDomain {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: AccommodationsByDomain = {};
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (!id || !value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const row = value as { classroom?: unknown; exams?: unknown };
      out[id] = {
        classroom: Array.isArray(row.classroom)
          ? row.classroom.map((item) => String(item).trim()).filter(Boolean)
          : [],
        exams: Array.isArray(row.exams)
          ? row.exams.map((item) => String(item).trim()).filter(Boolean)
          : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeAccommodationsByDomain(
  selections: AccommodationsByDomain
): string {
  return JSON.stringify(selections);
}

export function getDomainsByIds(
  ids: string[]
): AccommodationDomain[] {
  const set = new Set(ids);
  return ACCOMMODATION_DOMAINS.filter((d) => set.has(d.id));
}

/** איחוד התאמות מהתחומים שנבחרו (ללא כפילויות, בסדר הקטלוג) */
export function collectAdaptationsForDomains(
  domainIds: string[],
  kind: "classroom" | "exams"
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const domain of getDomainsByIds(domainIds)) {
    for (const item of domain[kind]) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/**
 * קורא בחירות לפי תחום. אם אין מבנה חדש — משחזר מרשימות שטוחות ישנות
 * (פריט משויך לכל תחום שמכיל אותו בקטלוג).
 */
export function resolveAccommodationsByDomain(
  data: Record<string, string>
): AccommodationsByDomain {
  const domainIds = parseAccommodationList(data[ACCOMMODATIONS_DOMAINS_KEY]);
  const structured = parseAccommodationsByDomain(
    data[ACCOMMODATIONS_SELECTIONS_KEY]
  );
  if (Object.keys(structured).length > 0) {
    const out: AccommodationsByDomain = {};
    for (const id of domainIds) {
      out[id] = structured[id] ?? { classroom: [], exams: [] };
    }
    return out;
  }

  const flatClassroom = new Set(
    parseAccommodationList(data[ACCOMMODATIONS_CLASSROOM_KEY])
  );
  const flatExams = new Set(
    parseAccommodationList(data[ACCOMMODATIONS_EXAMS_KEY])
  );
  const out: AccommodationsByDomain = {};
  for (const domain of getDomainsByIds(domainIds)) {
    out[domain.id] = {
      classroom: domain.classroom.filter((item) => flatClassroom.has(item)),
      exams: domain.exams.filter((item) => flatExams.has(item)),
    };
  }
  return out;
}

/** מיישר מפתחות שטוחים (תאימות לאחור) מבחירות לפי תחום */
export function flattenAccommodationsByDomain(
  domainIds: string[],
  selections: AccommodationsByDomain
): { classroom: string[]; exams: string[] } {
  const classroom: string[] = [];
  const exams: string[] = [];
  const seenClassroom = new Set<string>();
  const seenExams = new Set<string>();
  for (const domain of getDomainsByIds(domainIds)) {
    const sel = selections[domain.id] ?? { classroom: [], exams: [] };
    for (const item of sel.classroom) {
      if (seenClassroom.has(item)) continue;
      seenClassroom.add(item);
      classroom.push(item);
    }
    for (const item of sel.exams) {
      if (seenExams.has(item)) continue;
      seenExams.add(item);
      exams.push(item);
    }
  }
  return { classroom, exams };
}

export const ACCOMMODATIONS_TABLE_ID = "accommodations";

/**
 * ממלא את טבלת ההתאמות — שורה לכל תחום שנבחר, עם ההתאמות שנבחרו בנפרד.
 * שומר מקצוע/אחראית קיימים לפי תווית התחום.
 */
export function buildAccommodationsTablePatch(
  data: Record<string, string>,
  domainIds: string[],
  selections: AccommodationsByDomain
): Record<string, string> {
  const tableId = ACCOMMODATIONS_TABLE_ID;
  const domains = getDomainsByIds(domainIds);

  const preserved = new Map<string, { subject: string; responsible: string }>();
  const prevRows = resolveTableRowCount(tableId, data);
  for (let row = 0; row < prevRows; row += 1) {
    const domainLabel = String(
      data[tableCellKey(tableId, row, "domain")] ?? ""
    ).trim();
    if (!domainLabel) continue;
    preserved.set(domainLabel, {
      subject: String(data[tableCellKey(tableId, row, "subject")] ?? "").trim(),
      responsible: String(
        data[tableCellKey(tableId, row, "responsible")] ?? ""
      ).trim(),
    });
  }

  const patch: Record<string, string> = {};
  const nextRows = Math.max(domains.length, 1);
  patch[tableRowCountKey(tableId)] = String(nextRows);

  for (const key of rowTableFlatKeys(tableId, nextRows)) {
    if (!(key in data) && !(key in patch)) patch[key] = "";
  }

  for (let row = 0; row < nextRows; row += 1) {
    const domain = domains[row];
    if (!domain) {
      for (const col of [
        "domain",
        "classroom",
        "exams",
        "subject",
        "responsible",
      ]) {
        patch[tableCellKey(tableId, row, col)] = "";
      }
      continue;
    }
    const sel = selections[domain.id] ?? { classroom: [], exams: [] };
    const keep = preserved.get(domain.label);
    patch[tableCellKey(tableId, row, "domain")] = domain.label;
    patch[tableCellKey(tableId, row, "classroom")] = sel.classroom.join("\n");
    patch[tableCellKey(tableId, row, "exams")] = sel.exams.join("\n");
    patch[tableCellKey(tableId, row, "subject")] = keep?.subject ?? "";
    patch[tableCellKey(tableId, row, "responsible")] = keep?.responsible ?? "";
  }

  return patch;
}

export function accommodationsPickerField(
  label = "התאמות לפי סוג קושי"
): FormFieldDef {
  return {
    key: "accommodations_picker",
    label,
    type: "accommodations-picker",
  };
}
