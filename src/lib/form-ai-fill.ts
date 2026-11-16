/**
 * מילוי טופס בעזרת AI — זמין לטפסים בתיקיות תח"י, תל"א ותיעוד תהליך למידה,
 * וגם לשאלוני הפניה (כולל בכניסה חופשית).
 * לא זמין לטפסי מערכת שעות ושאלוני הורים/תלמיד.
 */

import type { FormFieldDef } from "@/lib/form-fields";
import type { FormSchema } from "@/lib/form-schemas";
import { sameHebrewFolderName } from "@/lib/hebrew-quotes";
import { isStaffFillForm } from "@/lib/homeroom-fill-forms";
import { isParentQuestionnaireForm } from "@/lib/parent-questionnaire-email";
import {
  FORM_TABLE_DEFS,
  getTableIdFromFieldKey,
  resolveTableRowCount,
  tableCellKey,
  tableRowCountKey,
} from "@/lib/form-table-grids";

export const AI_FILL_CATEGORY_FOLDERS = new Set([
  'תח"י',
  'תל"א',
  "תיעוד תהליך למידה",
]);

/** טפסים ספציפיים שמקבלים AI גם מחוץ לתיקיות הרשימה (למשל שאלון הפניה) */
export const AI_FILL_EXTRA_FORM_IDS = new Set([
  "referral-questionnaire",
  "referral-questionnaire-kindergarten",
]);

export function categoryFolderSupportsAiFill(categoryFolder: string): boolean {
  const folder = categoryFolder.trim();
  if (!folder) return false;
  if (AI_FILL_CATEGORY_FOLDERS.has(folder)) return true;
  for (const allowed of AI_FILL_CATEGORY_FOLDERS) {
    if (sameHebrewFolderName(folder, allowed)) return true;
  }
  return false;
}

/** שאלוני תלמיד/הורים + הערכה מעצבת + התאמות — לא מילוי AI */
const AI_FILL_EXCLUDED_FORM_IDS = new Set([
  "student-questionnaire",
  "parent-questionnaire",
  "parent-questionnaire-tla",
  "moe-parent-questionnaire-alt",
  "formative-assessment-table",
  "formative-assessment-verbal",
  "referral-questionnaire-multidisciplinary",
  "accommodations",
]);

function formHasScheduleGrid(
  schema: Pick<FormSchema, "sections">
): boolean {
  return schema.sections.some((section) =>
    section.fields.some((field) => field.type === "schedule-grid")
  );
}

export function formSupportsAiFill(
  schema:
    | Pick<FormSchema, "id" | "categoryFolder" | "sections" | "folder" | "title">
    | null
    | undefined,
  opts?: { freeAccess?: boolean }
): boolean {
  if (!schema) return false;
  if (AI_FILL_EXCLUDED_FORM_IDS.has(schema.id)) return false;
  if (isParentQuestionnaireForm(schema)) return false;
  const folderOrTitle = `${schema.folder ?? ""} ${schema.title ?? ""}`;
  if (/שאלון\s*(הורים|תלמיד|להורים)/.test(folderOrTitle)) return false;
  // מערכת שעות — מילוי AI לא רלוונטי
  if (formHasScheduleGrid(schema)) return false;

  // בכניסה חופשית — AI רק בשאלון הפניה
  if (opts?.freeAccess) {
    return AI_FILL_EXTRA_FORM_IDS.has(schema.id);
  }

  if (AI_FILL_EXTRA_FORM_IDS.has(schema.id)) return true;
  if (!categoryFolderSupportsAiFill(schema.categoryFolder)) return false;
  return true;
}

/**
 * מילוי AI בדף הקישור הציבורי (/fill) — רק טפסים שכבר מאושרים בתוך האפליקציה
 * ושאפשר לשלוח לאיש צוות. בלי שאלוני הורים, בלי שאלון תלמיד (ראיון חי),
 * ובלי הקשר תלמיד מעבר לשדות שכבר בטופס שנשלח.
 */
