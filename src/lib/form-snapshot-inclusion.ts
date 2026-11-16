/**
 * "תוכנית ההכלה" (הכלה.pdf — מערך הפיקוח וההנחיה חינוך מיוחד) — פריסת הדפסה כמו הטופס המקורי.
 *
 * במקור: טבלה של 3 עמודות (הפעולה | תאריכים | הערות) עם שורות כותרת אפורות לכל תחום,
 * ובעמוד האחרון "תיעוד תוכנית ההכלה" — שורות למילוי + חתימות המחנכ/ת והמנהל/ת.
 * הרינדור הגנרי הפיק רשימה; כאן בונים את הטבלה.
 */

import type { FormSchema } from "@/lib/form-schemas";
import type { FormFieldDef } from "@/lib/form-fields";
import {
  createCtx,
  display,
  escapeHtml,
  isChecked,
  lineField,
  ltrVal,
  raw,
  signatureLine,
  staticText,
  val,
  type OriginalCtx,
} from "@/lib/form-snapshot-original-shared";

export const INCLUSION_PLAN_FORM_ID = "moe-inclusion-plan";

/** מקטעים שהם טבלת פעולות (ולא הכותרת / התיעוד / החתימות) */
const NON_TABLE_SECTIONS = new Set(["כותרת", "תיעוד תוכנית ההכלה", "חתימות"]);

const DASH = " — ";

interface ActionRow {
  key: string;
  label: string;
}

function tick(checked: boolean): string {
  return `<span class="rq-box rq-incl-tick${checked ? " rq-box-on" : ""}">${checked ? "✓" : ""}</span>`;
}

/** "מבחינה פיזית (קרוב לשולחן…)" → <b>מבחינה פיזית</b> (קרוב לשולחן…) */
function emphasizedLabel(label: string): string {
  const paren = label.indexOf(" (");
  if (paren <= 0) return escapeHtml(label);
  return `<b>${escapeHtml(label.slice(0, paren))}</b>${escapeHtml(label.slice(paren))}`;
}

function actionRow(ctx: OriginalCtx, row: ActionRow, labelHtml: string): string {
  const checked = isChecked(ctx, row.key);
  const date = display(ctx, `${row.key}_date`);
  const notes = raw(ctx, `${row.key}_notes`);
  return `<tr class="rq-incl-row${checked ? " rq-incl-row-on" : ""}">
      <td class="rq-incl-action">${tick(checked)}<span class="rq-incl-label">${labelHtml}</span></td>
      <td class="rq-incl-date">${date ? `<span class="rq-ltr">${escapeHtml(date)}</span>` : ""}</td>
      <td class="rq-incl-notes">${notes ? escapeHtml(notes).replace(/\r?\n/g, "<br />") : ""}</td>
    </tr>`;
}

function leadRow(text: string): string {
  return `<tr class="rq-incl-lead"><td colspan="3">${escapeHtml(text)}</td></tr>`;
}

function sectionTitleRow(title: string): string {
  return `<tr class="rq-incl-section"><td colspan="3">${escapeHtml(title)}</td></tr>`;
}

/**
 * שורות הפעולות של מקטע. תוויות עם קידומת משותפת ("בחירת מקום ישיבה… — מבחינה פיזית")
 * מקבלות שורת פתיחה משותפת ואז שורות עם החלק השני בלבד — כמו במקור.
 */
function sectionRows(ctx: OriginalCtx, fields: FormFieldDef[]): string {
  const rows: ActionRow[] = fields
    .filter((field) => field.type === "checkbox")
    .map((field) => ({ key: field.key, label: String(field.label ?? "").trim() }));

  const out: string[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    const dash = row.label.indexOf(DASH);
    if (dash > 0) {
      const prefix = row.label.slice(0, dash);
      // אוספים את כל השורות הרצופות עם אותה קידומת
      let end = index;
      while (
        end < rows.length &&
        rows[end].label.startsWith(`${prefix}${DASH}`)
      ) {
        end += 1;
      }
      if (end - index >= 2) {
        out.push(leadRow(`${prefix}:`));
        for (let i = index; i < end; i += 1) {
          const suffix = rows[i].label.slice(prefix.length + DASH.length);
          out.push(actionRow(ctx, rows[i], emphasizedLabel(suffix)));
        }
        index = end;
        continue;
      }
    }
    out.push(actionRow(ctx, row, emphasizedLabel(row.label)));
    index += 1;
  }
  return out.join("");
}

