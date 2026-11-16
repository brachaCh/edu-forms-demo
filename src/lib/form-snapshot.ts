/** יצירת עותק להדפסה/הורדה מטופס ממולא (HTML UTF-8 — A4; מערכות שעות לרוחב) */

import type { FormSchema } from "@/lib/form-schemas";
import { listFormFields } from "@/lib/form-schemas";
import {
  INTEGRATIVE_COL_TEACHER_KEY,
  INTEGRATIVE_COL_AIDE_KEY,
  INTEGRATIVE_COL_OTHER_KEY,
  resolveIntegrativeColumnLabel,
} from "@/lib/integrative-tachi-defs";
import {
  interpolateFormStaticLabel,
  resolveFormFieldLabel,
  formatCheckboxMark,
} from "@/lib/form-fields";
import { getSiteTexts } from "@/lib/site-text";
import { getTextByPath } from "@/lib/get-text-by-path";
import type { DocumentBrandLogos } from "@/lib/document-branding";
import {
  MOE_LOGO_PUBLIC_PATH,
  protocolLogoPlaceholderDataUrl,
} from "@/lib/document-branding";
import { formatSignatureMarkup } from "@/lib/green-signature";
import {
  HOMEROOM_RATINGS,
  HOMEROOM_REPORT_GROUPS,
  HOMEROOM_REPORT_YEARS,
  homeroomCellKey,
  homeroomYearLabelKey,
} from "@/lib/homeroom-report-grid";
import {
  FORM_TABLE_DEFS,
  SCHEDULE_DAYS,
  SCHEDULE_PERIODS,
  getTableIdFromFieldKey,
  resolveTableRowCount,
  scheduleCellKey,
  scheduleInClassKey,
  scheduleOtherKey,
  scheduleOtherLabelKey,
  schedulePeriodsForVariant,
  scheduleSubCellKey,
  tableCellKey,
  type FormTableColumn,
  type ScheduleGridVariant,
} from "@/lib/form-table-grids";
import {
  ACCOMMODATION_DOMAINS,
  ACCOMMODATIONS_DOMAINS_KEY,
  parseAccommodationList,
} from "@/lib/accommodations-catalog";
import {
  getOriginalLookRenderer,
  originalLookCss,
} from "@/lib/form-snapshot-original-look";
import { leftoverHolisticStudentProfile } from "@/lib/holistic-rubric";
import { SHARED_PRINT_LAYOUT_CSS } from "@/lib/print-layout-css";
import { formatOriginalDate } from "@/lib/form-snapshot-original-shared";
import { formatTeamRoleDisplay } from "@/lib/team-role-field";
import { formSnapshotFileName } from "@/lib/form-snapshot-filename";

export { formSnapshotFileName } from "@/lib/form-snapshot-filename";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHolisticProfileHtml(
  fields: FormSchema["sections"][number]["fields"],
  data: Record<string, string>,
  labelOf: (field: FormSchema["sections"][number]["fields"][number]) => string
): string {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const cell = (key: string) => {
    const field = byKey.get(key);
    if (!field) return `<div class="holistic-cell"></div>`;
    const value = (data[key] ?? "").trim();
    return `<div class="holistic-cell">
      <div class="holistic-label">${escapeHtml(labelOf(field))}</div>
      <div class="holistic-value">${escapeHtml(value) || "—"}</div>
    </div>`;
  };
  const studentField = byKey.get("student_profile");
  const leftover = leftoverHolisticStudentProfile(data);
  const centerLabel = studentField ? labelOf(studentField) : "התלמיד";
  const center = `<div class="holistic-cell holistic-center${leftover ? "" : " holistic-title-only"}">
      <div class="holistic-label">${escapeHtml(centerLabel)}</div>
      ${leftover ? `<div class="holistic-value">${escapeHtml(leftover)}</div>` : ""}
    </div>`;

  return `<div class="holistic-grid">
    <div class="holistic-top">${cell("environmental_data")}</div>
    <div class="holistic-mid">
      ${cell("disability_background")}
      ${center}
      ${cell("strengths")}
    </div>
    <div class="holistic-bottom">${cell("areas_to_strengthen")}</div>
  </div>`;
}

/** פרופיל כיתה בתל"כ — אותה צורת מחוון הוליסטי */
function buildClassProfileHtml(
  fields: FormSchema["sections"][number]["fields"],
  data: Record<string, string>,
  labelOf: (field: FormSchema["sections"][number]["fields"][number]) => string
): string {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const cell = (key: string, emphasize = false) => {
    const field = byKey.get(key);
    if (!field) return `<div class="holistic-cell"></div>`;
    const value = (data[key] ?? "").trim();
    return `<div class="holistic-cell${emphasize ? " holistic-center" : ""}">
      <div class="holistic-label">${escapeHtml(labelOf(field))}</div>
      <div class="holistic-value">${escapeHtml(value) || "—"}</div>
    </div>`;
  };

  return `<div class="holistic-grid">
    <div class="holistic-top">${cell("class_definition")}</div>
    <div class="holistic-mid">
      ${cell("resources")}
      ${cell("class_goal", true)}
      ${cell("strengths")}
    </div>
    <div class="holistic-bottom">${cell("areas_to_strengthen")}</div>
  </div>`;
}

const CLUSTER_PRINT_ORDER = [
  "sacred_studies",
  "language",
  "life_skills",
  "emotional_behavioral",
  "math",
  "motor_sensory",
  "sciences",
] as const;

function buildLearningClustersHtml(
  fields: FormSchema["sections"][number]["fields"],
  data: Record<string, string>,
  labelOf: (field: FormSchema["sections"][number]["fields"][number]) => string
): string {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const cards = CLUSTER_PRINT_ORDER.map((key) => {
    const field = byKey.get(key);
    if (!field) return "";
    const value = (data[key] ?? "").trim();
    return `<div class="cluster-card">
      <div class="cluster-label">${escapeHtml(labelOf(field))}</div>
      <div class="cluster-value">${escapeHtml(value) || "—"}</div>
    </div>`;
  }).join("");

  return `<div class="clusters-grid">${cards}</div>`;
}

function buildOfficialMoeHeaderHtml(
  moeSrc: string,
  schoolSrc: string | null,
  associationSrc: string | null
): string {
  const side =
    schoolSrc || associationSrc
      ? `<div class="moe-official-side">
      ${associationSrc ? logoImg(associationSrc, "לוגו עמותה", "logo-association") : ""}
      ${schoolSrc ? logoImg(schoolSrc, "לוגו בית הספר", "logo-school") : ""}
    </div>`
      : "";
  return `<header class="moe-official-header">
    <div class="moe-official-brand">
      ${logoImg(moeSrc, "סמל משרד החינוך", "logo-moe")}
      <div class="moe-official-text">
        <p class="moe-official-name">משרד החינוך</p>
        <p>המינהל הפדגוגי</p>
        <p>אגף א׳ חינוך מיוחד</p>
      </div>
    </div>
    ${side}
  </header>`;
}

/** כותרת רגילה (בלי משרד החינוך) — שמאל: עמותה, ימין: בית ספר */
export function buildStandardDocHeaderHtml(
  schoolSrc: string | null,
  associationSrc: string | null
): string {
  if (!schoolSrc && !associationSrc) return "";
  return `<header class="doc-header">
    ${associationSrc ? logoImg(associationSrc, "לוגו עמותה", "logo-association") : ""}
    ${schoolSrc ? logoImg(schoolSrc, "לוגו בית הספר", "logo-school") : ""}
  </header>`;
}