export function formSupportsPublicLinkAiFill(
  schema:
    | Pick<FormSchema, "id" | "categoryFolder" | "sections" | "folder" | "title">
    | null
    | undefined
): boolean {
  return formSupportsAiFill(schema) && isStaffFillForm(schema);
}

export function isReferralQuestionnaireAiForm(
  schema: Pick<FormSchema, "id"> | null | undefined
): boolean {
  return Boolean(schema && AI_FILL_EXTRA_FORM_IDS.has(schema.id));
}

export type AiFillFieldDescriptor = {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
  hint?: string;
};

/** שדות שה-AI לא ממלא (חתימות / סטטי / מפתח טבלה / מערכת שעות) */
function isAiFillableField(field: FormFieldDef): boolean {
  const type = field.type ?? "text";
  if (type === "static" || type === "signature") return false;
  if (type === "row-table" || type === "schedule-grid" || type === "rating-grid")
    return false;
  if (type === "accommodations-picker") return false;
  return true;
}

const TABLE_CELL_KEY_RE = /^tbl_(.+)_r(\d+)_/;

/**
 * משחזר את ערכי הטופס החיים מבקשת מילוי AI ציבורית, כדי שטבלאות
 * יעדים יכללו את השורות שהמורה הוסיפה — לא רק defaultRows.
 * מפתחות תא נוספים (r4, r5, …) מעלים את מספר השורות גם בלי `tbl_*_rows`.
 */
export function currentFormDataFromAiFields(
  fields:
    | Array<{ key?: string; currentValue?: string } | undefined>
    | undefined
): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of fields ?? []) {
    if (!field) continue;
    const key = typeof field.key === "string" ? field.key.trim() : "";
    if (!key) continue;
    const value =
      typeof field.currentValue === "string" ? field.currentValue : "";
    if (!(key in data)) data[key] = value;
  }

  const maxRowByTable = new Map<string, number>();
  for (const key of Object.keys(data)) {
    const match = key.match(TABLE_CELL_KEY_RE);
    if (!match?.[1]) continue;
    maxRowByTable.set(
      match[1],
      Math.max(maxRowByTable.get(match[1]) ?? -1, Number(match[2]))
    );
  }
  for (const [tableId, maxRow] of maxRowByTable) {
    const countKey = tableRowCountKey(tableId);
    const fromCount = Number.parseInt(data[countKey] ?? "", 10);
    const inferred = Math.min(maxRow + 1, 30);
    if (!Number.isFinite(fromCount) || fromCount < inferred) {
      data[countKey] = String(inferred);
    }
  }
  return data;
}

/** בונה רשימת שדות (כולל תאי טבלה) לשליחה ל-API */
export function buildAiFillFieldDescriptors(
  schema: FormSchema,
  data: Record<string, string>
): AiFillFieldDescriptor[] {
  const out: AiFillFieldDescriptor[] = [];

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const type = field.type ?? "text";

      if (isAiFillableField(field)) {
        out.push({
          key: field.key,
          label: field.label,
          type,
          options: field.options,
          hint: field.hint,
        });
        continue;
      }

      if (type === "row-table") {
        const tableId = getTableIdFromFieldKey(field.key);
        if (!tableId) continue;
        const def = FORM_TABLE_DEFS[tableId];
        if (!def) continue;
        const rows = resolveTableRowCount(tableId, data);
        if (!def.rowKeys?.length) {
          out.push({
            key: tableRowCountKey(tableId),
            label: `${field.label} — מספר שורות`,
            type: "number",
            hint: `ברירת מחדל ${def.defaultRows}, מקסימום 30`,
          });
        }
        for (let r = 0; r < rows; r += 1) {
          for (const col of def.columns) {
            if (col.aiFillable === false) continue;
            out.push({
              key: tableCellKey(tableId, r, col.key),
              label: `${def.rowLabels?.[r] ?? `${field.label} · שורה ${r + 1}`} · ${col.label}`,
              type: col.input === "checkbox" ? "checkbox" : "textarea",
            });
          }
        }
      }
    }
  }

  return out;
}

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toFillString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

