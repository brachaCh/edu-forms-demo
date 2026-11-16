import {
  isParentCompanionIdField,
  isParentSignatureField,
  formatCheckboxMark,
  type FormFieldDef,
} from "@/lib/form-fields";
import {
  FORM_TABLE_DEFS,
  getTableIdFromFieldKey,
  resolveTableRowCount,
  tableCellKey,
} from "@/lib/form-table-grids";
import type { FormSchema } from "@/lib/form-schemas";
import { listFormFields } from "@/lib/form-schemas";

const STRUCTURAL_TYPES = new Set([
  "static",
  "rating-grid",
  "schedule-grid",
  "row-table",
  "accommodations-picker",
]);

/** שדה משותף לכל החותמים — לפי תיעוד SimpleSign (`signer: 0`) */
export const SIMPLESIGN_SHARED_SIGNER_SLOT = 0;

const SIGNER_PRIVATE_INPUT_KEYS = new Set([
  "full_name",
  "id_number",
  "phone",
  "email",
  "date",
  "signature",
]);

/** ת.ז. הורים בוויתור סודיות — ההורים ממלאים ב-SimpleSign, לא נשלח ממתוה */
function isWaiverParentIdPrefillKey(schema: FormSchema, key: string): boolean {
  if (!schema.id.startsWith("waiver-")) return false;
  return isParentCompanionIdField(key) || key.trim() === "parent_guardian_id";
}

function isSignerPrivateInput(input: SimpleSignDocumentInput): boolean {
  if (input.type === "signature") return true;
  if (
    input.signer == null ||
    input.signer === SIMPLESIGN_SHARED_SIGNER_SLOT
  ) {
    return false;
  }
  return SIGNER_PRIVATE_INPUT_KEYS.has(normalizeMappingToken(input.key));
}

export interface SimpleSignDocumentInput {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  /** 0 = שדה משותף לכל החותמים; 1+ = חותם ספציפי */
  signer?: number;
}

function normalizeMappingToken(value: string): string {
  return value.trim().toLowerCase();
}

function formatSelect(field: FormFieldDef, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const option = field.options?.find((o) => o.value === trimmed);
  return option?.label ?? trimmed;
}

const LTR_EMBED = "\u202D";
const POP_DIRECTION = "\u202C";
/** Figure space — same width as a digit, does not collapse like a regular space */
const SCALE_SLOT = "\u2007";

/** Overlay for 1–9 PDF checkbox rows: V in the selected slot, empty slots otherwise. */
export function formatFuncScaleOverlay(value: string): string {
  const n = Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(n) || n < 1 || n > 9) return "";
  const slots = Array.from({ length: 9 }, () => SCALE_SLOT);
  slots[n - 1] = "V";
  return `${LTR_EMBED}${slots.join("")}${POP_DIRECTION}`;
}

function isFuncScaleSelect(field: FormFieldDef): boolean {
  if (field.type !== "select" || !field.key.startsWith("func_")) return false;
  const values = field.options?.map((option) => option.value) ?? [];
  return (
    values.length === 9 && values.every((value, index) => value === String(index + 1))
  );
}

/** פרטני/קבוצתי נשלח כטקסט (תווית האפשרות), לא כזוג תיבות סימון. */
function isSupportSettingSelect(field: FormFieldDef): boolean {
  if (field.type !== "select") return false;
  const values = field.options?.map((option) => option.value) ?? [];
  return values.length === 2 && values.includes("individual") && values.includes("group");
}

function flattenRowTable(tableId: string, data: Record<string, string>): string {
  const def = FORM_TABLE_DEFS[tableId];
  if (!def) return "";
  const rows = resolveTableRowCount(tableId, data);
  const lines: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const parts: string[] = [];
    const rowLabel = def.rowLabels?.[row];
    if (rowLabel) parts.push(rowLabel);
    if (def.otherLabelFieldKey && def.rowKeys?.[row] === "other") {
      const other = String(data[def.otherLabelFieldKey] ?? "").trim();
      if (other) parts.push(other);
    }
    for (const col of def.columns) {
      const cell = String(
        data[tableCellKey(tableId, row, col.key)] ?? ""
      ).trim();
      if (!cell) continue;
      const shown = col.input === "checkbox" ? formatCheckboxMark(cell) : cell;
      if (shown) parts.push(`${col.label}: ${shown}`);
    }
    if (parts.length) lines.push(parts.join(" | "));
  }
  return lines.join("\n");
}

function formatFieldValue(field: FormFieldDef, raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (field.type === "checkbox") return formatCheckboxMark(value);
  if (field.type === "select") {
    if (isFuncScaleSelect(field)) return formatFuncScaleOverlay(value);
    return formatSelect(field, value);
  }
  return value;
}