function actionsTable(ctx: OriginalCtx, schema: FormSchema): string {
  const sections = schema.sections.filter(
    (section) => !NON_TABLE_SECTIONS.has((section.title ?? "").trim())
  );
  const body = sections
    .map((section) => {
      // "סביבה תומכת — פניה או הפניה ל" → כותרת אפורה + שורת פתיחה מודגשת
      const title = (section.title ?? "").trim();
      const dash = title.indexOf(DASH);
      const heading = dash > 0 ? title.slice(0, dash) : title;
      const lead = dash > 0 ? `${title.slice(dash + DASH.length)}:` : "";
      return `<tbody class="rq-incl-group">
        ${sectionTitleRow(heading)}
        ${lead ? `<tr class="rq-incl-lead rq-incl-lead-strong"><td colspan="3">${escapeHtml(lead)}</td></tr>` : ""}
        ${sectionRows(ctx, section.fields)}
      </tbody>`;
    })
    .join("");

  return `<table class="rq-grid rq-incl-table">
      <colgroup>
        <col class="rq-incl-col-action" />
        <col class="rq-incl-col-date" />
        <col class="rq-incl-col-notes" />
      </colgroup>
      <thead>
        <tr>
          <th class="rq-incl-th-action">הפעולה:</th>
          <th>תאריכים</th>
          <th>הערות</th>
        </tr>
      </thead>
      ${body}
    </table>`;
}

/** "תווית: ____" ואז שורות מסורגלות — כמו בעמוד התיעוד במקור */
function ruledBlock(
  ctx: OriginalCtx,
  label: string,
  key: string,
  minLines: number
): string {
  const text = raw(ctx, key);
  const textHtml = text ? escapeHtml(text).replace(/\r?\n/g, "<br />") : "";
  return `<div class="rq-incl-ruled" style="--rq-incl-lines:${minLines}">
      <span class="rq-incl-ruled-label">${escapeHtml(label)}</span><span class="rq-incl-ruled-text">${textHtml}</span>
    </div>`;
}

function documentationPage(ctx: OriginalCtx): string {
  return `<section class="rq-incl-doc">
      ${unitHeader()}
      <h2 class="rq-h2 rq-h2-center rq-incl-doc-title">תיעוד תוכנית ההכלה</h2>
      <div class="rq-sign-row rq-incl-doc-line">
        ${lineField("שם התלמיד/ה:", val(ctx, "full_name"), "rq-line-name")}
        ${lineField("כתה:", val(ctx, "class_name"), "rq-line-date")}
      </div>
      <div class="rq-sign-row rq-incl-doc-line">
        ${lineField("שם המחנכ/ת:", val(ctx, "homeroom_teacher"), "rq-line-name")}
        ${lineField("שנת הלימודים:", ltrVal(ctx, "school_year"), "rq-line-date")}
      </div>
      ${ruledBlock(ctx, "יעדי ההכלה:", "inclusion_goals", 2)}
      <p class="rq-incl-doc-sub">${escapeHtml(staticText(ctx, "summary_intro") || "סיכום הפעולות שננקטו כדי לסייע לתלמיד/ה:")}</p>
      ${ruledBlock(ctx, "במסגרת הכיתה:", "summary_classroom", 3)}
      ${ruledBlock(ctx, "במילוי חובות בית ספריות:", "summary_school_duties", 3)}
      ${ruledBlock(ctx, "בתמיכה לימודית:", "summary_learning", 3)}
      ${ruledBlock(ctx, "בקשיי התנהגות:", "summary_behavior", 3)}
      ${ruledBlock(ctx, "פניה לגורמים נוספים מחוץ לבית הספר:", "summary_external", 3)}
      ${ruledBlock(ctx, "הערכת המחנכ/ת בעקבות תוכנית ההכלה:", "teacher_evaluation", 3)}
      <div class="rq-sign-row rq-signatures rq-incl-signatures">
        ${signatureLine(ctx, "teacher_sign", "חתימת המחנכ/ת")}
        ${signatureLine(ctx, "principal_sign", "חתימת המנהל/ת")}
      </div>
    </section>`;
}

/** "מערך הפיקוח וההנחיה חינוך מיוחד" — הפס הכחול בראש כל עמוד במקור */
function unitHeader(): string {
  return `<p class="rq-incl-unit">מערך הפיקוח וההנחיה חינוך מיוחד</p>`;
}

export function buildInclusionPlanBodyHtml(
  schema: FormSchema,
  data: Record<string, string>
): string {
  const ctx = createCtx(schema, data);
  const instructions =
    staticText(ctx, "form_instructions") || "סמנ/י ✓ ליד פעולות שנקטת בהן וציינ/י תאריכים";

  return `<div class="rq rq-incl">
    ${unitHeader()}
    <div class="rq-sign-row rq-incl-student">
      ${lineField("שם התלמיד", val(ctx, "full_name"), "rq-line-name rq-incl-student-line")}
    </div>
    <h1 class="rq-title rq-incl-title">תוכנית ההכלה</h1>
    <p class="rq-incl-instructions">${escapeHtml(instructions)}</p>
    ${actionsTable(ctx, schema)}
    ${documentationPage(ctx)}
  </div>`;
}