const COLUMN_ALIASES: Record<string, string> = {
  goal: "goal",
  יעד: "goal",
  יעדים: "goal",
  teacher: "teacher",
  מורה: "teacher",
  opportunities: "teacher",
  aide: "aide",
  סייעת: "aide",
  other: "other",
  אחר: "other",
  formative: "formative",
  "הערכה מעצבת": "formative",
  followup: "formative",
  summative: "summative",
  "הערכה מסכמת": "summative",
  notes: "notes",
  הערות: "notes",
  timeframe: "timeframe",
  methods: "methods",
  criteria: "criteria",
};

function tableIdsFromAllowed(allowedKeys: Set<string>): string[] {
  const ids = new Set<string>();
  for (const key of allowedKeys) {
    const match = key.match(/^tbl_(.+)_r\d+_/);
    if (match?.[1]) ids.add(match[1]);
  }
  return [...ids];
}

function resolveColumnKey(tableId: string, raw: string): string {
  const def = FORM_TABLE_DEFS[tableId];
  const norm = normalizeLookup(raw);
  if (def) {
    const byKey = def.columns.find(
      (col) => col.key === raw || normalizeLookup(col.key) === norm
    );
    if (byKey) return byKey.key;
    const byLabel = def.columns.find((col) => {
      const label = normalizeLookup(col.label);
      return label === norm || label.startsWith(norm) || norm.startsWith(label);
    });
    if (byLabel) return byLabel.key;
  }
  return COLUMN_ALIASES[norm] ?? raw;
}

function pickTableIdForArray(key: string, tableIds: string[]): string | null {
  if (tableIds.length === 0) return null;
  const norm = normalizeLookup(key);
  const byId = tableIds.find((id) => norm.includes(normalizeLookup(id)));
  if (byId) return byId;
  if (
    /goal|יעד|row|שור|integrative|אינטגר/.test(norm) ||
    norm === "goals" ||
    norm === "rows"
  ) {
    return (
      tableIds.find((id) => id.includes("integrative")) ??
      tableIds.find((id) => id.includes("goals")) ??
      tableIds[0] ??
      null
    );
  }
  return tableIds.length === 1 ? tableIds[0] : null;
}

/**
 * ממיר תשובת AI (מפתחות מדויקים, תוויות עבריות או מערך יעדים)
 * למפתחות השדות שהטופס מצפה להם.
 */
