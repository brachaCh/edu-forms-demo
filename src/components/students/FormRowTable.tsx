"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceRecordButton, TypedTextRefineButton } from "@/components/students/VoiceRecordButton";
import { StaffMeetingRowActions } from "@/components/students/StaffMeetingRowActions";
import {
  FORM_TABLE_DEFS,
  resolveTableRowCount,
  tableCellKey,
  tableRowCountKey,
  tableVoiceColumnKeys,
} from "@/lib/form-table-grids";
import { STAFF_MEETINGS_TABLE_ID } from "@/lib/staff-meeting-parent-email";
import type { Student } from "@/lib/supabase/types";
import type { VoiceRefineContext } from "@/lib/voice-refine-context";
import { cn } from "@/lib/utils";
import { formatCheckboxMark } from "@/lib/form-fields";
import { TeamRoleField } from "@/components/students/TeamRoleField";

interface FormRowTableProps {
  tableId: string;
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  allowVoice?: boolean;
  /** false = לא להציג כפתור «נסחי לי» (למשל שאלון הורים) */
  allowRefineTyped?: boolean;
  voiceRefineContext?: VoiceRefineContext;
  autoSaveOnVoice?: boolean;
  onVoiceTranscriptSaved?: (
    cellKey: string,
    text: string
  ) => void | Promise<void>;
  /** פעולות לשורת ישיבת צוות (שליחה להורים + הדפסה) */
  staffMeetingStudent?: Student | null;
  staffMeetingActionsDisabled?: boolean;
}

