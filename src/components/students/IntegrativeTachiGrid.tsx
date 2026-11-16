"use client";

import { type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceRecordButton, TypedTextRefineButton } from "@/components/students/VoiceRecordButton";
import type { VoiceRefineContext } from "@/lib/voice-refine-context";
import type { FormFieldDef } from "@/lib/form-fields";
import {
  FORM_TABLE_DEFS,
  resolveTableRowCount,
  tableCellKey,
  tableRowCountKey,
  tableVoiceColumnKeys,
} from "@/lib/form-table-grids";
import { cn } from "@/lib/utils";
import {
  INTEGRATIVE_COL_TEACHER_KEY,
  INTEGRATIVE_COL_AIDE_KEY,
  INTEGRATIVE_COL_OTHER_KEY,
  DEFAULT_COL_TEACHER,
  DEFAULT_COL_AIDE,
  DEFAULT_COL_OTHER,
} from "@/lib/integrative-tachi-defs";

export {
  INTEGRATIVE_COL_TEACHER_KEY,
  INTEGRATIVE_COL_AIDE_KEY,
  INTEGRATIVE_COL_OTHER_KEY,
};

const TABLE_ID = "tachi-integrative-goals";

/** שדות שמטופלים בפריסת הטבלה האינטגרטיבית (לא ברשת שדות רגילה) */
export const INTEGRATIVE_TACHI_OWNED_KEYS = new Set([
  "responsible",
  "homeroom_teacher",
  "school_year",
  "class_name",
  "full_name",
  "domain",
  "baseline",
  "main_goals",
  "fill_per_domain_note",
  "ai_workplan_hint",
  "recommendations",
  "year_changes",
  "parents_signature",
  `table:${TABLE_ID}`,
  INTEGRATIVE_COL_TEACHER_KEY,
  INTEGRATIVE_COL_AIDE_KEY,
  INTEGRATIVE_COL_OTHER_KEY,
]);

export function isIntegrativeTachiOwnedField(field: FormFieldDef): boolean {
  if (INTEGRATIVE_TACHI_OWNED_KEYS.has(field.key)) return true;
  if (field.type === "row-table" && field.key.includes(TABLE_ID)) return true;
  if (field.type === "static" && !field.label?.trim()) return true;
  return false;
}

interface IntegrativeTachiGridProps {
  fields: FormFieldDef[];
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  fieldLabel: (field: FormFieldDef) => string;
  renderSignature?: (field: FormFieldDef) => ReactNode;
  allowVoice?: boolean;
  voiceRefineContext?: VoiceRefineContext;
}

function fieldByKey(
  fields: FormFieldDef[],
  key: string
): FormFieldDef | undefined {
  return fields.find((f) => f.key === key);
}