/** כותרת קבועה להדפסה — חוזרת בכל עמוד (כמו לוגו פרוטוקל בתחתית) */
export function buildPrintFixedHeaderHtml(
  schoolSrc: string | null,
  associationSrc: string | null
): string {
  if (!schoolSrc && !associationSrc) return "";
  const parts = [
    associationSrc
      ? logoImg(associationSrc, "לוגו עמותה", "logo-association")
      : "",
    schoolSrc ? logoImg(schoolSrc, "לוגו בית הספר", "logo-school") : "",
  ].filter(Boolean);
  if (!parts.length) return "";
  return `<header class="doc-header-fixed" aria-hidden="true">${parts.join("")}</header>`;
}

/** טפסי משרד החינוך הרשמיים (מיצוי אפשרויות, הכלה, וכו׳) */
export function isMoeOfficialForm(formId: string): boolean {
  return formId.startsWith("moe-");
}

function logoImg(
  src: string | null | undefined,
  alt: string,
  className: string
): string {
  if (!src) return `<div class="${className} logo-slot" aria-hidden="true"></div>`;
  return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" decoding="sync" />`;
}

function buildHomeroomReportTableHtml(data: Record<string, string>): string {
  const yearHeaders = HOMEROOM_REPORT_YEARS.map(
    (year) =>
      `<th colspan="3" class="year-head">${escapeHtml(data[homeroomYearLabelKey(year.key)] || year.defaultLabel)}</th>`
  ).join("");
  const ratingHeaders = HOMEROOM_REPORT_YEARS.map(() =>
    HOMEROOM_RATINGS.map(
      (r) => `<th class="rating-head">${escapeHtml(r.label)}</th>`
    ).join("")
  ).join("");

  const bodyRows = HOMEROOM_REPORT_GROUPS.map((group) => {
    const groupRow = `<tr class="group-row"><td colspan="${1 + HOMEROOM_REPORT_YEARS.length * 3}">${escapeHtml(group.title)}</td></tr>`;
    const itemRows = group.rows
      .map((row) => {
        const cells = HOMEROOM_REPORT_YEARS.map((year) =>
          HOMEROOM_RATINGS.map((rating) => {
            const selected =
              data[homeroomCellKey(row.key, year.key)] === rating.value;
            return `<td class="rating-cell">${selected ? "☑" : "☐"}</td>`;
          }).join("")
        ).join("");
        return `<tr><th class="item-label">${escapeHtml(row.label)}</th>${cells}</tr>`;
      })
      .join("");
    return groupRow + itemRows;
  }).join("");

  return `<table class="homeroom-grid">
    <thead>
      <tr><th rowspan="2" class="domain-head">התחום:</th>${yearHeaders}</tr>
      <tr>${ratingHeaders}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}

export type SchedulePrintLayout = {
  isSchedule: boolean;
  variant: ScheduleGridVariant | null;
};

/** זיהוי טופס מערכת שעות — להדפסה/הורדה לרוחב עם גופן מוקטן */
export function resolveSchedulePrintLayout(
  schema: FormSchema
): SchedulePrintLayout {
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type === "schedule-grid") {
        return {
          isSchedule: true,
          variant: field.scheduleVariant ?? "detailed",
        };
      }
    }
  }
  return { isSchedule: false, variant: null };
}

function scheduleCellMarkup(value: string): string {
  return `<td class="sched-cell">${escapeHtml(value) || "&nbsp;"}</td>`;
}

function buildScheduleTableHtml(
  data: Record<string, string>,
  opts?: {
    variant?:
      | "simple"
      | "detailed"
      | "tlk-weekly"
      | "tlk-paramedical"
      | "tlk-inclusion"
      | "tlk-personal"
      | "staff-weekly";
    hint?: string;
  }
): string {
  const variant = opts?.variant ?? "detailed";
  const periods = schedulePeriodsForVariant(variant);

  if (variant === "tlk-weekly") {
    const dayHeaders = SCHEDULE_DAYS.map(
      (day) => `<th colspan="2">${escapeHtml(day.label)}</th>`
    ).join("");
    const subHeaders = SCHEDULE_DAYS.map(
      () => `<th>המקצוע</th><th>שם</th>`
    ).join("");
    const body = periods
      .map((period) => {
        const cells = SCHEDULE_DAYS.map((day) => {
          const subject = data[scheduleCellKey(day.key, period)] ?? "";
          const staff = data[scheduleSubCellKey(day.key, period, "staff")] ?? "";
          return `${scheduleCellMarkup(subject)}${scheduleCellMarkup(staff)}`;
        }).join("");
        return `<tr><th class="period">${period}</th>${cells}</tr>`;
      })
      .join("");
    const tip =
      opts?.hint ??
      "יש לציין את שם המקצוע ואת שם איש הצוות (מורה, סייעת, מרפאה וכו')";
    return `<table class="schedule-grid">
      <thead><tr><th></th>${dayHeaders}</tr><tr><th></th>${subHeaders}</tr></thead>
      <tbody>${body}</tbody>
    </table><p class="table-hint">${escapeHtml(tip)}</p>`;
  }

  if (variant === "staff-weekly") {
    const dayHeaders = SCHEDULE_DAYS.map(
      (day) => `<th colspan="2">${escapeHtml(day.label)}</th>`
    ).join("");
    const subHeaders = SCHEDULE_DAYS.map(
      () => `<th>שם התלמיד</th><th>מקצוע</th>`
    ).join("");
    const body = periods
      .map((period) => {
        const cells = SCHEDULE_DAYS.map((day) => {
          const student =
            data[scheduleSubCellKey(day.key, period, "student")] ?? "";
          const subject =
            data[scheduleSubCellKey(day.key, period, "subject")] ?? "";
          return `${scheduleCellMarkup(student)}${scheduleCellMarkup(subject)}`;
        }).join("");
        return `<tr><th class="period">${period}</th>${cells}</tr>`;
      })
      .join("");
    const tip = opts?.hint ?? "בכל תא: שם התלמיד/ה והמקצוע";
    return `<table class="schedule-grid">
      <thead><tr><th></th>${dayHeaders}</tr><tr><th></th>${subHeaders}</tr></thead>
      <tbody>${body}</tbody>
    </table><p class="table-hint">${escapeHtml(tip)}</p>`;
  }

  if (variant === "tlk-paramedical") {
    const dayHeaders = SCHEDULE_DAYS.map(
      (day) => `<th colspan="2">${escapeHtml(day.label)}</th>`
    ).join("");
    const subHeaders = SCHEDULE_DAYS.map(
      () => `<th>שם התלמיד</th><th>המרפאה</th>`
    ).join("");
    const body = periods
      .map((period) => {
        const cells = SCHEDULE_DAYS.map((day) => {
          const student =
            data[scheduleSubCellKey(day.key, period, "student")] ?? "";
          const therapist =
            data[scheduleSubCellKey(day.key, period, "therapist")] ?? "";
          return `${scheduleCellMarkup(student)}${scheduleCellMarkup(therapist)}`;
        }).join("");
        return `<tr><th class="period">${period}</th>${cells}</tr>`;
      })
      .join("");
    return `<table class="schedule-grid">
      <thead><tr><th></th>${dayHeaders}</tr><tr><th></th>${subHeaders}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  if (variant === "tlk-inclusion") {
    const dayHeaders = SCHEDULE_DAYS.map(
      (day) => `<th colspan="4">${escapeHtml(day.label)}</th>`
    ).join("");
    const subHeaders = SCHEDULE_DAYS.map(
      () => `<th>תלמיד</th><th>כתה</th><th>מורה</th><th>מקצוע</th>`
    ).join("");
    const body = periods
      .map((period) => {
        const cells = SCHEDULE_DAYS.map((day) => {
          const student =
            data[scheduleSubCellKey(day.key, period, "student")] ?? "";
          const className =
            data[scheduleSubCellKey(day.key, period, "class")] ?? "";
          const teacher =
            data[scheduleSubCellKey(day.key, period, "teacher")] ?? "";
          const subject =
            data[scheduleSubCellKey(day.key, period, "subject")] ?? "";
          return `${scheduleCellMarkup(student)}${scheduleCellMarkup(className)}${scheduleCellMarkup(teacher)}${scheduleCellMarkup(subject)}`;
        }).join("");
        return `<tr><th class="period">${period}</th>${cells}</tr>`;
      })
      .join("");
    return `<table class="schedule-grid">
      <thead><tr><th></th>${dayHeaders}</tr><tr><th></th>${subHeaders}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  const simple = variant === "simple" || variant === "tlk-personal";
  const dayHeaders = SCHEDULE_DAYS.map(
    (day) => `<th>${escapeHtml(day.label)}</th>`
  ).join("");
  const body = periods
    .map((period) => {
      const cells = SCHEDULE_DAYS.map((day) => {
        const value = data[scheduleCellKey(day.key, period)] ?? "";
        if (simple) {
          return scheduleCellMarkup(value);
        }
        const inClass =
          data[scheduleInClassKey(day.key, period)] === "1" ||
          data[scheduleInClassKey(day.key, period)] === "true";
        const other =
          data[scheduleOtherKey(day.key, period)] === "1" ||
          data[scheduleOtherKey(day.key, period)] === "true";
        const otherLabel = (
          data[scheduleOtherLabelKey(day.key, period)] ?? ""
        ).trim();
        const subject = value.trim();
        if (!subject && !inClass && !other) {
          return `<td class="sched-cell sched-cell-empty">&nbsp;</td>`;
        }
        const otherFlagText = other
          ? otherLabel
            ? escapeHtml(otherLabel)
            : "אחר"
          : "";
        const flags = [
          inClass
            ? `<span class="sched-flag sched-flag-on">בכיתה</span>`
            : "",
          otherFlagText
            ? `<span class="sched-flag sched-flag-on">${otherFlagText}</span>`
            : "",
        ]
          .filter(Boolean)
          .join("");
        return `<td class="sched-cell${subject ? "" : " sched-cell-flag-only"}">
        <div class="sched-subject">${escapeHtml(subject) || "&nbsp;"}</div>
        ${
          flags
            ? `<div class="sched-flags">${flags}</div>`
            : ""
        }
      </td>`;
      }).join("");
      return `<tr><th class="period">${period}</th>${cells}</tr>`;
    })
    .join("");

  const tip =
    opts?.hint ??
    (simple ? "נא לרשום שעה מדויקת ומקצוע" : undefined);
  const tipHtml = tip
    ? `<p class="table-hint">${escapeHtml(tip)}</p>`
    : "";

  return `<table class="schedule-grid">
    <thead><tr><th></th>${dayHeaders}</tr></thead>
    <tbody>${body}</tbody>
  </table>${tipHtml}`;
}

function formatTableCellValue(
  tableId: string,
  rowIndex: number,
  col: FormTableColumn,
  data: Record<string, string>
): string {
  const raw = data[tableCellKey(tableId, rowIndex, col.key)] ?? "";
  if (col.input === "checkbox") return formatCheckboxMark(raw);
  if (col.key === "date" || col.input === "date") return formatOriginalDate(raw);
  if (col.input === "team-role") {
    return formatTeamRoleDisplay(raw);
  }
  return raw;
}

function isDateColumn(col: FormTableColumn): boolean {
  return col.key === "date" || col.input === "date";
}

/** 2-column date + wide-summary grids (שיחות עם הורים / תכתובות / הדרכת מומחית). */
function isDateSummaryDataGrid(def: { columns: FormTableColumn[] }): boolean {
  return (
    def.columns.length === 2 &&
    def.columns.some(isDateColumn) &&
    def.columns.some((col) => col.wide)
  );
}

/** ישיבות צוות — table id, or date at index 0 with no row labels. */
function isDateNotesDataGrid(
  tableId: string,
  def: { id?: string; columns: FormTableColumn[]; rowLabels?: string[] }
): boolean {
  if (tableId === "staff-meetings" || def.id === "staff-meetings") return true;
  return (
    !def.rowLabels?.length &&
    def.columns.length === 3 &&
    isDateColumn(def.columns[0]!) &&
    def.columns.filter((col) => col.wide).length === 2
  );
}

function dateNotesColWidth(col: FormTableColumn): string | undefined {
  if (isDateColumn(col)) return "16%";
  if (col.key === "participants") return "30%";
  if (col.key === "summary") return "54%";
  if (col.wide) return "42%";
  return undefined;
}

function dataGridColNames(col: FormTableColumn, dateNotes = false): string[] {
  const classes: string[] = [];
  if (isDateColumn(col)) classes.push("data-grid-col-date");
  if (col.wide) classes.push("data-grid-col-wide");
  if (dateNotes && col.key === "participants") {
    classes.push("data-grid-col-participants");
  }
  if (dateNotes && col.key === "summary") {
    classes.push("data-grid-col-summary");
  }
  return classes;
}

function dataGridColClassAttr(col: FormTableColumn, dateNotes = false): string {
  const classes = dataGridColNames(col, dateNotes);
  return classes.length ? ` class="${classes.join(" ")}"` : "";
}

function buildRowTableHtml(
  tableId: string,
  data: Record<string, string>
): string {
  const def = FORM_TABLE_DEFS[tableId];
  if (!def) return "";
  const rows = resolveTableRowCount(tableId, data);
  const showRowLabels = (def.rowLabels?.length ?? 0) > 0;
  const dateSummary = isDateSummaryDataGrid(def);
  const dateNotes = isDateNotesDataGrid(tableId, def);
  const colClass = (col: FormTableColumn) => dataGridColClassAttr(col, dateNotes);
  const colgroup =
    dateSummary || dateNotes
      ? `<colgroup>${def.columns
          .map((col) => {
            const width = dateSummary
              ? isDateColumn(col)
                ? "16%"
                : col.wide
                  ? "84%"
                  : undefined
              : dateNotesColWidth(col);
            const cls = dataGridColNames(col, dateNotes).join(" ");
            const widthAttr = width ? ` style="width:${width}"` : "";
            const classAttr = cls ? ` class="${cls}"` : "";
            return `<col${classAttr}${widthAttr} />`;
          })
          .join("")}</colgroup>`
      : "";
  const headers = [
    showRowLabels
      ? `<th>${escapeHtml(def.rowHeaderLabel ?? "")}</th>`
      : "",
    ...def.columns.map(
      (col) => `<th${colClass(col)}>${escapeHtml(col.label)}</th>`
    ),
  ].join("");
  const rowIndexes = Array.from({ length: rows }, (_, rowIndex) => rowIndex);
  const renderedIndexes = dateNotes
    ? (() => {
        const filled = rowIndexes.filter((rowIndex) =>
          def.columns.some((col) =>
            String(formatTableCellValue(tableId, rowIndex, col, data)).trim()
          )
        );
        // Blank form keeps every empty row for handwriting
        return filled.length > 0 ? filled : rowIndexes;
      })()
    : rowIndexes;
  const body = renderedIndexes
    .map((rowIndex) => {
      const labelCell = showRowLabels
        ? `<th>${escapeHtml(def.rowLabels?.[rowIndex] ?? "")}${
            def.otherLabelFieldKey && def.rowKeys?.[rowIndex] === "other"
              ? ` ${escapeHtml(data[def.otherLabelFieldKey] ?? "")}`
              : ""
          }</th>`
        : "";
      const cellValues = def.columns.map((col) => ({
        col,
        value: formatTableCellValue(tableId, rowIndex, col, data),
      }));
      const rowEmpty = cellValues.every((cell) => !cell.value.trim());
      const cells = cellValues
        .map(
          (cell) =>
            `<td${colClass(cell.col)}>${escapeHtml(cell.value) || "&nbsp;"}</td>`
        )
        .join("");
      const rowClass = rowEmpty ? ' class="data-grid-row-empty"' : "";
      return `<tr${rowClass}>${labelCell}${cells}</tr>`;
    })
    .join("");
  const hint = def.hint
    ? `<p class="table-hint">${escapeHtml(def.hint)}</p>`
    : "";
  const tableClass = dateSummary
    ? "data-grid data-grid-date-summary"
    : dateNotes
      ? "data-grid data-grid-date-notes"
      : "data-grid";
  return `${hint}<table class="${tableClass}">${colgroup}<thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildAccommodationsPickerHtml(data: Record<string, string>): string {
  const domainIds = parseAccommodationList(data[ACCOMMODATIONS_DOMAINS_KEY]);
  const domains = ACCOMMODATION_DOMAINS.filter((d) => domainIds.includes(d.id));
  const labels =
    domains.length > 0
      ? domains.map((d) => escapeHtml(d.label)).join(" · ")
      : "—";

  return `<div class="accommodations-picker"><p><strong>סוגי קושי שנבחרו:</strong> ${labels}</p></div>`;
}

function integrativeCell(
  data: Record<string, string>,
  row: number,
  colKey: string
): string {
  const tableId = "tachi-integrative-goals";
  const primary = (data[tableCellKey(tableId, row, colKey)] ?? "").trim();
  if (primary) return primary;
  if (colKey === "teacher") {
    return (data[tableCellKey(tableId, row, "opportunities")] ?? "").trim();
  }
  if (colKey === "formative") {
    return (data[tableCellKey(tableId, row, "followup")] ?? "").trim();
  }
  return "";
}

/** הדפסה בפריסת טבלה כמו קובץ Word של תח״י / תל״א אינטגרטיבי */
function buildIntegrativeTachiHtml(
  fields: FormSchema["sections"][number]["fields"],
  data: Record<string, string>,
  labelOf: (field: FormSchema["sections"][number]["fields"][number]) => string
): string {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const label = (key: string, fallback: string) => {
    const f = byKey.get(key);
    return f ? labelOf(f) : fallback;
  };
  const val = (key: string) => escapeHtml((data[key] ?? "").trim()) || "&nbsp;";
  const signVal = (key: string) =>
    formatSignatureMarkup(data[key] ?? "") || "&nbsp;";
  const responsibleKey = byKey.has("responsible")
    ? "responsible"
    : byKey.has("homeroom_teacher")
      ? "homeroom_teacher"
      : null;
  const rows = resolveTableRowCount("tachi-integrative-goals", data);
  const goalRows = Array.from({ length: rows }, (_, i) => {
    const cols = [
      "goal",
      "teacher",
      "aide",
      "other",
      "formative",
      "summative",
      "notes",
    ] as const;
    return `<tr>${cols
      .map(
        (c) =>
          `<td>${escapeHtml(integrativeCell(data, i, c)) || "&nbsp;"}</td>`
      )
      .join("")}</tr>`;
  }).join("");

  const parents = byKey.get("parents_signature");
  const parentsHtml = parents
    ? `<table class="data-grid integrative-sign"><tr><th>${escapeHtml(labelOf(parents))}:</th><td>${signVal("parents_signature")}</td></tr></table>`
    : "";

  return `
<table class="data-grid integrative-tachi">
  <tr>
    <td><strong>${escapeHtml(label("full_name", "שם התלמיד/ה"))}:</strong> ${val("full_name")}</td>
    <td><strong>${escapeHtml(label("class_name", "כיתה"))}:</strong> ${val("class_name")}</td>
    <td><strong>${escapeHtml(label("school_year", 'שנה"ל'))}:</strong> ${val("school_year")}</td>
    ${responsibleKey ? `<td><strong>${escapeHtml(label(responsibleKey, "אחראית"))}:</strong> ${val(responsibleKey)}</td>` : ""}
  </tr>
  <tr>
    <th>${escapeHtml(label("domain", "תחום"))}:</th>
    <td colspan="3">${val("domain")}</td>
  </tr>
  <tr>
    <th>${escapeHtml(label("baseline", "קו בסיס"))}:</th>
    <td colspan="3">${val("baseline")}</td>
  </tr>
  <tr>
    <th>${escapeHtml(label("main_goals", "מטרות על"))}:</th>
    <td colspan="3">${val("main_goals")}</td>
  </tr>
</table>
<table class="data-grid integrative-tachi integrative-goals">
  <thead>
    <tr>
      <th rowspan="2">יעדים</th>
      <th colspan="3">הזדמנויות עבודה ואמצעים להשגתם</th>
      <th colspan="2">מעקב והערכה</th>
      <th rowspan="2">הערות</th>
    </tr>
    <tr>
      <th>${escapeHtml(resolveIntegrativeColumnLabel(INTEGRATIVE_COL_TEACHER_KEY, data[INTEGRATIVE_COL_TEACHER_KEY]))}</th>
      <th>${escapeHtml(resolveIntegrativeColumnLabel(INTEGRATIVE_COL_AIDE_KEY, data[INTEGRATIVE_COL_AIDE_KEY]))}</th>
      <th>${escapeHtml(resolveIntegrativeColumnLabel(INTEGRATIVE_COL_OTHER_KEY, data[INTEGRATIVE_COL_OTHER_KEY]))}</th>
      <th>הערכה מעצבת</th>
      <th>הערכה מסכמת</th>
    </tr>
  </thead>
  <tbody>
    ${goalRows}
  </tbody>
</table>
<table class="data-grid integrative-tachi">
  <tr>
    <th>${escapeHtml(label("recommendations", "המלצות"))}</th>
    <th>${escapeHtml(label("year_changes", "הערות ושינויים משמעותיים במהלך השנה"))}</th>
  </tr>
  <tr>
    <td>${val("recommendations")}</td>
    <td>${val("year_changes")}</td>
  </tr>
</table>
<p class="table-hint">יש למלא על כל תחום בנפרד</p>
${parentsHtml}`;
}

export function buildFormSnapshotHtml(
  schema: FormSchema,
  data: Record<string, string>,
  studentName: string,
  logos: DocumentBrandLogos = {}
): string {
  const protocolSrc =
    logos.protocolLogoUrl?.trim() || protocolLogoPlaceholderDataUrl();
  const moeSrc = logos.moeLogoUrl?.trim() || MOE_LOGO_PUBLIC_PATH;
  const schoolSrc = logos.schoolLogoUrl?.trim() || null;
  const associationSrc = logos.associationLogoUrl?.trim() || null;
  /** פריסה "כמו הטופס המקורי" — הכותרת (סמל, משרד החינוך, שם הטופס) נבנית בתוך הגוף */
  const originalLookRenderer = getOriginalLookRenderer(schema.id);
  const originalLook = originalLookRenderer !== null;
  const showMoeHeader = isMoeOfficialForm(schema.id);
  const headerHtml = originalLook
    ? buildStandardDocHeaderHtml(schoolSrc, associationSrc)
    : showMoeHeader
      ? buildOfficialMoeHeaderHtml(moeSrc, schoolSrc, associationSrc)
      : buildStandardDocHeaderHtml(schoolSrc, associationSrc);
  /** לוגו מוסד/בי״ס קבוע בכל עמוד — בטפסים רגילים (לא משה״ח; שם הלוגואים ב־thead) */
  const fixedHeaderHtml =
    showMoeHeader || originalLook
      ? ""
      : buildPrintFixedHeaderHtml(schoolSrc, associationSrc);
  const hasFixedHeader = Boolean(fixedHeaderHtml);

  const schedulePrint = resolveSchedulePrintLayout(schema);
  const bodyClasses = [
    schedulePrint.isSchedule ? "print-schedule" : "",
    schedulePrint.variant === "tlk-inclusion" ? "print-schedule-inclusion" : "",
    originalLook ? "print-original-look" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const pageRule = schedulePrint.isSchedule
    ? "@page { size: A4 landscape; margin: 1cm; }"
    : "@page { size: A4 portrait; margin: 1.5cm; }";
  const schedulePrintCss = schedulePrint.isSchedule
    ? `
    body.print-schedule {
      overflow-x: visible;
    }
    body.print-schedule .page {
      width: 297mm;
      max-width: 100%;
      min-height: 0;
      height: auto;
      padding: 12mm 14mm 14mm;
      overflow: visible;
    }
    body.print-schedule .page-frame {
      position: absolute;
      top: 10mm;
      right: 10mm;
      bottom: 10mm;
      left: 10mm;
      height: auto;
      border: none;
      box-shadow: inset 0 0 0 1.5pt #2f3b67;
    }
    body.print-schedule h1 {
      font-size: 11pt;
      margin: 0 0 2mm;
      padding-bottom: 1mm;
    }
    body.print-schedule .meta {
      font-size: 8pt;
      margin: 0 0 2mm;
    }
    body.print-schedule .schedule-grid {
      font-size: 8pt;
      table-layout: fixed;
      width: 100%;
      border-collapse: collapse;
      margin: 0;
    }
    body.print-schedule .schedule-grid tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    body.print-schedule .schedule-grid th,
    body.print-schedule .schedule-grid td {
      padding: 0.6mm 0.5mm;
      line-height: 1.1;
      font-size: 8pt;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      vertical-align: top;
      border: 0.4pt solid #333;
    }
    body.print-schedule .schedule-grid thead th {
      font-size: 7.5pt;
      font-weight: 700;
      padding: 0.8mm 0.5mm;
      background: #f5f7fa;
      vertical-align: middle;
    }
    body.print-schedule .schedule-grid .sched-cell {
      white-space: normal;
      text-align: center;
    }
    body.print-schedule .schedule-grid .period {
      width: 5mm;
      font-size: 7.5pt;
      font-weight: 700;
      background: #f5f7fa;
      vertical-align: middle;
      text-align: center;
    }
    body.print-schedule .schedule-grid .sched-subject {
      white-space: normal;
      line-height: 1.05;
      min-height: 0;
      margin: 0 0 0.3mm;
      font-size: 7.5pt;
    }
    body.print-schedule .schedule-grid .sched-flags {
      font-size: 7pt;
      line-height: 1;
      border-top: 0.4pt solid #999;
      padding-top: 0.3mm;
      margin-top: 0;
      display: flex;
      justify-content: space-around;
      gap: 0.5mm;
    }
    body.print-schedule .schedule-grid .sched-cell-empty {
      background: #fafbfc;
    }
    body.print-schedule .schedule-grid .sched-flag {
      display: inline-block;
      font-size: 6.5pt;
      font-weight: 700;
      color: #2f3b67;
    }
    body.print-schedule .print-schedule-instructions {
      font-size: 7.5pt;
      line-height: 1.25;
      margin: 0 0 2mm;
      color: #475569;
    }
    body.print-schedule .table-hint {
      font-size: 7pt;
      margin: 1.5mm 0 0;
    }
    /* Inclusion: 4 columns per day = 25 columns total, needs smaller fonts */
    body.print-schedule-inclusion .schedule-grid {
      font-size: 7pt;
    }
    body.print-schedule-inclusion .schedule-grid th,
    body.print-schedule-inclusion .schedule-grid td {
      font-size: 7pt;
      padding: 0.5mm 0.3mm;
    }
    body.print-schedule-inclusion .schedule-grid thead th {
      font-size: 6.5pt;
      padding: 0.6mm 0.3mm;
    }
    body.print-schedule-inclusion .schedule-grid .period {
      font-size: 6.5pt;
      width: 4mm;
    }`
    : "";

  const texts = getSiteTexts();
  const labelOf = (field: (typeof schema.sections)[number]["fields"][number]) =>
    resolveFormFieldLabel(field, (path) => getTextByPath(texts, path));

  const sections = schema.sections
    .map((section) => {
      const parts: string[] = [];
      let pendingRows: string[] = [];
      let pendingSigns: string[] = [];

      const flushRows = () => {
        if (pendingRows.length > 0) {
          parts.push(`<table>${pendingRows.join("")}</table>`);
          pendingRows = [];
        }
      };
      const flushSigns = () => {
        if (pendingSigns.length > 0) {
          parts.push(
            `<div class="sign-row sign-count-${pendingSigns.length}">${pendingSigns.join("")}</div>`
          );
          pendingSigns = [];
        }
      };

      if (section.layout === "holistic-profile") {
        const profileKeys = new Set([
          "environmental_data",
          "disability_background",
          "student_profile",
          "strengths",
          "areas_to_strengthen",
        ]);
        parts.push(buildHolisticProfileHtml(section.fields, data, labelOf));
        for (const field of section.fields) {
          if (profileKeys.has(field.key)) continue;
          if (field.type === "static") {
            if (field.key === "ai_workplan_hint") continue;
            parts.push(
              `<p class="statement">${escapeHtml(interpolateFormStaticLabel(field.label, data))}</p>`
            );
          } else if (field.type === "signature") {
            const value = data[field.key] ?? "";
            parts.push(
              `<div class="sign-row sign-count-1"><div class="sign-line"><span class="sign-label">${escapeHtml(labelOf(field))}:</span><span class="sign-value">${formatSignatureMarkup(value)}</span></div></div>`
            );
          } else {
            const label = labelOf(field);
            const value = data[field.key] ?? "";
            parts.push(
              `<table><tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value) || "—"}</td></tr></table>`
            );
          }
        }
        const title = section.title
          ? `<h2>${escapeHtml(section.title)}</h2>`
          : "";
        return `${title}${parts.join("")}`;
      }

      if (section.layout === "class-profile") {
        const profileKeys = new Set([
          "class_definition",
          "resources",
          "class_goal",
          "strengths",
          "areas_to_strengthen",
        ]);
        parts.push(buildClassProfileHtml(section.fields, data, labelOf));
        for (const field of section.fields) {
          if (profileKeys.has(field.key)) continue;
          if (field.type === "static") {
            if (field.key === "ai_workplan_hint") continue;
            parts.push(
              `<p class="statement">${escapeHtml(interpolateFormStaticLabel(field.label, data))}</p>`
            );
          } else {
            const label = labelOf(field);
            const value = data[field.key] ?? "";
            parts.push(
              `<table><tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value) || "—"}</td></tr></table>`
            );
          }
        }
        const title = section.title
          ? `<h2>${escapeHtml(section.title)}</h2>`
          : "";
        return `${title}${parts.join("")}`;
      }

      if (section.layout === "learning-clusters") {
        parts.push(buildLearningClustersHtml(section.fields, data, labelOf));
        const title = section.title
          ? `<h2>${escapeHtml(section.title)}</h2>`
          : "";
        return `${title}${parts.join("")}`;
      }

      if (section.layout === "integrative-tachi") {
        parts.push(buildIntegrativeTachiHtml(section.fields, data, labelOf));
        const title = section.title
          ? `<h2>${escapeHtml(section.title)}</h2>`
          : "";
        return `${title}${parts.join("")}`;
      }

      for (const field of section.fields) {
        const label = labelOf(field);
        if (field.type === "static") {
          if (field.key === "ai_workplan_hint") continue;
          flushRows();
          flushSigns();
          parts.push(
            `<p class="statement${
              field.key.includes("schedule") ? " print-schedule-instructions" : ""
            }">${escapeHtml(interpolateFormStaticLabel(field.label, data))}</p>`
          );
          continue;
        }
        if (field.type === "signature") {
          flushRows();
          const value = data[field.key] ?? "";
          pendingSigns.push(
            `<div class="sign-line"><span class="sign-label">${escapeHtml(label)}:</span><span class="sign-value">${formatSignatureMarkup(value)}</span></div>`
          );
          if (pendingSigns.length >= 3) flushSigns();
          continue;
        }
        if (field.type === "rating-grid") {
          flushRows();
          flushSigns();
          parts.push(buildHomeroomReportTableHtml(data));
          continue;
        }
        if (field.type === "schedule-grid") {
          flushRows();
          flushSigns();
          parts.push(
            buildScheduleTableHtml(data, {
              variant: field.scheduleVariant ?? "detailed",
              hint: field.hint,
            })
          );
          continue;
        }
        if (field.type === "row-table") {
          flushRows();
          flushSigns();
          const tableId = getTableIdFromFieldKey(field.key);
          if (tableId) parts.push(buildRowTableHtml(tableId, data));
          continue;
        }
        if (field.type === "accommodations-picker") {
          flushRows();
          flushSigns();
          parts.push(buildAccommodationsPickerHtml(data));
          continue;
        }
        flushSigns();
        let value = data[field.key] ?? "";
        if (field.type === "checkbox") {
          value = schema.id.startsWith("waiver-")
            ? formatCheckboxMark(value)
            : value === "true" || value === "1" || value === "on"
              ? "כן"
              : "לא";
        } else if (field.type === "select" && field.options) {
          const opt = field.options.find((o) => o.value === value);
          if (opt) value = opt.label;
        } else if (field.type === "date") {
          value = formatOriginalDate(value);
        }
        pendingRows.push(
          `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value) || "—"}</td></tr>`
        );
      }
      flushRows();
      flushSigns();

      const title = section.title
        ? `<h2>${escapeHtml(section.title)}</h2>`
        : "";
      return `${title}${parts.join("")}`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(schema.title)} — ${escapeHtml(studentName)}</title>
  <style>
    /* שוליים — מערכות שעות לרוחב; שאר הטפסים לאורך */
    ${pageRule}
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: Arial, "Segoe UI", sans-serif;
    }
    /* Screen only — leaking overflow-x:hidden into embedded portfolio print clips tables */
    @media screen {
      html, body { overflow-x: hidden; }
    }
    .page {
      width: 210mm;
      max-width: 100%;
      min-height: 297mm;
      margin: 0 auto;
      /* 1.5 ס״מ שוליים + מרווח פנימי בתוך המסגרת */
      padding: calc(1.5cm + 5mm) calc(1.5cm + 5mm) 28mm;
      background: #fff;
      overflow: visible;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    /* מסגרת בגובה עמוד A4 קבוע — לא נמתחת עם התוכן */
    .page-frame {
      position: absolute;
      top: 1.5cm;
      right: 1.5cm;
      left: 1.5cm;
      height: calc(297mm - 3cm);
      border: 1.5pt solid #2f3b67;
      pointer-events: none;
      z-index: 2;
    }
    @media screen {
      html, body { background: #d6dbe3; }
      .page {
        box-shadow: 0 2px 14px rgba(47, 59, 103, 0.18);
        background-color: #fff;
        /* מסגרת רציפה — בלי חזרה של מלבן A4 שחותך את התוכן באמצע */
        background-image: none;
        border: 1.5pt solid #2f3b67;
      }
      .page-frame { display: none; }
    }
    .doc-header {
      display: flex;
      flex-direction: row;
      direction: ltr;
      justify-content: space-between;
      align-items: center;
      gap: 4mm;
      min-height: 22mm;
      margin: 0 0 6mm;
      padding: 0 0 3mm;
      border-bottom: 1px solid #d7dde5;
      overflow: visible;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .moe-official-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6mm;
      margin: 0 0 5mm;
      padding: 0 0 3mm;
      border-bottom: 1px solid #c5d4e8;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .moe-official-brand {
      display: flex;
      align-items: center;
      gap: 3.5mm;
      min-width: 0;
    }
    .moe-official-text {
      line-height: 1.25;
      color: #0058a0;
      font-size: 9pt;
    }
    .moe-official-text p {
      margin: 0;
    }
    .moe-official-name {
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .moe-official-side {
      display: flex;
      flex-direction: row;
      direction: ltr;
      align-items: center;
      gap: 4mm;
    }
    .logo-moe {
      display: block;
      width: auto;
      height: auto;
      max-width: 18mm;
      max-height: 22mm;
      object-fit: contain;
    }
    .doc-body {
      flex: 1 1 auto;
      width: 100%;
    }
    /* tfoot חוזר בכל עמוד מודפס ומשריין מקום ללוגו התחתון */
    .page-sheet {
      flex: 1 1 auto;
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
      break-inside: auto;
    }
    .page-sheet > tbody > tr > td,
    .page-sheet > thead > tr > td,
    .page-sheet > tfoot > tr > td {
      padding: 0;
      border: 0;
      vertical-align: top;
    }
    .page-sheet > thead {
      display: table-header-group;
    }
    .page-sheet > tfoot {
      display: table-footer-group;
    }
    /* בתצוגה אין צורך בשריון — רק בהדפסה */
    .doc-footer-space {
      height: 0;
    }
    .doc-header-space {
      height: 0;
    }
    /* רק בהדפסה — לוגו מוסד/בי״ס בראש כל עמוד */
    .doc-header-fixed {
      display: none;
    }
    .doc-footer {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-top: auto;
      padding: 8mm 0 0;
      border: none;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .logo-school,
    .logo-association,
    .logo-protocol {
      display: block;
      flex: 0 0 auto;
      width: auto;
      height: auto;
      max-width: 40mm;
      max-height: 20mm;
      object-fit: contain;
      object-position: center;
    }
    .logo-protocol {
      max-width: 68mm;
      max-height: 24mm;
      opacity: 0.55;
    }
    .logo-slot {
      flex: 0 0 auto;
      width: 32mm;
      height: 16mm;
      border: 1px dashed #c5ced8;
      border-radius: 4px;
      background: #f8fafc;
    }
    h1 {
      font-size: 16pt;
      width: fit-content;
      max-width: 100%;
      margin: 0 0 5mm 0;
      padding: 0 2mm 2mm;
      border-bottom: 1.5mm solid #c9e2f7;
      color: #084e76;
      text-align: right;
      line-height: 1.25;
    }
    .meta {
      color: #555;
      margin: 0 0 6mm;
      font-size: 10pt;
      text-align: center;
    }
    h2 {
      font-size: 11.5pt;
      margin: 5mm 0 2mm;
      border-bottom: 1px solid #ccc;
      padding-bottom: 1mm;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 3mm;
      page-break-inside: avoid;
    }
    th, td {
      text-align: right;
      padding: 2mm 1.2mm;
      border-bottom: 1px solid #eee;
      vertical-align: top;
      font-size: 10pt;
    }
    /* רק לטבלאות שדות פשוטות — לא לטבלאות רשת (אחרת העמודות נחתכות) */
    table:not(.homeroom-grid):not(.schedule-grid):not(.data-grid) > tbody > tr > th,
    table:not(.homeroom-grid):not(.schedule-grid):not(.data-grid) > tr > th {
      width: 35%;
      color: #333;
      font-weight: 700;
    }
    .homeroom-grid {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 3mm 0 5mm;
      font-size: 8.5pt;
    }
    .homeroom-grid th,
    .homeroom-grid td {
      border: 1px solid #bbb;
      padding: 1mm 0.4mm;
      text-align: center;
      vertical-align: middle;
      width: auto;
      font-size: 8.5pt;
      word-break: break-word;
    }
    .homeroom-grid .domain-head,
    .homeroom-grid .item-label {
      text-align: right;
      font-weight: 700;
      width: 20%;
      padding-right: 1.2mm;
      padding-left: 0.6mm;
    }
    .homeroom-grid .year-head {
      font-weight: 700;
      background: #f3f6fa;
      width: 26.66%;
    }
    .homeroom-grid .rating-head {
      font-size: 8pt;
      font-weight: 700;
      width: 8.88%;
    }
    .homeroom-grid .group-row td {
      text-align: right;
      font-weight: 700;
      background: #eef2f7;
      padding-right: 1.5mm;
    }
    .homeroom-grid .rating-cell {
      width: 8.88%;
      font-size: 10pt;
      line-height: 1;
    }
    .table-hint {
      text-align: center;
      font-size: 10pt;
      color: #444;
      margin: 2mm 0 3mm;
    }
    .holistic-grid {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3mm;
      margin: 3mm 0 6mm;
      page-break-inside: avoid;
    }
    .holistic-mid {
      display: grid;
      grid-template-columns: 1fr 1.15fr 1fr;
      gap: 3mm;
      width: 100%;
    }
    .holistic-top,
    .holistic-bottom {
      width: 38%;
    }
    .holistic-cell {
      border: 1px solid #2f3b67;
      border-radius: 2mm;
      padding: 2mm;
      min-height: 28mm;
      background: #fff;
    }
    .holistic-center {
      border-width: 1.6pt;
      background: #f5f8fc;
    }
    .holistic-title-only {
      min-height: 14mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .holistic-title-only .holistic-label {
      margin-bottom: 0;
    }
    .holistic-label {
      text-align: center;
      font-weight: 700;
      font-size: 10pt;
      margin-bottom: 1.5mm;
    }
    .holistic-value {
      white-space: pre-wrap;
      font-size: 9.5pt;
      line-height: 1.45;
      text-align: right;
      min-height: 18mm;
    }
    .clusters-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3mm;
      margin: 3mm 0 6mm;
    }
    .cluster-card {
      border: 1px solid #2f3b67;
      border-radius: 2mm;
      padding: 2mm;
      min-height: 22mm;
      background: #fff;
      page-break-inside: avoid;
    }
    .cluster-label {
      text-align: center;
      font-weight: 700;
      font-size: 10pt;
      margin-bottom: 1.5mm;
      color: #1f4b7a;
    }
    .cluster-value {
      white-space: pre-wrap;
      font-size: 9.5pt;
      line-height: 1.45;
      text-align: right;
      min-height: 12mm;
    }
    .schedule-grid,
    .data-grid {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 3mm 0 6mm;
      font-size: 9pt;
      page-break-inside: auto;
      break-inside: auto;
    }
    .schedule-grid th,
    .schedule-grid td,
    .data-grid th,
    .data-grid td {
      border: 1px solid #333;
      padding: 1.5mm 1mm;
      text-align: center;
      vertical-align: top;
      min-height: 9mm;
      width: auto;
    }
    .schedule-grid .period {
      width: 8mm;
      font-weight: 700;
      background: #f5f7fa;
    }
    .schedule-grid .sched-subject {
      min-height: 7mm;
      margin-bottom: 1mm;
      white-space: pre-wrap;
    }
    .schedule-grid .sched-flags {
      display: flex;
      justify-content: space-around;
      gap: 1mm;
      font-size: 7.5pt;
      border-top: 1px solid #999;
      padding-top: 1mm;
    }
    .schedule-grid .sched-cell {
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }
    ${schedulePrintCss}
    .data-grid th {
      background: #faf8f4;
      font-weight: 700;
      color: #084e76;
    }
    .data-grid td { text-align: right; }
    .integrative-tachi th,
    .integrative-tachi td {
      text-align: right;
      white-space: pre-wrap;
      font-size: 9pt;
      line-height: 1.4;
    }
    .integrative-goals th {
      text-align: center;
    }
    .integrative-goals td {
      min-height: 14mm;
      vertical-align: top;
    }
    .integrative-sign {
      width: auto;
      margin-top: 4mm;
    }
    .statement {
      font-size: 11.5pt;
      line-height: 1.8;
      margin: 5mm 0;
    }
    .sign-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-end;
      gap: 4mm 6mm;
      margin: 4mm 0 5mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sign-line {
      display: flex;
      flex: 1 1 calc(33.33% - 4mm);
      width: auto;
      min-width: 55mm;
      max-width: 100%;
      align-items: baseline;
      gap: 2mm;
      font-size: 11pt;
    }
    /* חתימה בודדת (למשל אחרי פרטי הורה) — לרוחב מלא */
    .sign-count-1 .sign-line {
      flex: 1 1 100%;
      min-width: 100%;
    }
    .sign-count-2 .sign-line {
      flex: 1 1 calc(50% - 3mm);
      min-width: 60mm;
    }
    .sign-label { font-weight: 700; white-space: nowrap; }
    .sign-value {
      flex: 1;
      border-bottom: 1px solid #333;
      min-height: 6mm;
    }
    .sign-value:has(.sign-image),
    .sign-value:has(svg),
    .sign-value:has(.sign-received),
    .sign-value:has(.sign-ink) {
      border-bottom: none;
      min-height: 0;
    }
    .sign-ink {
      min-height: 12mm;
    }
    .sign-received {
      font-size: 10pt;
      color: #0f766e;
      font-weight: 700;
    }
    .sign-image,
    .sign-value svg {
      display: block;
      max-width: 55mm;
      max-height: 18mm;
      object-fit: contain;
      object-position: right center;
    }
    @media print {
      html, body {
        width: auto;
        height: auto !important;
        overflow: visible;
        background: #fff;
      }
      .page {
        width: auto !important;
        max-width: 100% !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 !important;
        /* שוליים באים מ־@page — רק ריווח פנימי קטן בתוך המסגרת */
        padding: 3mm !important;
        overflow: visible !important;
        border: none !important;
        background-image: none !important;
        box-shadow: none !important;
        display: block;
      }
      /*
       * מסגרת קבועה — inset box-shadow במקום border
       * (border על fixed+inset / height:100% יוצרים עמוד ריק בכרום)
       */
      .page-frame {
        display: block;
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        width: auto;
        height: auto;
        max-height: 100%;
        border: none;
        box-shadow: inset 0 0 0 1.5pt #2f3b67;
        pointer-events: none;
        z-index: 3;
      }
      .doc-header {
        min-height: 18mm;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      h1, .meta {
        page-break-after: avoid;
        break-after: avoid;
      }
      /* לוגו מוסד/בי״ס — קבוע בראש כל עמוד מודפס */
      .doc-header-fixed {
        display: flex;
        flex-direction: row;
        direction: ltr;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        justify-content: space-between;
        align-items: center;
        gap: 4mm;
        margin: 0;
        padding: 0 0 2mm;
        border-bottom: 1px solid #d7dde5;
        background: #fff;
        z-index: 1;
        pointer-events: none;
      }
      /* חוזר בתחתית כל עמוד מודפס — בהיר, ברקע */
      .doc-footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        margin: 0;
        padding: 0;
        z-index: 0;
        pointer-events: none;
      }
      .logo-school,
      .logo-association {
        max-width: 36mm;
        max-height: 18mm;
      }
      .logo-moe {
        max-width: 16mm;
        max-height: 20mm;
      }
      .logo-protocol {
        max-width: 60mm;
        max-height: 10mm;
        opacity: 0.45;
      }
      .doc-footer-space {
        height: 12mm;
      }
      .doc-header-space {
        height: ${hasFixedHeader ? "20mm" : "0"};
      }
      ${
        hasFixedHeader
          ? `.doc-header-screen { display: none !important; }`
          : ""
      }
      /* טבלאות ארוכות — אפשרות פיצול בין עמודים במקום חיתוך */
      table,
      .homeroom-grid,
      .holistic-grid,
      .cluster-card,
      .schedule-grid,
      .data-grid {
        page-break-inside: auto;
        break-inside: auto;
      }
      ${SHARED_PRINT_LAYOUT_CSS}
      .homeroom-grid {
        font-size: 8pt;
      }
      /* Schedule forms: fit entire table on ONE A4 landscape page with readable fonts */
      body.print-schedule .page {
        width: 297mm !important;
        max-width: 100% !important;
        min-height: 0 !important;
        height: auto !important;
        padding: 12mm 14mm 14mm !important;
        overflow: visible !important;
      }
      body.print-schedule .page-frame {
        position: fixed !important;
        top: 10mm !important;
        right: 10mm !important;
        bottom: 10mm !important;
        left: 10mm !important;
        height: auto !important;
        border: none !important;
        box-shadow: inset 0 0 0 1.5pt #2f3b67 !important;
      }
      body.print-schedule h1 {
        font-size: 11pt !important;
        margin: 0 0 2mm !important;
        padding-bottom: 1mm !important;
      }
      body.print-schedule .meta {
        font-size: 8pt !important;
        margin: 0 0 2mm !important;
      }
      body.print-schedule .schedule-grid {
        font-size: 8pt !important;
        table-layout: fixed !important;
        width: 100% !important;
        border-collapse: collapse !important;
        margin: 0 !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      body.print-schedule .schedule-grid tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      body.print-schedule .schedule-grid th,
      body.print-schedule .schedule-grid td {
        padding: 0.6mm 0.5mm !important;
        line-height: 1.1 !important;
        font-size: 8pt !important;
        word-wrap: break-word !important;
        overflow-wrap: anywhere !important;
        vertical-align: top !important;
        border: 0.4pt solid #333 !important;
      }
      body.print-schedule .schedule-grid thead th {
        font-size: 7.5pt !important;
        font-weight: 700 !important;
        padding: 0.8mm 0.5mm !important;
        background: #f5f7fa !important;
        vertical-align: middle !important;
      }
      body.print-schedule .schedule-grid .period {
        width: 5mm !important;
        font-size: 7.5pt !important;
        font-weight: 700 !important;
        background: #f5f7fa !important;
        vertical-align: middle !important;
        text-align: center !important;
      }
      body.print-schedule .schedule-grid .sched-cell {
        white-space: normal !important;
        text-align: center !important;
      }
      body.print-schedule .schedule-grid .sched-subject {
        white-space: normal !important;
        line-height: 1.05 !important;
        min-height: 0 !important;
        margin: 0 0 0.3mm !important;
        font-size: 7.5pt !important;
      }
      body.print-schedule .schedule-grid .sched-flags {
        font-size: 7pt !important;
        line-height: 1 !important;
        border-top: 0.4pt solid #999 !important;
        padding-top: 0.3mm !important;
        margin-top: 0 !important;
        display: flex !important;
        justify-content: space-around !important;
        gap: 0.5mm !important;
      }
      body.print-schedule .schedule-grid .sched-cell-empty {
        background: #fafbfc !important;
      }
      body.print-schedule .schedule-grid .sched-flag {
        display: inline-block !important;
        font-size: 6.5pt !important;
        font-weight: 700 !important;
        color: #2f3b67 !important;
      }
      body.print-schedule .print-schedule-instructions {
        font-size: 7.5pt !important;
        line-height: 1.25 !important;
        margin: 0 0 2mm !important;
        color: #475569 !important;
      }
      body.print-schedule .table-hint {
        font-size: 7pt !important;
        margin: 1.5mm 0 0 !important;
      }
      /* Inclusion schedule: 4 columns per day = 25 columns total, needs smaller fonts */
      body.print-schedule-inclusion .schedule-grid {
        font-size: 7pt !important;
      }
      body.print-schedule-inclusion .schedule-grid th,
      body.print-schedule-inclusion .schedule-grid td {
        font-size: 7pt !important;
        padding: 0.5mm 0.3mm !important;
      }
      body.print-schedule-inclusion .schedule-grid thead th {
        font-size: 6.5pt !important;
        padding: 0.6mm 0.3mm !important;
      }
      body.print-schedule-inclusion .schedule-grid .period {
        font-size: 6.5pt !important;
        width: 4mm !important;
      }
    }
    ${originalLook ? originalLookCss(schema.id) : ""}
  </style>
</head>
<body${bodyClasses ? ` class="${bodyClasses}"` : ""}>
  <div class="page">
    <div class="page-frame" aria-hidden="true"></div>
    <table class="page-sheet">
      <thead>
        <tr>
          <td>
            <div class="doc-header-screen">${headerHtml}</div>
            ${hasFixedHeader ? `<div class="doc-header-space" aria-hidden="true"></div>` : ""}
          </td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
    <div class="doc-body">
    ${
      originalLookRenderer
        ? originalLookRenderer.body(schema, data, moeSrc)
        : `<h1>${escapeHtml(schema.title)}</h1>
    ${
      schema.id.startsWith("waiver-")
        ? ""
        : `<p class="meta">${escapeHtml(studentName)} · ${escapeHtml(schema.folder)}</p>`
    }
    ${sections}`
    }
    </div>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td><div class="doc-footer-space" aria-hidden="true"></div></td>
        </tr>
      </tfoot>
    </table>
    ${fixedHeaderHtml}
    <footer class="doc-footer">
      ${logoImg(protocolSrc, "לוגו פרוטוקל", "logo-protocol")}
    </footer>
  </div>
</body>
</html>`;
}

export function formSnapshotToFile(
  schema: FormSchema,
  data: Record<string, string>,
  studentName: string,
  logos: DocumentBrandLogos = {}
): File {
  const html = buildFormSnapshotHtml(schema, data, studentName, logos);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return new File([blob], formSnapshotFileName(schema.title), { type: "text/html" });
}

/** בדיקת שדות חובה לפני שמירה כהושלם */
export function validateRequiredFormFields(
  schema: FormSchema,
  data: Record<string, string>
): string | null {
  for (const field of listFormFields(schema)) {
    if (field.type === "static" || field.type === "rating-grid" || field.type === "schedule-grid" || field.type === "row-table" || field.type === "accommodations-picker") continue;
    if (!field.required) continue;
    const value = (data[field.key] ?? "").trim();
    if (field.type === "checkbox") {
      if (value !== "true" && value !== "1" && value !== "on") {
        return `יש לסמן: ${field.label}`;
      }
      continue;
    }
    if (!value) return `יש למלא: ${field.label}`;
  }
  return null;
}