/** ערכי prefill לפי מפתחי מתוה (לפני מיפוי ל-SimpleSign) */
export function buildMatoahPrefillValues(
  schema: FormSchema,
  data: Record<string, string>
): Record<string, string> {
  const prefill: Record<string, string> = {};
  const fields = listFormFields(schema);
  const tableBlocks = new Set<string>();

  for (const field of fields) {
    if (field.type && STRUCTURAL_TYPES.has(field.type)) {
      if (field.type === "row-table") {
        const tableId = getTableIdFromFieldKey(field.key);
        if (tableId && !tableBlocks.has(tableId)) {
          tableBlocks.add(tableId);
          const block = flattenRowTable(tableId, data);
          if (block) {
            prefill[`${tableId}_block`] = block.slice(0, 8000);
          }
          const def = FORM_TABLE_DEFS[tableId];
          if (def) {
            const rows = resolveTableRowCount(tableId, data);
            for (let row = 0; row < rows; row += 1) {
              for (const col of def.columns) {
                const cellKey = tableCellKey(tableId, row, col.key);
                const cell = String(data[cellKey] ?? "").trim();
                if (!cell) continue;
                prefill[cellKey] =
                  col.input === "checkbox"
                    ? formatCheckboxMark(cell)
                    : cell.slice(0, 4000);
              }
            }
            if (def.otherLabelFieldKey) {
              const other = String(data[def.otherLabelFieldKey] ?? "").trim();
              if (other) prefill[def.otherLabelFieldKey] = other.slice(0, 4000);
            }
          }
        }
      }
      continue;
    }
    if (field.type === "signature") {
      if (isParentSignatureField(field.key)) continue;
      continue;
    }
    if (isWaiverParentIdPrefillKey(schema, field.key)) continue;
    const formatted = formatFieldValue(field, data[field.key] ?? "");
    if (formatted) prefill[field.key] = formatted.slice(0, 4000);
    if (
      field.type === "select" &&
      !isFuncScaleSelect(field) &&
      !isSupportSettingSelect(field)
    ) {
      const optionValue = String(data[field.key] ?? "").trim();
      const option = field.options?.find((item) => item.value === optionValue);
      if (option) {
        prefill[`${field.key}_${optionValue}`] = formatCheckboxMark("true");
      }
    }
  }

  return prefill;
}

export function parseSimpleSignDocumentInputs(
  payload: Record<string, unknown>
): SimpleSignDocumentInput[] {
  const raw = payload.inputs;
  if (!Array.isArray(raw)) return [];
  const inputs: SimpleSignDocumentInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const key = String(row.key ?? "").trim();
    const label = String(row.label ?? "").trim();
    const type = String(row.type ?? "text").trim();
    if (!key) continue;
    inputs.push({
      key,
      label,
      type,
      required: Boolean(row.required),
      signer:
        typeof row.signer === "number" && Number.isInteger(row.signer)
          ? row.signer
          : undefined,
    });
  }
  return inputs;
}

/**
 * בונה מפה: מפתח-מתוה (מנורמל) → key של SimpleSign.
 *
 * מאז 09/2026 SimpleSign מפרידים בין `key` (מפתח ל-API, מה שאנחנו שולחים) ל-`label`
 * (מה שההורה רואה, בעברית). לכן ההתאמה לפי `key` היא המקור האמין; התאמה לפי `label`
 * נשמרת רק לתאימות לתבניות ישנות שבהן התווית הייתה המפתח, ולא דורסת התאמת `key`.
 */
function buildSimpleSignKeyLookup(
  inputs: SimpleSignDocumentInput[],
  skip: (input: SimpleSignDocumentInput) => boolean
): Map<string, string> {
  // סדר עדיפות (מהנמוך לגבוה — כל שכבה דורסת את הקודמת):
  //   1. תווית של שדה מובנה     2. key של שדה מובנה
  //   3. תווית של שדה מותאם     4. key של שדה מותאם
  // השדות המובנים (full_name, id_number…) שייכים לחותם ולא ניתן לשנות את ה-key
  // שלהם, לכן שדה מותאם שסומן בתווית/מפתח של מתוה מנצח אותם (למשל `full_name`
  // של התלמיד מול `full_name` המובנה של החותם).
  const isBuiltIn = (input: SimpleSignDocumentInput) =>
    SIGNER_PRIVATE_INPUT_KEYS.has(normalizeMappingToken(input.key));
  const layers: Array<[string, string]>[] = [[], [], [], []];
  for (const input of inputs) {
    if (skip(input)) continue;
    const base = isBuiltIn(input) ? 0 : 2;
    if (input.label) {
      layers[base]!.push([normalizeMappingToken(input.label), input.key]);
    }
    layers[base + 1]!.push([normalizeMappingToken(input.key), input.key]);
  }
  const lookup = new Map<string, string>();
  for (const layer of layers) {
    for (const [token, key] of layer) lookup.set(token, key);
  }
  return lookup;
}

/**
 * ממפה ערכי מתוה ל-prefill של SimpleSign.
 * SimpleSign מקבל רק key — מגדירים ב-SimpleSign «מפתח ל-API» = מפתח מתוה (התווית חופשית).
 */
