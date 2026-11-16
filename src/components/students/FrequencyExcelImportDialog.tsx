"use client";

import { useRef, useState } from "react";
import { CircleAlert, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import {
  countImportPreview,
  importExcelErrorStatusTextPath,
  parseStudentImportFile,
  PERSONAL_BASKET_STUDENT_IMPORT_SAMPLE_HREF,
  type ParsedImportRow,
} from "@/lib/student-excel-import";
import {
  executeImport,
  type ImportDeps,
} from "@/lib/student-excel-import-actions";
import { getTextByPath } from "@/lib/get-text-by-path";
import {
  getCanAssignTeachers,
  getCanManageStudents,
  getStudents,
  getUser,
  saveStudent,
  updateStudent,
} from "@/lib/mock-store";
import { teacherNameForExcelImport } from "@/lib/teacher-assignment";
import { isFreeAccessMode } from "@/lib/free-access";
import type { PersonalSector } from "@/lib/personal-sector";
import type { Category } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface FrequencyExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sector?: PersonalSector;
  onImported: () => void;
}

export function FrequencyExcelImportDialog({
  open,
  onOpenChange,
  sector,
  onImported,
}: FrequencyExcelImportDialogProps) {
  const { texts } = useSiteText();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const category: Category = sector ?? "schools";
  const counts = countImportPreview(rows);

  const highCount = rows.filter(
    (r) => r.status === "ok" && (r.frequency === "high" || r.frequency === null)
  ).length;
  const lowCount = rows.filter(
    (r) => r.status === "ok" && r.frequency === "low"
  ).length;

  function resetPreview() {
    setRows([]);
    setFileName(null);
    setParseError(null);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetPreview();
    }
    onOpenChange(next);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setSummary(null);
    setParseError(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const result = await parseStudentImportFile(buffer, {
        status: "personal-basket",
        category,
        existingStudents: getStudents(),
        defaultTeacherName: null,
        defaultClassName: null,
        canAssignTeachers: getCanAssignTeachers(),
      });

      if (result.rows.length === 0) {
        setRows([]);
        setParseError(
          getTextByPath(texts, "personalArea.importExcelNoRows")
        );
        return;
      }

      setRows(result.rows);
    } catch {
      setRows([]);
      setParseError(
        getTextByPath(texts, "personalArea.importExcelParseError")
      );
    }
  }

  const memberCannotCreate = !getCanManageStudents();
  const actionableCount = memberCannotCreate
    ? counts.update
    : counts.ok + counts.update;

  async function handleImport() {
    const toCreate = memberCannotCreate
      ? []
      : rows.filter((row) => row.status === "ok");
    const toUpdate = rows.filter((row) => row.status === "update");
    if (toCreate.length === 0 && toUpdate.length === 0) return;

    setImporting(true);
    const user = getUser();
    const canAssignTeachers = getCanAssignTeachers();

    const deps: ImportDeps = {
      getStudents,
      getUser: () => {
        if (!user) return null;
        return {
          plan_id: user.plan_id ?? null,
          institution_type: user.institution_type ?? undefined,
          education_framework: user.education_framework ?? null,
          plan_custom_classes: user.plan_custom_classes ?? null,
          plan_custom_students: user.plan_custom_students ?? null,
        };
      },
      saveStudent: async (data) => {
        return saveStudent({
          category: data.category,
          full_name: data.full_name,
          phone: data.phone ?? null,
          email: data.email ?? null,
          father_email: data.father_email ?? null,
          mother_email: data.mother_email ?? null,
          birth_date: data.birth_date ?? null,
          integration_start_date: data.integration_start_date ?? null,
          id_number: data.id_number ?? null,
          gender: data.gender ?? null,
          home_address: data.home_address ?? null,
          city: data.city ?? null,
          father_name: data.father_name ?? null,
          mother_name: data.mother_name ?? null,
          father_mobile: data.father_mobile ?? null,
          mother_mobile: data.mother_mobile ?? null,
          status: data.status ?? null,
          class_name: data.class_name ?? null,
          teacher_name: teacherNameForExcelImport(
            data.teacher_name,
            canAssignTeachers
          ),
          notes: data.notes ?? null,
          characterization: data.characterization ?? null,
          calendar_year: data.calendar_year ?? null,
          integration_frequency: data.integration_frequency ?? null,
          family_status: data.family_status ?? null,
          single_responsible_party: data.single_responsible_party ?? null,
          homeroom_teacher: data.homeroom_teacher ?? null,
          eligibility_committee_date: data.eligibility_committee_date ?? null,
          education_support: data.education_support ?? null,
          additional_treatments: data.additional_treatments ?? null,
        });
      },
      updateStudent,
      getKnownSpecialEdClassNames: () => [],
    };

    const importResult = await executeImport(rows, deps, {
      status: "personal-basket",
      category,
      canAssignTeachers,
      allowCreates: !memberCannotCreate,
      defaultFrequency: "high",
    });

    const skipped =
      counts.duplicate_in_file +
      counts.error +
      counts.over_capacity +
      counts.invalid_class +
      (memberCannotCreate ? counts.ok : 0);

    setImporting(false);
    setSummary(
      getTextByPath(texts, "personalArea.importExcelSummaryFull")
        .replace("{created}", String(importResult.created))
        .replace("{updated}", String(importResult.updated))
        .replace("{skipped}", String(skipped))
        .replace("{failed}", String(importResult.failed))
    );
    onImported();
  }

  function rowStatusLabel(row: ParsedImportRow): string {
    if (row.status === "error") {
      return getTextByPath(texts, importExcelErrorStatusTextPath(row.message));
    }
    if (row.status === "duplicate_in_file") {
      return getTextByPath(texts, "personalArea.importExcelDuplicateInFile");
    }
    if (row.status === "update") {
      return getTextByPath(texts, "personalArea.importExcelUpdate");
    }
    if (row.status === "ok" && memberCannotCreate) {
      return "רק מנהלים יכולים להוסיף תלמידים — פנו לרכז/ת";
    }
    return getTextByPath(texts, "personalArea.importExcelOk");
  }

  function frequencyLabel(row: ParsedImportRow): string {
    if (row.frequency === "high") {
      return getTextByPath(texts, "personalArea.importExcelFrequencyHigh");
    }
    if (row.frequency === "low") {
      return getTextByPath(texts, "personalArea.importExcelFrequencyLow");
    }
    return getTextByPath(texts, "personalArea.importExcelFrequencyUnknown");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <EditableText path="personalArea.importExcelTitle" as="span" />
          </DialogTitle>
          <DialogDescription>
            <EditableText
              path="personalArea.importExcelPersonalBasketDescription"
              as="span"
            />
          </DialogDescription>
        </DialogHeader>

        {isFreeAccessMode() ? (
          <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-center text-sm text-brand-800">
            בכניסה חופשית אפשר לייבא מאקסל — ניסיון מילוי רק בתלמיד הראשון שיובא,
            בלי הדפסה.
          </p>
        ) : null}

        <div className="flex flex-col gap-4">
          <aside
            className="rounded-2xl border border-amber-200/80 bg-gradient-to-l from-amber-50 via-orange-50/70 to-brand-50/40 px-4 py-3.5 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
            aria-live="polite"
          >
            <div className="mb-2.5 flex items-center justify-start gap-2">
              <CircleAlert
                className="h-5 w-5 shrink-0 text-amber-700"
                aria-hidden
              />
              <p className="text-sm font-bold text-ink">
                <EditableText
                  path="personalArea.importExcelNoticeTitle"
                  as="span"
                />
              </p>
            </div>
            <ul className="flex list-none flex-col gap-2.5 pr-0 text-sm leading-relaxed text-ink/85">
              <li className="flex gap-2.5">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                  aria-hidden
                />
                <EditableText
                  path="personalArea.importExcelNoticeMissing"
                  as="span"
                />
              </li>
              <li className="flex gap-2.5">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                  aria-hidden
                />
                <EditableText
                  path="personalArea.importExcelNoticeUnknown"
                  as="span"
                />
              </li>
              <li className="flex gap-2.5">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                  aria-hidden
                />
                <EditableText
                  path="personalArea.importExcelPersonalBasketColumns"
                  as="span"
                />
              </li>
              {!getCanAssignTeachers() ? (
                <li className="flex gap-2.5">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                    aria-hidden
                  />
                  <EditableText
                    path="personalArea.importExcelOwnerAssignsTeacher"
                    as="span"
                  />
                </li>
              ) : null}
            </ul>
          </aside>

          <div className="flex justify-center">
            <Button asChild type="button" variant="outline" size="sm">
              <a href={PERSONAL_BASKET_STUDENT_IMPORT_SAMPLE_HREF} download>
                <Download className="h-4 w-4" />
                <EditableText path="personalArea.importExcelDownloadSample" />
              </a>
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <Upload className="h-4 w-4" />
              <EditableText path="personalArea.importExcelChooseFile" />
            </Button>
            {fileName ? (
              <span className="inline-flex items-center gap-2 text-sm text-pink">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
              </span>
            ) : null}
          </div>

          {parseError ? (
            <p className="text-center text-sm text-destructive">{parseError}</p>
          ) : null}

          {rows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-center text-sm font-bold text-ink">
                <EditableText path="personalArea.importExcelPreview" as="span" />
                <span className="mt-1 block font-normal text-pink">
                  {actionableCount} / {rows.length}
                  {counts.ok > 0 && (
                    <span className="mr-2">
                      ({highCount} גבוהה, {lowCount} נמוכה)
                    </span>
                  )}
                </span>
              </h3>
              {rows.some((row) => row.fieldWarnings?.length) ? (
                <div className="whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {rows.flatMap((row) =>
                    (row.fieldWarnings ?? []).map(
                      (warning) => `שורה ${row.rowNumber}: ${warning}`
                    )
                  ).join("\n")}
                </div>
              ) : null}
              <div className="max-h-64 overflow-auto rounded-2xl border border-brand-100">
                <table className="w-full text-right text-sm">
                  <thead className="sticky top-0 bg-brand-50 text-ink">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">שם</th>
                      <th className="px-3 py-2 font-semibold">כיתה</th>
                      <th className="px-3 py-2 font-semibold">שכיחות</th>
                      <th className="px-3 py-2 font-semibold">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={cn(
                          "border-t border-brand-50",
                          row.status === "ok" && "bg-white",
                          row.status === "update" && "bg-blue-50/60",
                          row.status === "duplicate_in_file" && "bg-amber-50/60",
                          row.status === "error" && "bg-red-50/70"
                        )}
                      >
                        <td className="px-3 py-2 text-pink">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-medium text-ink">
                          {row.full_name || "—"}
                        </td>
                        <td className="px-3 py-2 text-pink">
                          {row.class_name || "—"}
                        </td>
                        <td className="px-3 py-2 text-pink">
                          {row.status === "ok" || row.status === "update" ? (
                            <span
                              className={cn(
                                "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                                row.frequency === "low"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-green-100 text-green-700"
                              )}
                            >
                              {frequencyLabel(row)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">{rowStatusLabel(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {summary ? (
            <p className="text-center text-sm font-medium text-ink">{summary}</p>
          ) : null}
        </div>

        <DialogFooter>
          {summary ? (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              <EditableText path="personalArea.importExcelClose" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                disabled={importing || actionableCount === 0}
                onClick={() => void handleImport()}
              >
                {importing ? (
                  <EditableText path="personalArea.importExcelImporting" />
                ) : (
                  <>
                    <EditableText path="personalArea.importExcelConfirm" />
                    {actionableCount > 0 ? ` (${actionableCount})` : null}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={importing}
                onClick={() => handleOpenChange(false)}
              >
                <EditableText path="wizard.cancelButton" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
