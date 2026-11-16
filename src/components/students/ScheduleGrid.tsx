"use client";

import { Fragment, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { parseScheduleImportFile } from "@/lib/schedule-excel-import";
import {
  SCHEDULE_DAYS,
  scheduleCellKey,
  scheduleInClassKey,
  scheduleOtherKey,
  scheduleOtherLabelKey,
  schedulePeriodsForVariant,
  scheduleSubCellKey,
  type ScheduleGridVariant,
} from "@/lib/form-table-grids";
import { cn } from "@/lib/utils";

interface ScheduleGridProps {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onPatch?: (patch: Record<string, string>) => void;
  variant?: ScheduleGridVariant;
  hint?: string;
}

function isChecked(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function MiniField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows = 1,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="min-h-[1.75rem] w-full resize-y border-0 bg-transparent px-1 py-0.5 text-center text-[11px] leading-snug text-ink outline-none placeholder:text-muted-foreground/70 focus:bg-brand-50/40"
    />
  );
}

export function ScheduleGrid({
  data,
  onChange,
  onPatch,
  variant = "detailed",
  hint,
}: ScheduleGridProps) {
  const { texts } = useSiteText();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const periods = schedulePeriodsForVariant(variant);
  const isTlk =
    variant === "tlk-weekly" ||
    variant === "tlk-paramedical" ||
    variant === "tlk-inclusion" ||
    variant === "tlk-personal" ||
    variant === "staff-weekly";
  const simple = variant === "simple" || variant === "tlk-personal";
  const allowImport = variant === "simple" || variant === "detailed" || variant === "tlk-personal";

  const tip =
    hint ??
    (variant === "tlk-personal" || variant === "simple"
      ? "נא לרשום שעה מדויקת ומקצוע"
      : variant === "tlk-weekly"
        ? "יש לציין את שם המקצוע ואת שם איש הצוות (מורה, סייעת, מרפאה וכו')"
        : variant === "staff-weekly"
          ? "בכל תא: שם התלמיד/ה והמקצוע"
          : undefined);

  const subHeaders =
    variant === "tlk-weekly"
      ? (["המקצוע", "שם"] as const)
      : variant === "staff-weekly"
        ? (["שם התלמיד", "מקצוע"] as const)
      : variant === "tlk-paramedical"
        ? (["שם התלמיד", "המרפאה"] as const)
        : variant === "tlk-inclusion"
          ? (["תלמיד", "כתה", "מורה", "מקצוע"] as const)
          : null;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setImportMessage(null);
    setImportError(null);
    try {
      const result = await parseScheduleImportFile(await file.arrayBuffer());
      if (result.filledCount === 0) {
        setImportError(getTextByPath(texts, "personalArea.scheduleImportEmpty"));
        return;
      }
      if (onPatch) {
        onPatch(result.cells);
      } else {
        for (const [key, value] of Object.entries(result.cells)) {
          onChange(key, value);
        }
      }
      setImportMessage(
        getTextByPath(texts, "personalArea.scheduleImportOk").replace(
          "{count}",
          String(result.filledCount)
        )
      );
    } catch {
      setImportError(getTextByPath(texts, "personalArea.importExcelParseError"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function renderDayCell(dayKey: string, dayLabel: string, period: number) {
    if (variant === "tlk-weekly") {
      const subjectKey = scheduleCellKey(dayKey, period);
      const staffKey = scheduleSubCellKey(dayKey, period, "staff");
      return (
        <>
          <td key={subjectKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[subjectKey] ?? ""}
              onChange={(v) => onChange(subjectKey, v)}
              placeholder="מקצוע"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — מקצוע`}
            />
          </td>
          <td key={staffKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[staffKey] ?? ""}
              onChange={(v) => onChange(staffKey, v)}
              placeholder="שם"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — שם`}
            />
          </td>
        </>
      );
    }

    if (variant === "staff-weekly") {
      const studentKey = scheduleSubCellKey(dayKey, period, "student");
      const subjectKey = scheduleSubCellKey(dayKey, period, "subject");
      return (
        <>
          <td key={studentKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[studentKey] ?? ""}
              onChange={(v) => onChange(studentKey, v)}
              placeholder="שם התלמיד"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — שם התלמיד`}
            />
          </td>
          <td key={subjectKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[subjectKey] ?? ""}
              onChange={(v) => onChange(subjectKey, v)}
              placeholder="מקצוע"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — מקצוע`}
            />
          </td>
        </>
      );
    }

    if (variant === "tlk-paramedical") {
      const studentKey = scheduleSubCellKey(dayKey, period, "student");
      const therapistKey = scheduleSubCellKey(dayKey, period, "therapist");
      return (
        <>
          <td key={studentKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[studentKey] ?? ""}
              onChange={(v) => onChange(studentKey, v)}
              placeholder="תלמיד/ה"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — שם התלמיד`}
            />
          </td>
          <td key={therapistKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[therapistKey] ?? ""}
              onChange={(v) => onChange(therapistKey, v)}
              placeholder="מרפאה"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — המרפאה`}
            />
          </td>
        </>
      );
    }

    if (variant === "tlk-inclusion") {
      const studentKey = scheduleSubCellKey(dayKey, period, "student");
      const classKey = scheduleSubCellKey(dayKey, period, "class");
      const teacherKey = scheduleSubCellKey(dayKey, period, "teacher");
      const subjectKey = scheduleSubCellKey(dayKey, period, "subject");
      return (
        <>
          <td key={studentKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[studentKey] ?? ""}
              onChange={(v) => onChange(studentKey, v)}
              placeholder="תלמיד"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — תלמיד`}
            />
          </td>
          <td key={classKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[classKey] ?? ""}
              onChange={(v) => onChange(classKey, v)}
              placeholder="כתה"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — כתה`}
            />
          </td>
          <td key={teacherKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[teacherKey] ?? ""}
              onChange={(v) => onChange(teacherKey, v)}
              placeholder="מורה"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — מורה`}
            />
          </td>
          <td key={subjectKey} className="border border-border p-0 align-top">
            <MiniField
              value={data[subjectKey] ?? ""}
              onChange={(v) => onChange(subjectKey, v)}
              placeholder="מקצוע"
              ariaLabel={`שיעור ${period} יום ${dayLabel} — מקצוע`}
            />
          </td>
        </>
      );
    }

    const subjectKey = scheduleCellKey(dayKey, period);
    if (simple) {
      return (
        <td key={subjectKey} className="border border-border p-1 align-top">
          <textarea
            value={data[subjectKey] ?? ""}
            onChange={(e) => onChange(subjectKey, e.target.value)}
            rows={2}
            className="min-h-[2.5rem] w-full resize-y rounded-md border-0 bg-transparent px-1 py-1 text-center text-xs leading-snug text-ink outline-none focus:bg-brand-50/40"
            aria-label={`שיעור ${period} יום ${dayLabel}`}
          />
        </td>
      );
    }

    const inClassKey = scheduleInClassKey(dayKey, period);
    const otherKey = scheduleOtherKey(dayKey, period);
    const otherLabelKey = scheduleOtherLabelKey(dayKey, period);
    const otherChecked = isChecked(data[otherKey]);
    return (
      <td key={subjectKey} className="border border-border p-0 align-top">
        <textarea
          value={data[subjectKey] ?? ""}
          onChange={(e) => onChange(subjectKey, e.target.value)}
          rows={2}
          className="min-h-[2.25rem] w-full resize-y border-0 border-b border-border bg-transparent px-1 py-1 text-center text-xs leading-snug text-ink outline-none focus:bg-brand-50/40"
          aria-label={`שיעור ${period} יום ${dayLabel}`}
        />
        <div className="grid grid-cols-2 divide-x divide-x-reverse divide-border text-[10px] leading-tight">
          <label className="flex cursor-pointer flex-col items-center gap-0.5 px-1 py-1">
            <span className="font-medium text-ink">בכיתה</span>
            <input
              type="checkbox"
              checked={isChecked(data[inClassKey])}
              onChange={(e) =>
                onChange(inClassKey, e.target.checked ? "1" : "")
              }
              className="h-3.5 w-3.5 accent-brand-600"
            />
          </label>
          <div className="flex flex-col items-stretch gap-0.5 px-1 py-1">
            <label className="flex cursor-pointer flex-col items-center gap-0.5">
              <span className="font-medium text-ink">אחר</span>
              <input
                type="checkbox"
                checked={otherChecked}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onChange(otherKey, checked ? "1" : "");
                  if (!checked) onChange(otherLabelKey, "");
                }}
                className="h-3.5 w-3.5 accent-brand-600"
              />
            </label>
            {otherChecked ? (
              <textarea
                value={data[otherLabelKey] ?? ""}
                onChange={(e) => onChange(otherLabelKey, e.target.value)}
                rows={2}
                placeholder="פרטו (סייעת / טיפול…)"
                className="min-h-[2rem] w-full resize-y rounded border border-border bg-white px-1 py-0.5 text-center text-[10px] leading-snug text-ink outline-none focus:bg-brand-50/40"
                aria-label={`שיעור ${period} יום ${dayLabel} — פירוט אחר`}
              />
            ) : null}
          </div>
        </div>
      </td>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      {allowImport ? (
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            <EditableText path="personalArea.scheduleImportHint" as="span" />
          </p>
          <div className="flex items-center justify-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              <EditableText path="personalArea.scheduleImportExcel" />
            </Button>
          </div>
        </div>
      ) : null}
      {importError ? (
        <p className="px-3 py-2 text-sm text-destructive">{importError}</p>
      ) : null}
      {importMessage ? (
        <p className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink">
          <FileSpreadsheet className="h-4 w-4" />
          {importMessage}
        </p>
      ) : null}
      <table
        className={cn(
          "w-full border-collapse text-sm",
          isTlk ? "min-w-[920px]" : "min-w-[760px]"
        )}
      >
        <thead>
          <tr className="bg-slate-50">
            <th className="w-10 border border-border px-1 py-2" />
            {SCHEDULE_DAYS.map((day) => (
              <th
                key={day.key}
                colSpan={subHeaders?.length ?? 1}
                className="border border-border px-2 py-2 text-center font-bold text-ink"
              >
                {day.label}
              </th>
            ))}
          </tr>
          {subHeaders ? (
            <tr className="bg-slate-50/80">
              <th className="border border-border px-1 py-1" />
              {SCHEDULE_DAYS.map((day) =>
                subHeaders.map((label) => (
                  <th
                    key={`${day.key}-${label}`}
                    className="border border-border px-1 py-1 text-center text-[11px] font-semibold text-ink"
                  >
                    {label}
                  </th>
                ))
              )}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period}>
              <th className="border border-border bg-slate-50 px-2 py-2 text-center font-bold text-ink">
                {period}
              </th>
              {SCHEDULE_DAYS.map((day) => (
                <Fragment key={day.key}>
                  {renderDayCell(day.key, day.label, period)}
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {tip ? (
        <p className="border-t border-border px-3 py-2 text-right text-sm font-medium text-ink">
          {tip}
        </p>
      ) : null}
    </div>
  );
}