export function flattenAiFillPatch(
  parsed: Record<string, unknown>,
  allowedKeys: Set<string>,
  labelToKey?: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  const tableIds = tableIdsFromAllowed(allowedKeys);
  const labels = new Map<string, string>();
  if (labelToKey) {
    for (const [label, key] of Object.entries(labelToKey)) {
      if (label.trim() && allowedKeys.has(key)) {
        labels.set(normalizeLookup(label), key);
      }
    }
  }

  function assign(key: string, value: unknown) {
    if (!allowedKeys.has(key)) return;
    const text = toFillString(value);
    if (!text || out[key]) return;
    out[key] = text;
  }

  function resolveKey(rawKey: string): string | null {
    if (allowedKeys.has(rawKey)) return rawKey;
    const byLabel = labels.get(normalizeLookup(rawKey));
    if (byLabel) return byLabel;
    return null;
  }

  function mapRowObject(
    tableId: string,
    rowIndex: number,
    row: Record<string, unknown>
  ) {
    for (const [colRaw, value] of Object.entries(row)) {
      const columnKey = resolveColumnKey(tableId, colRaw);
      assign(tableCellKey(tableId, rowIndex, columnKey), value);
    }
  }

  function mapArray(key: string, items: unknown[]) {
    const tableId = pickTableIdForArray(key, tableIds);
    if (!tableId) return;
    let rowIndex = 0;
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      mapRowObject(tableId, rowIndex, item as Record<string, unknown>);
      rowIndex += 1;
    }
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const resolved = resolveKey(key);
      if (resolved) assign(resolved, value);
      continue;
    }

    if (Array.isArray(value)) {
      mapArray(key, value);
      continue;
    }

    if (!value || typeof value !== "object") continue;

    const obj = value as Record<string, unknown>;
    const nestedKeys = Object.keys(obj);
    const looksLikeRows = nestedKeys.every(
      (nested) => /^\d+$/.test(nested) || /^r\d+$/i.test(nested)
    );
    if (looksLikeRows) {
      mapArray(
        key,
        nestedKeys
          .slice()
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map((nested) => obj[nested])
      );
      continue;
    }

    const looksLikeRow = nestedKeys.some((nested) => {
      const col = resolveColumnKey(tableIds[0] ?? "", nested);
      return Boolean(
        tableIds[0] &&
          FORM_TABLE_DEFS[tableIds[0]]?.columns.some((c) => c.key === col)
      );
    });
    if (looksLikeRow) {
      mapArray(key, [obj]);
      continue;
    }

    for (const [nestedKey, nestedValue] of Object.entries(obj)) {
      const resolved = resolveKey(nestedKey);
      if (resolved) assign(resolved, nestedValue);
    }
  }

  const maxRowByTable = new Map<string, number>();
  for (const key of Object.keys(out)) {
    const match = key.match(/^tbl_(.+)_r(\d+)_/);
    if (!match?.[1]) continue;
    maxRowByTable.set(
      match[1],
      Math.max(maxRowByTable.get(match[1]) ?? -1, Number(match[2]))
    );
  }
  for (const [tableId, maxRow] of maxRowByTable) {
    const countKey = tableRowCountKey(tableId);
    if (allowedKeys.has(countKey) && !(out[countKey] ?? "").trim()) {
      out[countKey] = String(maxRow + 1);
    }
  }

  return out;
}

/**
 * ממזג תשובת AI לתוך הנתונים הקיימים.
 * לא דורס שדות שכבר מולאו (אלא אם overwriteFilled=true).
 * לא נוגע בחתימות.
 */
export function mergeAiFillIntoData(
  current: Record<string, string>,
  patch: Record<string, string>,
  allowedKeys: Set<string>,
  opts?: { overwriteFilled?: boolean }
): Record<string, string> {
  const overwrite = opts?.overwriteFilled ?? false;
  const next = { ...current };
  for (const [key, raw] of Object.entries(patch)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    const existing = (next[key] ?? "").trim();
    if (existing && !overwrite) continue;
    next[key] = value;
  }
  return next;
}

function fieldText(data: Record<string, string>, key: string): string {
  return (data[key] ?? "").trim();
}

/**
 * Applies an AI patch to the *current* form after a long request.
 * Fills fields that are still empty, or still equal to the request-start
 * snapshot. Never overwrites a field the teacher edited while waiting.
 *
 * When `refine` is true (a follow-up click with teacher notes), allows updating
 * fields that already have values — as long as the teacher didn't edit them
 * during the request AND the field is either empty or still holds the value
 * the AI wrote in the previous fill (tracked via `lastAiValues`).
 *
 * This prevents overwriting fields the teacher filled manually before clicking
 * (baseline values that didn't come from AI).
 */
export function mergeAiFillIntoCurrentData(
  current: Record<string, string>,
  baseline: Record<string, string>,
  patch: Record<string, string>,
  allowedKeys: Set<string>,
  opts?: {
    refine?: boolean;
    lastAiValues?: Record<string, string>;
  }
): Record<string, string> {
  const refine = opts?.refine ?? false;
  const lastAiValues = opts?.lastAiValues ?? {};
  const next = { ...current };
  for (const [key, raw] of Object.entries(patch)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    const existing = fieldText(next, key);
    const started = fieldText(baseline, key);
    if (existing !== started) continue;
    if (existing && !refine) continue;
    if (existing && refine) {
      const lastAi = fieldText(lastAiValues, key);
      const refinable = lastAi !== "" && existing === lastAi;
      if (!refinable) continue;
    }
    next[key] = value;
  }
  return next;
}