export function FormRowTable({
  tableId,
  data,
  onChange,
  allowVoice = false,
  allowRefineTyped = true,
  voiceRefineContext,
  autoSaveOnVoice = false,
  onVoiceTranscriptSaved,
  staffMeetingStudent = null,
  staffMeetingActionsDisabled = false,
}: FormRowTableProps) {
  const def = FORM_TABLE_DEFS[tableId];
  if (!def) return null;

  const rowCount = resolveTableRowCount(tableId, data);
  const voiceColumns = allowVoice ? tableVoiceColumnKeys(tableId) : [];
  const showStaffMeetingActions =
    tableId === STAFF_MEETINGS_TABLE_ID && Boolean(staffMeetingStudent);
  const rowLabels = def.rowLabels ?? [];
  const showRowLabels = rowLabels.length > 0;
  const otherLabelKey = def.otherLabelFieldKey;

  function setRows(next: number) {
    onChange(tableRowCountKey(tableId), String(next));
    for (let r = 0; r < next; r += 1) {
      for (const col of def.columns) {
        const key = tableCellKey(tableId, r, col.key);
        if (!(key in data)) onChange(key, "");
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {def.hint && (
        <p className="text-center text-sm font-medium text-pink">{def.hint}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table
          className={cn(
            "w-full border-collapse text-sm",
            showStaffMeetingActions ? "min-w-[760px]" : showRowLabels ? "min-w-[860px]" : "min-w-[680px]"
          )}
        >
          <thead>
            <tr className="bg-slate-50">
              {showRowLabels ? (
                <th className="border border-border px-2 py-2 text-center font-bold text-ink min-w-[9rem]">
                  {def.rowHeaderLabel ?? ""}
                </th>
              ) : null}
              {def.columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "border border-border px-2 py-2 text-center font-bold text-ink",
                    col.wide && "min-w-[10rem]",
                    (col.rows ?? 0) >= 4 && "min-w-[15rem]"
                  )}
                >
                  {col.label}
                </th>
              ))}
              {showStaffMeetingActions ? (
                <th className="border border-border px-2 py-2 text-center font-bold text-ink w-[8.5rem]">
                  פעולות
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <tr key={rowIndex}>
                {showRowLabels ? (
                  <th className="border border-border bg-slate-50 px-2 py-2 text-start align-middle font-bold text-ink">
                    {otherLabelKey && def.rowKeys?.[rowIndex] === "other" ? (
                      <div className="flex flex-col gap-1">
                        <span>{rowLabels[rowIndex] ?? ""}</span>
                        <input
                          type="text"
                          value={data[otherLabelKey] ?? ""}
                          onChange={(e) => onChange(otherLabelKey, e.target.value)}
                          className="h-8 w-full rounded-md border border-border bg-white px-1.5 text-sm font-normal text-ink outline-none focus:bg-brand-50/40"
                        />
                      </div>
                    ) : (
                      rowLabels[rowIndex] ?? ""
                    )}
                  </th>
                ) : null}
                {def.columns.map((col) => {
                  const key = tableCellKey(tableId, rowIndex, col.key);
                  const cellValue = data[key] ?? "";
                  const isDateColumn = col.input === "date" || col.key === "date";
                  const isCheckbox = col.input === "checkbox";
                  const isTeamRole = col.input === "team-role";
                  const textareaRows = col.rows ?? (col.wide ? 2 : 1);
                  return (
                    <td
                      key={key}
                      className={cn(
                        "border border-border p-1",
                        isCheckbox ? "align-middle text-center" : "align-top"
                      )}
                    >
                      <div className={cn("flex flex-col gap-1", isCheckbox && "items-center")}>
                        {isCheckbox ? (
                          <input
                            type="checkbox"
                            checked={Boolean(formatCheckboxMark(cellValue))}
                            onChange={(e) =>
                              onChange(key, e.target.checked ? "true" : "")
                            }
                            className="h-4 w-4"
                            aria-label={`${rowLabels[rowIndex] ?? ""} — ${col.label}`}
                          />
                        ) : isDateColumn ? (
                          <input
                            type="date"
                            value={cellValue}
                            onChange={(e) => onChange(key, e.target.value)}
                            className="h-9 w-full min-w-[8.5rem] rounded-md border-0 bg-transparent px-1.5 text-sm text-ink outline-none focus:bg-brand-50/40"
                          />
                        ) : isTeamRole ? (
                          <TeamRoleField
                            value={cellValue}
                            onChange={(next) => onChange(key, next)}
                            selectClassName="h-9 border-0 bg-transparent focus:bg-brand-50/40"
                            inputClassName="border-0 bg-transparent focus:bg-brand-50/40"
                            ariaLabel={`${col.label} — פירוט`}
                          />
                        ) : (
                          <textarea
                            value={cellValue}
                            onChange={(e) => onChange(key, e.target.value)}
                            rows={textareaRows}
                            className={cn(
                              "w-full resize-y rounded-md border-0 bg-transparent px-1.5 py-1.5 text-sm leading-relaxed text-ink outline-none focus:bg-brand-50/40",
                              textareaRows <= 1 && "min-h-[2rem]",
                              textareaRows === 2 && "min-h-[3.5rem]",
                              textareaRows >= 3 && "min-h-[7rem]",
                              col.wide && "min-w-[10rem]",
                              textareaRows >= 4 && "min-w-[15rem]"
                            )}
                          />
                        )}
                        {!isCheckbox && voiceColumns.includes(col.key) ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {allowRefineTyped ? (
                              <TypedTextRefineButton
                                value={cellValue}
                                fieldLabel={col.label}
                                refineContext={voiceRefineContext}
                                onInsert={(text) => onChange(key, text)}
                                onAfterInsert={
                                  autoSaveOnVoice && onVoiceTranscriptSaved
                                    ? (text) =>
                                        void onVoiceTranscriptSaved(key, text)
                                    : undefined
                                }
                              />
                            ) : null}
                            <VoiceRecordButton
                              value={cellValue}
                              fieldLabel={col.label}
                              refineContext={voiceRefineContext}
                              onInsert={(text) => onChange(key, text)}
                              onAfterInsert={
                                autoSaveOnVoice && onVoiceTranscriptSaved
                                  ? (text) =>
                                      void onVoiceTranscriptSaved(key, text)
                                  : undefined
                              }
                              size={col.wide ? "md" : "sm"}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
                {showStaffMeetingActions && staffMeetingStudent ? (
                  <td className="border border-border p-1.5 align-top">
                    <StaffMeetingRowActions
                      student={staffMeetingStudent}
                      data={data}
                      rowIndex={rowIndex}
                      disabled={staffMeetingActionsDisabled}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {def.allowAddRows && (
        <div className="flex justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRows(Math.min(30, rowCount + 1))}
          >
            <Plus className="h-4 w-4" />
            הוספת שורה
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={rowCount <= 1}
            onClick={() => setRows(Math.max(1, rowCount - 1))}
          >
            <Trash2 className="h-4 w-4" />
            הסרת שורה
          </Button>
        </div>
      )}
    </div>
  );
}
