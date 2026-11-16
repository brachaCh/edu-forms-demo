/**
 * כלים משותפים לפריסות "כמו הטופס המקורי" של משרד החינוך
 * (form-snapshot-referral.ts, form-snapshot-moe-forms.ts).
 *
 * הרינדור הגנרי (form-snapshot.ts) מייצר "תווית : ערך"; כאן בונים את המבנה
 * של המקור ידנית ומזרימים לתוכו את הנתונים.
 */

import type { FormSchema } from "@/lib/form-schemas";
import type { FormFieldDef } from "@/lib/form-fields";
import { listFormFields } from "@/lib/form-schemas";
import { formatSignatureMarkup } from "@/lib/green-signature";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 2026-09-22 → 22/09/2026 (כמו שממלאים ביד); כל ערך אחר נשאר כפי שהוא */
export function formatOriginalDate(raw: string): string {
  const value = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export interface OriginalCtx {
  data: Record<string, string>;
  fieldByKey: Map<string, FormFieldDef>;
}

export function createCtx(
  schema: FormSchema,
  data: Record<string, string>
): OriginalCtx {
  return {
    data,
    fieldByKey: new Map(listFormFields(schema).map((f) => [f.key, f])),
  };
}

export function raw(ctx: OriginalCtx, key: string): string {
  return String(ctx.data[key] ?? "").trim();
}

export function isChecked(ctx: OriginalCtx, key: string): boolean {
  const value = raw(ctx, key);
  return value === "true" || value === "1" || value === "on";
}

/** תווית של שדה static מהסכמה (הטקסטים המשפטיים שמשתנים בין גרסאות הטופס) */
export function staticText(ctx: OriginalCtx, key: string): string {
  return String(ctx.fieldByKey.get(key)?.label ?? "").trim();
}

export function fieldLabel(ctx: OriginalCtx, key: string): string {
  return String(ctx.fieldByKey.get(key)?.label ?? "").trim();
}

/** ערך מוצג: select → תווית האפשרות, date → dd/mm/yyyy */
export function display(ctx: OriginalCtx, key: string): string {
  const value = raw(ctx, key);
  if (!value) return "";
  const field = ctx.fieldByKey.get(key);
  if (field?.type === "select" && field.options) {
    const option = field.options.find((o) => o.value === value);
    if (option) return option.label;
  }
  if (field?.type === "date") return formatOriginalDate(value);
  return value;
}

export function val(ctx: OriginalCtx, key: string): string {
  const shown = display(ctx, key);
  return shown ? `<span class="rq-val">${escapeHtml(shown)}</span>` : "";
}

/** ערך שמוצג משמאל-לימין (ת״ז, טלפון, תאריך, מייל) */
export function ltrVal(ctx: OriginalCtx, key: string): string {
  const shown = display(ctx, key);
  return shown
    ? `<span class="rq-val rq-ltr">${escapeHtml(shown)}</span>`
    : "";
}

/** ערך רב-שורתי (textarea) — שומר ירידות שורה */
export function multiline(ctx: OriginalCtx, key: string): string {
  const shown = display(ctx, key);
  if (!shown) return "";
  return `<div class="rq-text">${escapeHtml(shown).replace(/\r?\n/g, "<br />")}</div>`;
}

/** משבצת X — כמו בטופס המקורי ("לסמן X במשבצות המתאימות") */
export function box(checked: boolean): string {
  return `<span class="rq-box${checked ? " rq-box-on" : ""}">${checked ? "X" : ""}</span>`;
}

/** "תווית: ____" עם קו — כשיש ערך הוא מודפס על הקו */
export function lineField(label: string, valueHtml: string, cls = ""): string {
  return `<span class="rq-line${cls ? ` ${cls}` : ""}"><span class="rq-line-label">${escapeHtml(label)}</span><span class="rq-line-val">${valueHtml}</span></span>`;
}

export function signatureValue(ctx: OriginalCtx, key: string): string {
  const value = raw(ctx, key);
  if (!value) return "";
  return `<span class="rq-sign">${formatSignatureMarkup(value)}</span>`;
}

/** שורת חתימה: "חתימה: ____" */
export function signatureLine(ctx: OriginalCtx, key: string, label = "חתימה:"): string {
  return lineField(label, signatureValue(ctx, key), "rq-line-sig");
}

/**
 * כותרת משרד החינוך כמו בטפסים הרשמיים (מרוכזת). `appendix` — "נספח 6.5" בפינה.
 * `unit` — השורה הרביעית (ברירת מחדל: אגף א' חינוך מיוחד).
 */
export function moeTextHeader(opts?: {
  appendix?: string;
  unitLines?: string[];
  emblemSrc?: string;
}): string {
  const unitLines = opts?.unitLines ?? ["אגף א' חינוך מיוחד"];
  const appendix = opts?.appendix
    ? `<div class="rq-appendix">${escapeHtml(opts.appendix)}</div>`
    : "";
  const emblem = opts?.emblemSrc
    ? `<img class="rq-emblem logo-moe" src="${escapeHtml(opts.emblemSrc)}" alt="סמל משרד החינוך" decoding="sync" />`
    : "";
  return `${appendix}<header class="rq-header rq-moe-text-header">
      ${emblem}
      <p class="rq-state"><b>מדינת ישראל</b></p>
      <p class="rq-ministry-name">משרד החינוך</p>
      <p class="rq-ministry-sub">המינהל הפדגוגי</p>
      ${unitLines.map((line) => `<p class="rq-ministry-sub">${line}</p>`).join("")}
    </header>`;
}

/** CSS משותף — גופן, שורות עם קו, משבצות, חתימות */
export const ORIGINAL_LOOK_BASE_CSS = `
    /* ---- מראה הטופס המקורי (משרד החינוך) ---- */
    body.print-original-look .page-frame { display: none !important; }
    @media screen {
      body.print-original-look .page { border: none; }
    }
    .rq {
      font-family: "David", "Times New Roman", "Frank Ruehl", Arial, serif;
      font-size: 11pt;
      color: #000;
      line-height: 1.3;
      position: relative;
    }
    .rq b { font-weight: 700; }
    .rq p { margin: 0 0 2mm; }
    .rq-appendix {
      position: absolute;
      top: 0;
      left: 0;
      font-size: 10pt;
      direction: ltr;
    }
    .rq-header {
      text-align: center;
      margin: 0 0 3mm;
    }
    .rq-header p { margin: 0; }
    .rq-emblem {
      display: block;
      margin: 0 auto 2mm;
      max-width: 14mm;
      max-height: 14mm;
    }
    .rq-state { font-size: 12pt; }
    .rq-ministry-name { font-size: 15pt; line-height: 1.2; }
    .rq-ministry-sub { font-size: 10pt; line-height: 1.3; }
    .rq-ministry {
      margin: 0 0 2mm;
      font-size: 12pt;
      line-height: 1.35;
    }
    .rq-title {
      margin: 3mm 0 3mm;
      padding: 0;
      border: none;
      width: auto;
      max-width: none;
      text-align: center;
      color: #000;
      font-size: 13pt;
      font-weight: 700;
      line-height: 1.3;
    }
    .rq-title-red { color: #c00000; font-size: 14pt; }
    .rq-intro {
      margin: 0 0 3mm;
      text-align: justify;
      font-size: 11pt;
    }
    .rq-h2 {
      margin: 4mm 0 2mm;
      padding: 0;
      border: none;
      font-size: 12pt;
      font-weight: 700;
    }
    .rq-h2-center { text-align: center; font-size: 13pt; }
    .rq-h2-underline { font-style: italic; text-decoration: underline; }
    .rq-ltr { direction: ltr; unicode-bidi: isolate; }
    .rq-val { display: inline-block; }
    .rq-box {
      display: inline-block;
      width: 5mm;
      height: 5mm;
      border: 1px solid #000;
      line-height: 4.6mm;
      text-align: center;
      font-weight: 700;
      font-size: 10pt;
      vertical-align: middle;
      background: #fff;
    }
    .rq-yesno { white-space: nowrap; font-weight: 400; }
    .rq .rq-text {
      white-space: pre-wrap;
      min-height: 5mm;
      padding: 0.5mm 1mm 0 0;
      line-height: 1.35;
    }
    .rq-checklist { list-style: none; margin: 0 0 3mm; padding: 0; }
    .rq-checklist li { display: flex; gap: 2.5mm; align-items: flex-start; margin: 0 0 1.5mm; }
    .rq-checklist li .rq-box { flex: 0 0 auto; margin-top: 0.5mm; }
    .rq-checklist .rq-text { margin-right: 7.5mm; }

    /* טבלאות פרטים — קווים שחורים כמו במקור.
       width/color עם !important — הכלל הגנרי של th ב-tbody (35%, #333) ספציפי יותר */
    .rq table.rq-grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 0 4mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .rq table.rq-grid th,
    .rq table.rq-grid td {
      border: 1px solid #000;
      padding: 1.2mm 1.5mm;
      font-size: 10pt;
      text-align: center;
      vertical-align: middle;
      width: auto !important;
      color: #000 !important;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .rq table.rq-grid th {
      font-weight: 700;
      background: #fff;
      line-height: 1.2;
    }
    .rq table.rq-grid tbody td { min-height: 7mm; height: 7mm; }
    .rq .rq-opt { font-weight: 700; padding: 1mm; }
    .rq .rq-boxcell { width: 7mm !important; padding: 0.5mm; }
    .rq .rq-right { text-align: right !important; }

    /* שורות "תווית: ____" — קו תחתון כמו במקור.
       בלי min-width:0 — תווית ארוכה (nowrap) גולשת לשורה חדשה ולא נכנסת מתחת לשדה הסמוך */
    .rq-sign-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 2mm 5mm;
      margin: 0 0 3.5mm;
    }
    .rq-line { display: inline-flex; align-items: flex-end; gap: 1.5mm; }
    .rq-line-label { white-space: nowrap; font-weight: 700; }
    .rq-line-val {
      display: inline-block;
      border-bottom: 1px solid #000;
      min-width: 30mm;
      min-height: 5.5mm;
      padding: 0 1.5mm;
      text-align: center;
      flex: 1 1 auto;
    }
    .rq-line-name { flex: 1 1 60mm; }
    .rq-line-sig { flex: 1 1 55mm; }
    .rq-line-date { flex: 0 1 45mm; }
    .rq-line-short { flex: 0 0 auto; }
    .rq-line-short .rq-line-val { flex: 0 0 auto; min-width: 26mm; }
    .rq-line-plain .rq-line-label { font-weight: 400; }
    .rq-line-sig .rq-line-val { min-height: 12mm; display: inline-flex; align-items: flex-end; justify-content: center; }
    .rq-sign .sign-ink, .rq-sign svg, .rq-sign .sign-image {
      display: block;
      max-width: 45mm;
      max-height: 13mm;
      object-fit: contain;
    }
    .rq-sign .sign-received { font-size: 9.5pt; color: #0f766e; font-weight: 700; }
    .rq-footnote { margin: 1mm 0 0; font-size: 9pt; }
    .rq-signatures { margin-top: 4mm; page-break-inside: avoid; break-inside: avoid; }
`;