export const INCLUSION_PLAN_PRINT_CSS = `
    .rq-incl { font-family: Arial, "Segoe UI", "David", sans-serif; }
    .rq-incl-unit {
      margin: 0 0 4mm;
      padding: 0 0 1mm;
      border-bottom: 1.5px solid #1f4e79;
      color: #1f4e79;
      font-size: 12pt;
      font-weight: 700;
      text-align: right;
    }
    .rq-incl-student { margin: 0 0 2mm; justify-content: flex-start; }
    .rq-incl-student-line { flex: 0 1 75mm; }
    .rq-incl-student-line .rq-line-label { font-size: 12pt; }
    .rq-incl-title { margin: 1mm 0 1mm; font-size: 15pt; }
    .rq-incl-instructions { margin: 0 0 2.5mm; text-align: center; font-size: 11pt; }

    /* הטבלה — 3 עמודות, שורות כותרת אפורות; מותר לשבור בין עמודים */
    .rq table.rq-incl-table {
      page-break-inside: auto;
      break-inside: auto;
      border: 1.5px solid #7f7f7f;
    }
    .rq table.rq-incl-table th,
    .rq table.rq-incl-table td {
      border: 1px solid #7f7f7f;
      text-align: right;
      font-size: 10.5pt;
      padding: 1.4mm 2mm;
      line-height: 1.3;
    }
    .rq table.rq-incl-table thead th {
      font-size: 11pt;
      background: #f2f2f2;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .rq table.rq-incl-table thead th:not(.rq-incl-th-action) { text-align: center; }
    .rq table.rq-incl-table thead { display: table-header-group; }
    .rq table.rq-incl-table tbody tr { page-break-inside: avoid; break-inside: avoid; }
    .rq table.rq-incl-table tbody td { height: 7.5mm; min-height: 7.5mm; vertical-align: middle; }
    .rq table.rq-incl-table .rq-incl-section td {
      background: #e7e6e6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      text-align: center;
      font-weight: 700;
      font-size: 12pt;
      height: 8.5mm;
    }
    .rq table.rq-incl-table .rq-incl-lead td { font-weight: 400; }
    .rq table.rq-incl-table .rq-incl-lead-strong td { font-weight: 700; font-size: 11pt; }
    .rq-incl-col-action { width: 56%; }
    .rq-incl-col-date { width: 20%; }
    .rq-incl-col-notes { width: 24%; }
    /* המשבצת צפה מימין, התווית ממלאת את השאר (בלי flex — שובר פריסת td) */
    .rq table.rq-incl-table td.rq-incl-action .rq-incl-tick {
      float: right;
      margin: 0 0 0 2mm;
      width: 4.5mm;
      height: 4.5mm;
      line-height: 4.2mm;
      font-size: 11pt;
      border-color: #7f7f7f;
    }
    .rq table.rq-incl-table .rq-incl-row-on .rq-incl-tick { border-color: #000; }
    .rq-incl-label { display: block; overflow: hidden; }
    .rq table.rq-incl-table td.rq-incl-date { text-align: center; }
    .rq table.rq-incl-table td.rq-incl-notes { font-size: 10pt; }

    /* עמוד התיעוד */
    .rq-incl-doc { page-break-before: always; break-before: page; }
    .rq-incl-doc-title { margin: 1mm 0 4mm; font-size: 15pt; }
    .rq-incl-doc-line { margin: 0 0 3mm; }
    .rq-incl-doc-line .rq-line-label { font-size: 11.5pt; }
    .rq-incl-doc-sub { margin: 3mm 0 1mm; font-size: 11.5pt; }
    .rq-incl-ruled {
      position: relative;
      margin: 0 0 3mm;
      /* שורות במרווח 7.5mm — הטקסט "יושב" על הקווים (קו אחד בתחתית כל אריח) */
      --rq-incl-line: 7.5mm;
      min-height: calc(var(--rq-incl-lines, 3) * var(--rq-incl-line));
      line-height: var(--rq-incl-line);
      background-image: linear-gradient(to bottom, transparent calc(100% - 0.3mm), #000 0);
      background-size: 100% var(--rq-incl-line);
      background-repeat: repeat-y;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      page-break-inside: avoid;
      break-inside: avoid;
      font-size: 11pt;
    }
    .rq-incl-ruled-label { font-weight: 700; font-size: 11.5pt; margin-left: 2mm; }
    .rq-incl-ruled-text { white-space: pre-wrap; }
    .rq-incl-signatures { margin-top: 8mm; margin-bottom: 0; justify-content: space-between; }
    .rq-incl-signatures .rq-line { flex: 0 1 47%; }
    .rq-incl-signatures .rq-line-label { font-size: 11.5pt; }
`;