function MetaCell({
  label,
  value,
  onChange,
  fieldKey,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fieldKey: string;
  className?: string;
}) {
  return (
    <td className={cn("border border-slate-400 bg-white p-1.5 align-middle", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="whitespace-nowrap text-xs font-bold text-ink">{label}</span>
        <input
          id={`form-field-${fieldKey}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded border border-brand-100 bg-brand-50/30 px-2 py-1 text-sm outline-none focus:border-brand-400"
        />
      </div>
    </td>
  );
}

function WideLabeledRow({
  label,
  value,
  onChange,
  fieldKey,
  rows = 2,
  allowVoice = false,
  voiceRefineContext,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fieldKey: string;
  rows?: number;
  allowVoice?: boolean;
  voiceRefineContext?: VoiceRefineContext;
}) {
  return (
    <tr>
      <th className="w-[7.5rem] border border-slate-400 bg-slate-50 px-2 py-2 text-right text-xs font-bold text-ink align-top">
        <div className="flex flex-col items-stretch gap-1">
          <span>{label}</span>
          {allowVoice ? (
            <div className="flex flex-wrap items-center gap-1.5 self-start">
              <TypedTextRefineButton
                value={value}
                fieldLabel={label}
                refineContext={voiceRefineContext}
                onInsert={onChange}
              />
              <VoiceRecordButton
                value={value}
                fieldLabel={label}
                refineContext={voiceRefineContext}
                onInsert={onChange}
                size="sm"
              />
            </div>
          ) : null}
        </div>
      </th>
      <td colSpan={6} className="border border-slate-400 bg-white p-1.5 align-top">
        <textarea
          id={`form-field-${fieldKey}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="min-h-[2.5rem] w-full resize-y rounded border-0 bg-transparent px-1.5 py-1 text-sm outline-none focus:bg-brand-50/40"
        />
      </td>
    </tr>
  );
}

function CellArea({
  value,
  onChange,
  fieldLabel,
  allowVoice = false,
  voiceRefineContext,
}: {
  value: string;
  onChange: (v: string) => void;
  fieldLabel?: string;
  allowVoice?: boolean;
  voiceRefineContext?: VoiceRefineContext;
}) {
  return (
    <div className="flex flex-col gap-1">
      {allowVoice ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <TypedTextRefineButton
            value={value}
            fieldLabel={fieldLabel}
            refineContext={voiceRefineContext}
            onInsert={onChange}
          />
          <VoiceRecordButton
            value={value}
            fieldLabel={fieldLabel}
            refineContext={voiceRefineContext}
            onInsert={onChange}
            size="sm"
          />
        </div>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="min-h-[3.5rem] w-full resize-y rounded border-0 bg-transparent px-1 py-1 text-xs leading-5 outline-none focus:bg-brand-50/40"
      />
    </div>
  );
}

function EditableColumnHeader({
  value,
  defaultValue,
  onChange,
  ariaLabel,
}: {
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const showingDefault = !value.trim();
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full min-w-[3rem] cursor-text rounded border border-dashed border-slate-300 bg-transparent text-center text-[11px] outline-none",
        "hover:bg-brand-50/40",
        "focus:border-brand-400 focus:bg-brand-50/50",
        showingDefault
          ? "font-normal text-slate-400 placeholder:font-normal placeholder:text-slate-400"
          : "font-bold text-ink"
      )}
      placeholder={defaultValue}
      aria-label={ariaLabel}
      title="לחיצה לעריכת שם העמודה"
      maxLength={80}
    />
  );
}

/**
 * פריסת תח״י / תל״א אינטגרטיבי — טבלה אחת כמו בקובץ Word.
 */
export function IntegrativeTachiGrid({
  fields,
  data,
  onChange,
  fieldLabel,
  renderSignature,
  allowVoice = false,
  voiceRefineContext,
}: IntegrativeTachiGridProps) {
  const def = FORM_TABLE_DEFS[TABLE_ID];
  if (!def) return null;
  const rowCount = resolveTableRowCount(TABLE_ID, data);
  const voiceColumns = allowVoice ? tableVoiceColumnKeys(TABLE_ID) : [];

  const responsible =
    fieldByKey(fields, "responsible") ?? fieldByKey(fields, "homeroom_teacher");
  const responsibleKey = responsible?.key ?? "responsible";
  const schoolYear = fieldByKey(fields, "school_year");
  const className = fieldByKey(fields, "class_name");
  const fullName = fieldByKey(fields, "full_name");
  const domain = fieldByKey(fields, "domain");
  const baseline = fieldByKey(fields, "baseline");
  const mainGoals = fieldByKey(fields, "main_goals");
  const recommendations = fieldByKey(fields, "recommendations");
  const yearChanges = fieldByKey(fields, "year_changes");
  const parentsSig = fieldByKey(fields, "parents_signature");
  const hintField = fields.find(
    (f) => f.type === "static" && f.key === "fill_per_domain_note"
  );
  const aiHint = fields.find(
    (f) => f.type === "static" && f.key === "ai_workplan_hint"
  );

  function setRows(next: number) {
    onChange(tableRowCountKey(TABLE_ID), String(next));
    for (let r = 0; r < next; r += 1) {
      for (const col of def.columns) {
        const key = tableCellKey(TABLE_ID, r, col.key);
        if (!(key in data)) onChange(key, "");
      }
    }
  }

  function cell(row: number, colKey: string): string {
    const primary = data[tableCellKey(TABLE_ID, row, colKey)] ?? "";
    if (primary.trim()) return primary;
    // תאימות לאחור למפתחות ישנים
    if (colKey === "teacher") {
      return data[tableCellKey(TABLE_ID, row, "opportunities")] ?? "";
    }
    if (colKey === "formative") {
      return data[tableCellKey(TABLE_ID, row, "followup")] ?? "";
    }
    return "";
  }

  return (
    <div className="flex flex-col gap-3">
      {aiHint?.label ? (
        <p className="rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2 text-center text-sm text-brand-900">
          {aiHint.label}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border-2 border-slate-400 bg-white shadow-sm">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <tbody>
            <tr>
              {fullName ? (
                <MetaCell
                  label={`${fieldLabel(fullName)}:`}
                  value={data.full_name ?? ""}
                  onChange={(v) => onChange("full_name", v)}
                  fieldKey="full_name"
                />
              ) : (
                <td className="border border-slate-400" />
              )}
              {className ? (
                <MetaCell
                  label={`${fieldLabel(className)}:`}
                  value={data.class_name ?? ""}
                  onChange={(v) => onChange("class_name", v)}
                  fieldKey="class_name"
                />
              ) : (
                <td className="border border-slate-400" />
              )}
              {schoolYear ? (
                <MetaCell
                  label={`${fieldLabel(schoolYear)}:`}
                  value={data.school_year ?? ""}
                  onChange={(v) => onChange("school_year", v)}
                  fieldKey="school_year"
                />
              ) : (
                <td className="border border-slate-400" />
              )}
              {responsible ? (
                <MetaCell
                  label={`${fieldLabel(responsible)}:`}
                  value={data[responsibleKey] ?? ""}
                  onChange={(v) => onChange(responsibleKey, v)}
                  fieldKey={responsibleKey}
                  className="min-w-[10rem]"
                />
              ) : null}
              <td
                colSpan={responsible ? 3 : 4}
                className="border border-slate-400 bg-slate-50"
              />
            </tr>

            {domain ? (
              <WideLabeledRow
                label={`${fieldLabel(domain)}:`}
                value={data.domain ?? ""}
                onChange={(v) => onChange("domain", v)}
                fieldKey="domain"
                rows={1}
              />
            ) : null}
            {baseline ? (
              <WideLabeledRow
                label={`${fieldLabel(baseline)}:`}
                value={data.baseline ?? ""}
                onChange={(v) => onChange("baseline", v)}
                fieldKey="baseline"
                rows={3}
                allowVoice={allowVoice}
                voiceRefineContext={voiceRefineContext}
              />
            ) : null}
            {mainGoals ? (
              <WideLabeledRow
                label={`${fieldLabel(mainGoals)}:`}
                value={data.main_goals ?? ""}
                onChange={(v) => onChange("main_goals", v)}
                fieldKey="main_goals"
                rows={3}
                allowVoice={allowVoice}
                voiceRefineContext={voiceRefineContext}
              />
            ) : null}

            <tr className="bg-slate-100">
              <th
                rowSpan={2}
                className="border border-slate-400 px-2 py-2 text-center text-xs font-bold"
              >
                יעדים
              </th>
              <th
                colSpan={3}
                className="border border-slate-400 px-2 py-2 text-center text-xs font-bold"
              >
                הזדמנויות עבודה ואמצעים להשגתם
              </th>
              <th
                colSpan={2}
                className="border border-slate-400 px-2 py-2 text-center text-xs font-bold"
              >
                מעקב והערכה
              </th>
              <th
                rowSpan={2}
                className="border border-slate-400 px-2 py-2 text-center text-xs font-bold"
              >
                הערות
              </th>
            </tr>
            <tr className="bg-slate-50">
              <th className="border border-slate-400 px-1 py-1.5 text-center text-[11px] font-bold">
                <EditableColumnHeader
                  value={data[INTEGRATIVE_COL_TEACHER_KEY] ?? ""}
                  defaultValue={DEFAULT_COL_TEACHER}
                  onChange={(v) => onChange(INTEGRATIVE_COL_TEACHER_KEY, v)}
                  ariaLabel="כותרת עמודת מורה"
                />
              </th>
              <th className="border border-slate-400 px-1 py-1.5 text-center text-[11px] font-bold">
                <EditableColumnHeader
                  value={data[INTEGRATIVE_COL_AIDE_KEY] ?? ""}
                  defaultValue={DEFAULT_COL_AIDE}
                  onChange={(v) => onChange(INTEGRATIVE_COL_AIDE_KEY, v)}
                  ariaLabel="כותרת עמודת סייעת"
                />
              </th>
              <th className="border border-slate-400 px-1 py-1.5 text-center text-[11px] font-bold">
                <EditableColumnHeader
                  value={data[INTEGRATIVE_COL_OTHER_KEY] ?? ""}
                  defaultValue={DEFAULT_COL_OTHER}
                  onChange={(v) => onChange(INTEGRATIVE_COL_OTHER_KEY, v)}
                  ariaLabel="כותרת עמודת אחר"
                />
              </th>
              <th className="border border-slate-400 px-1 py-1.5 text-center text-[11px] font-bold">
                הערכה מעצבת
              </th>
              <th className="border border-slate-400 px-1 py-1.5 text-center text-[11px] font-bold">
                הערכה מסכמת
              </th>
            </tr>

            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <tr key={rowIndex}>
                {(
                  [
                    "goal",
                    "teacher",
                    "aide",
                    "other",
                    "formative",
                    "summative",
                    "notes",
                  ] as const
                ).map((colKey) => (
                  <td
                    key={colKey}
                    className="border border-slate-400 bg-white p-1 align-top"
                  >
                    <CellArea
                      value={cell(rowIndex, colKey)}
                      onChange={(v) =>
                        onChange(tableCellKey(TABLE_ID, rowIndex, colKey), v)
                      }
                      fieldLabel={colKey}
                      allowVoice={voiceColumns.includes(colKey)}
                      voiceRefineContext={voiceRefineContext}
                    />
                  </td>
                ))}
              </tr>
            ))}

            <tr>
              <th
                colSpan={3}
                className="border border-slate-400 bg-slate-50 px-2 py-2 text-center text-xs font-bold"
              >
                {recommendations ? fieldLabel(recommendations) : "המלצות"}
              </th>
              <th
                colSpan={4}
                className="border border-slate-400 bg-slate-50 px-2 py-2 text-center text-xs font-bold"
              >
                {yearChanges
                  ? fieldLabel(yearChanges)
                  : "הערות ושינויים משמעותיים במהלך השנה"}
              </th>
            </tr>
            <tr>
              <td colSpan={3} className="border border-slate-400 bg-white p-1.5 align-top">
                <CellArea
                  value={data.recommendations ?? ""}
                  onChange={(v) => onChange("recommendations", v)}
                />
              </td>
              <td colSpan={4} className="border border-slate-400 bg-white p-1.5 align-top">
                <CellArea
                  value={data.year_changes ?? ""}
                  onChange={(v) => onChange("year_changes", v)}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {def.allowAddRows ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows(Math.min(30, rowCount + 1))}
          >
            <Plus className="h-4 w-4" />
            הוספת שורת יעד
          </Button>
          {rowCount > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows(Math.max(1, rowCount - 1))}
            >
              <Trash2 className="h-4 w-4" />
              הסרת שורה אחרונה
            </Button>
          ) : null}
        </div>
      ) : null}

      {hintField?.label ? (
        <p className="text-center text-sm font-medium text-pink">
          {hintField.label}
        </p>
      ) : null}

      {parentsSig && renderSignature ? (
        <div className="mt-1">{renderSignature(parentsSig)}</div>
      ) : null}
    </div>
  );
}