export function mapPrefillToSimpleSignKeys(
  matoahPrefill: Record<string, string>,
  inputs: SimpleSignDocumentInput[]
): Record<string, string> {
  const inputByKey = new Map<string, SimpleSignDocumentInput>();
  for (const input of inputs) {
    if (isSignerPrivateInput(input)) continue;
    inputByKey.set(input.key, input);
  }
  const simpleSignKeyByToken = buildSimpleSignKeyLookup(
    inputs,
    isSignerPrivateInput
  );

  const result: Record<string, string> = {};
  for (const [matoahKey, value] of Object.entries(matoahPrefill)) {
    const simpleSignKey = simpleSignKeyByToken.get(normalizeMappingToken(matoahKey));
    if (!simpleSignKey) continue;
    const target = inputByKey.get(simpleSignKey);
    const mappedValue =
      target?.type === "checkbox" ? formatCheckboxMark(value) : value;
    if (mappedValue) result[simpleSignKey] = mappedValue;
  }
  return result;
}

function looksLikeSchoolYearToken(value: string): boolean {
  const n = normalizeMappingToken(value).replace(/["'`״׳\s]/g, "");
  return n === "year" || n === "school_year" || n === "שנה" || n === "שנאל";
}

function applySchoolYearPrefill(
  mapped: Record<string, string>,
  inputs: SimpleSignDocumentInput[],
  schoolYearLabel: string
): Record<string, string> {
  const value = schoolYearLabel.trim();
  if (!value) return mapped;
  const result = { ...mapped };
  for (const input of inputs) {
    if (input.type === "signature") continue;
    if ((result[input.key] ?? "").trim()) continue;
    if (
      looksLikeSchoolYearToken(input.key) ||
      looksLikeSchoolYearToken(input.label)
    ) {
      result[input.key] = value.slice(0, 4000);
    }
  }
  return result;
}

function resolvePrefillSchoolYear(
  data: Record<string, string>,
  schoolYearLabel?: string
): string {
  const explicit = schoolYearLabel?.trim();
  if (explicit) return explicit;
  return String(data.school_year ?? data.year ?? "").trim();
}

export function buildSimpleSignPrefillForDocument(
  schema: FormSchema,
  data: Record<string, string>,
  documentInputs: SimpleSignDocumentInput[],
  schoolYearLabel?: string
): Record<string, string> {
  const matoahValues = buildMatoahPrefillValues(schema, data);
  const mapped = mapPrefillToSimpleSignKeys(matoahValues, documentInputs);
  return applySchoolYearPrefill(
    mapped,
    documentInputs,
    resolvePrefillSchoolYear(data, schoolYearLabel)
  );
}

/** prefill לפי slot חותם. slot 0 = שדות משותפים שנשלחים ב-prefill ברמת הבקשה. */
export function buildSimpleSignPrefillBySignerSlot(
  schema: FormSchema,
  data: Record<string, string>,
  documentInputs: SimpleSignDocumentInput[],
  schoolYearLabel?: string
): Record<number, Record<string, string>> {
  const mapped = buildSimpleSignPrefillForDocument(
    schema,
    data,
    documentInputs,
    schoolYearLabel
  );
  const bySlot: Record<number, Record<string, string>> = {};

  for (const input of documentInputs) {
    if (input.type === "signature") continue;
    const value = mapped[input.key];
    if (!value) continue;
    const slot =
      input.signer === SIMPLESIGN_SHARED_SIGNER_SLOT
        ? SIMPLESIGN_SHARED_SIGNER_SLOT
        : (input.signer ?? 1);
    if (!bySlot[slot]) bySlot[slot] = {};
    bySlot[slot][input.key] = value;
  }

  return bySlot;
}

/** מפריד שדות משותפים (signer: 0) מ-prefill של כל חותם — לפי תיעוד SimpleSign multi-signers */
export function splitSimpleSignPrefillBySigner(
  bySlot: Record<number, Record<string, string>>
): {
  shared: Record<string, string>;
  bySigner: Record<number, Record<string, string>>;
} {
  const shared = bySlot[SIMPLESIGN_SHARED_SIGNER_SLOT] ?? {};
  const bySigner: Record<number, Record<string, string>> = {};
  for (const [slotKey, values] of Object.entries(bySlot)) {
    const slot = Number(slotKey);
    if (
      slot === SIMPLESIGN_SHARED_SIGNER_SLOT ||
      !Number.isInteger(slot) ||
      slot < 1
    ) {
      continue;
    }
    bySigner[slot] = values;
  }
  return { shared, bySigner };
}

/** @deprecated השתמשו ב-buildSimpleSignPrefillForDocument — נשמר לתאימות */
export function buildSimpleSignPrefill(
  schema: FormSchema,
  data: Record<string, string>
): Record<string, string> {
  return buildMatoahPrefillValues(schema, data);
}

export function countPrefillKeys(prefill: Record<string, string>): number {
  return Object.keys(prefill).length;
}

export function listUnmappedMatoahPrefillKeys(
  matoahPrefill: Record<string, string>,
  inputs: SimpleSignDocumentInput[]
): string[] {
  const tokenToSimpleSignKey = buildSimpleSignKeyLookup(
    inputs,
    (input) => input.type === "signature"
  );
  return Object.keys(matoahPrefill).filter(
    (matoahKey) => !tokenToSimpleSignKey.has(normalizeMappingToken(matoahKey))
  );
}
