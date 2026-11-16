"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { syncClassStudentListFromRoster } from "@/lib/class-curriculum-import";
import {
  countImportPreview,
  importExcelErrorStatusTextPath,
  parseStudentImportFile,
  studentImportSampleHref,
  type ParsedImportRow,
} from "@/lib/student-excel-import";
import {
  executeImport,
  formatImportOutcomeMessage,
  resolveEffectiveTeacherName,
  type ImportDeps,
} from "@/lib/student-excel-import-actions";
import { getTextByPath } from "@/lib/get-text-by-path";
import {
  getCanAssignTeachers,
  getStudents,
  getUser,
  saveStudent,
  updateStudent,
} from "@/lib/mock-store";
import { teacherNameForExcelImport } from "@/lib/teacher-assignment";
import { isFreeAccessMode } from "@/lib/free-access";
import {
  isMidYearIntakeTarget,
  markMidYearIntake,
  midYearIntakeYear,
} from "@/lib/mid-year-intake";
import {
  getKnownSpecialEdClassNames,
  normalizeSpecialEdClassName,
  specialEdClassMatchKey,
} from "@/lib/special-ed-classes";
import {
  checkClassCreateAllowed,
  formatClassQuotaMessage,
  planLimitErrorMessage,
  resolvePlanLimits,
  SPECIAL_ED_STUDENTS_PER_CLASS,
} from "@/lib/plan-limits";
import { getCanManageStudents, getStudents as getStoreStudents } from "@/lib/mock-store";
import { isBillingExemptProfile } from "@/lib/billing-access";
import type { PersonalSector } from "@/lib/personal-sector";
import type {
  Category,
  IntegrationFrequency,
  StudentStatus,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/** @deprecated ייבוא מ־@/lib/student-excel-import */
export { SPECIAL_ED_STUDENT_IMPORT_SAMPLE_HREF } from "@/lib/student-excel-import";

export { INTEGRATION_STUDENT_IMPORT_SAMPLE_HREF } from "@/lib/student-excel-import";

interface StudentExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: StudentStatus;
  sector?: PersonalSector;
  teacherName?: string;
  frequency?: IntegrationFrequency;
  /** כיתה נוכחית — לחינוך מיוחד */
  className?: string;
  /** קליטת תלמידים חדשים באמצע השנה — נשמרים בהמתנה עד העברה */
  markAsMidYearIntake?: boolean;
  intakeYear?: number;
  onImported: () => void;
}

export function StudentExcelImportDialog({
  open,
  onOpenChange,
  status,
  sector,
  teacherName,
  frequency,
  className,
  markAsMidYearIntake = false,
  intakeYear,
  onImported,
}: StudentExcelImportDialogProps) {
  const { texts } = useSiteText();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const [selectedClassName, setSelectedClassName] = useState<string>("");
  const [customClassName, setCustomClassName] = useState<string>("");
  const [useCustomClass, setUseCustomClass] = useState(false);
  const [customClassError, setCustomClassError] = useState<string | null>(null);

  const category: Category = sector ?? "schools";
  const importStatus: StudentStatus =
    status === "integration-teacher" ? "integration" : status;
  const isSpecialEdClass = importStatus === "special-ed-class";
  const isIntegrationImport =
    importStatus === "integration" || status === "integration-teacher";
  const sampleHref = studentImportSampleHref(status);
  const counts = countImportPreview(rows);
  const invalidClassMessage = rows.find((row) => row.status === "invalid_class")
    ?.message;
  const classMappingNotice = rows.find(
    (row) => row.classMappedFrom && row.class_name
  );

  const knownClasses = isSpecialEdClass ? getKnownSpecialEdClassNames(category) : [];
  const knownClassesForQuota = isSpecialEdClass
    ? getKnownSpecialEdClassNames(category, { includePlaceholder: false })
    : [];
  const hasKnownClasses = knownClasses.length > 0;

  const effectiveClassName = className?.trim()
    || (useCustomClass ? customClassName.trim() : selectedClassName)
    || null;
  const needsClassNameInput = isSpecialEdClass && !className?.trim();

  function resetPreview() {
    setRows([]);
    setFileName(null);
    setParseError(null);
    setSummary(null);
    setSyncWarnings([]);
    setSelectedClassName("");
    setCustomClassName("");
    setUseCustomClass(false);
    setCustomClassError(null);
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
    setSyncWarnings([]);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const user = getUser();

      const result = await parseStudentImportFile(buffer, {
        status: importStatus,
        category,
        existingStudents: getStudents(),
        defaultTeacherName: getCanAssignTeachers() ? teacherName ?? null : null,
        defaultClassName: effectiveClassName,
        knownClassNames: knownClassesForQuota,
        planContext: user?.plan_id ? {
          planId: user.plan_id,
          institutionType: user.institution_type ?? category,
          educationFramework: user.education_framework ?? null,
          planCustomClasses: user.plan_custom_classes ?? null,
          planCustomStudents: user.plan_custom_students ?? null,
        } : null,
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

  async function handleImport() {
    // TZ-28: Members cannot create - only process updates for them
    const toCreate = memberCannotCreate 
      ? [] 
      : rows.filter((row) => row.status === "ok");
    const toUpdate = rows.filter((row) => row.status === "update");
    if (toCreate.length === 0 && toUpdate.length === 0) return;

    setImporting(true);
    setSummary(null);
    setSyncWarnings([]);

    const user = getUser();

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
        const student = await saveStudent({
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
            getCanAssignTeachers()
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
        if (
          markAsMidYearIntake &&
          isMidYearIntakeTarget(importStatus) &&
          sector
        ) {
          markMidYearIntake(student.id, {
            targetStatus: importStatus,
            year: intakeYear ?? midYearIntakeYear(),
            sector,
            frequency:
              importStatus === "personal-basket"
                ? frequency ?? "high"
                : null,
          });
        }
        return student;
      },
      updateStudent,
      getKnownSpecialEdClassNames: (cat) =>
        getKnownSpecialEdClassNames(cat, { includePlaceholder: false }),
    };

    // TZ-28: Members sync/create with their staff card name; admins use the page prop.
    // Must use effectiveTeacherName for תל״כ sync too — the raw teacherName prop is
    // often null on the class page, so members would sync with null and fail silently.
    const effectiveTeacherName = resolveEffectiveTeacherName({
      isAdmin,
      propTeacherName: teacherName,
      memberTeacherName,
    });

    try {
      const importResult = await executeImport(rows, deps, {
        status: importStatus,
        category,
        defaultClassName: effectiveClassName,
        teacherName: effectiveTeacherName,
        canAssignTeachers: getCanAssignTeachers(),
        allowCreates: !memberCannotCreate,
        // Page frequency only (high/low list or mid-year intake). Never invent "high".
        defaultFrequency: frequency ?? null,
      });

      if (isSpecialEdClass && (importResult.created > 0 || importResult.updated > 0)) {
        const warnings: string[] = [];
        for (const cn of importResult.classesChanged) {
          try {
            await syncClassStudentListFromRoster({
              category,
              teacherName: effectiveTeacherName,
              className: cn,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "שגיאה לא צפויה בסנכרון";
            warnings.push(`סנכרון רשימת התלמידים לתל"כ נכשל עבור כיתה "${cn}": ${msg}`);
          }
        }
        if (warnings.length > 0) {
          setSyncWarnings(warnings);
        }
      }

      setSummary(
        formatImportOutcomeMessage(importResult, {
          className: isSpecialEdClass ? effectiveClassName : null,
        })
      );
      if (importResult.created > 0 || importResult.updated > 0) {
        onImported();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
      setSummary(`הייבוא נכשל: ${msg}`);
    } finally {
      setImporting(false);
    }
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
    if (row.status === "over_capacity") {
      // Show the real error message from parsing
      return row.message ?? planLimitErrorMessage({
        kind: "students_per_class",
        limit: SPECIAL_ED_STUDENTS_PER_CLASS,
        current: SPECIAL_ED_STUDENTS_PER_CLASS,
      });
    }
    if (row.status === "invalid_class") {
      return row.message ?? "כיתה לא תקינה";
    }
    // TZ-28: Members cannot create new students - only updates allowed
    if (row.status === "ok" && memberCannotCreate) {
      return "רק מנהלים יכולים להוסיף תלמידים — פנו לרכז/ת";
    }
    return getTextByPath(texts, "personalArea.importExcelOk");
  }

  // TZ-28: Check if user is admin/owner (can manage students)
  // Uses cached canManageStudents from session which is:
  // membershipRole === "owner" || membershipRole === "admin" || profile.is_admin === true
  const user = getUser();
  const isAdmin = getCanManageStudents();
  const isBillingExempt = user ? isBillingExemptProfile(user) : false;

  // TZ-28: Find the user's staff card (for members)
  // Staff card: status = "integration-teacher" AND user_profile_id = current user
  const userStaffCard = user?.id
    ? getStoreStudents().find(
        (s) => s.status === "integration-teacher" && s.user_profile_id === user.id
      )
    : null;
  const memberTeacherName = userStaffCard?.full_name?.trim() || null;

  // TZ-28: Members cannot create students (server blocks this)
  // If !isAdmin and rows have "ok" status, they need to ask the coordinator
  const memberCannotCreate = !isAdmin;
  const memberHasNoStaffCard = memberCannotCreate && !memberTeacherName;

  // Get the per-class limit from the plan
  const planLimits = user?.plan_id
    ? resolvePlanLimits(user.plan_id, {
        classes: user.plan_custom_classes,
        students: user.plan_custom_students,
      }, user.education_framework ?? null)
    : null;
  const perClassLimit = SPECIAL_ED_STUDENTS_PER_CLASS;

  // Validate custom class name
  function validateCustomClass(name: string): string | null {
    if (!name.trim()) return null;
    const normalized = normalizeSpecialEdClassName(name);
    const alreadyKnown = knownClassesForQuota.some(
      (existing) => specialEdClassMatchKey(existing) === specialEdClassMatchKey(normalized)
    );
    if (alreadyKnown) return null;
    
    // Check if we can create this class (skip ONLY for billing-exempt, not all admins)
    // Institution admins who are not billing-exempt should still get quota check
    if (user?.plan_id && !isBillingExempt) {
      const violation = checkClassCreateAllowed({
        planId: user.plan_id,
        institutionType: user.institution_type ?? category,
        educationFramework: user.education_framework ?? null,
        students: getStudents(),
        className: normalized,
        knownClassNames: knownClassesForQuota,
        planCustomClasses: user.plan_custom_classes ?? null,
        planCustomStudents: user.plan_custom_students ?? null,
      });
      if (violation) {
        return formatClassQuotaMessage(violation, {
          existingClassNames: knownClassesForQuota,
          requestedClassName: name,
        });
      }
    }
    return null;
  }

  // TZ-28: Members cannot create - only count updates for them
  const actionableCount = memberCannotCreate 
    ? counts.update 
    : counts.ok + counts.update;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <EditableText path="personalArea.importExcelTitle" as="span" />
          </DialogTitle>
          <DialogDescription>
            <EditableText
              path={
                isSpecialEdClass
                  ? "personalArea.importExcelSpecialEdDescription"
                  : "personalArea.importExcelDescription"
              }
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
              {isSpecialEdClass ? (
                <li className="flex gap-2.5">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                    aria-hidden
                  />
                  <EditableText
                    path="personalArea.importExcelSpecialEdColumns"
                    as="span"
                  />
                </li>
              ) : null}
              {isIntegrationImport ? (
                <li className="flex gap-2.5">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                    aria-hidden
                  />
                  <EditableText
                    path="personalArea.importExcelIntegrationColumns"
                    as="span"
                  />
                </li>
              ) : null}
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

          {sampleHref ? (
            <div className="flex justify-center">
              <Button asChild type="button" variant="outline" size="sm">
                <a href={sampleHref} download>
                  <Download className="h-4 w-4" />
                  <EditableText path="personalArea.importExcelDownloadSample" />
                </a>
              </Button>
            </div>
          ) : null}

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
              disabled={importing || !!customClassError}
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

          {needsClassNameInput && rows.length === 0 ? (
            <div className="flex flex-col gap-3">
              <Label>
                <EditableText path="personalArea.importExcelClassNameLabel" />
              </Label>
              {hasKnownClasses && !useCustomClass ? (
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedClassName}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const value = e.target.value;
                      if (value === "__new__") {
                        setUseCustomClass(true);
                        setSelectedClassName("");
                      } else {
                        setSelectedClassName(value);
                      }
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">בחרו כיתה</option>
                    {knownClasses.map((cn) => (
                      <option key={cn} value={cn}>
                        {cn}
                      </option>
                    ))}
                    <option value="__new__">+ כיתה חדשה...</option>
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Input
                    value={customClassName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomClassName(value);
                      // Validate immediately
                      const error = validateCustomClass(value);
                      setCustomClassError(error);
                    }}
                    placeholder="הזינו שם כיתה"
                  />
                  {customClassError ? (
                    <p className="text-sm text-destructive">{customClassError}</p>
                  ) : null}
                  {hasKnownClasses && useCustomClass ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUseCustomClass(false);
                        setCustomClassName("");
                        setCustomClassError(null);
                      }}
                    >
                      חזרה לבחירה מרשימה
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-center text-sm font-bold text-ink">
                <EditableText path="personalArea.importExcelPreview" as="span" />
                <span className="mt-1 block font-normal text-pink">
                  {actionableCount} / {rows.length}
                  {counts.update > 0 ? (
                    <span className="mr-2 text-blue-600">
                      ({counts.update} עדכון)
                    </span>
                  ) : null}
                </span>
              </h3>

              {/* TZ-28: Warning for members who can't create new students */}
              {memberCannotCreate && counts.ok > 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    {counts.ok} תלמידים חדשים — רק מנהלים יכולים להוסיף, פנו לרכז/ת
                  </span>
                </div>
              ) : null}

              {/* TZ-28: Warning for members with no staff card */}
              {memberHasNoStaffCard && counts.update > 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    לא נמצא כרטיס צוות מקושר — פנו לרכז/ת
                  </span>
                </div>
              ) : null}

              {counts.over_capacity > 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    {counts.over_capacity} שורות חורגות ממכסת התלמידים לכיתה (
                    {perClassLimit})
                  </span>
                </div>
              ) : null}

              {counts.invalid_class > 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    {counts.invalid_class} שורות עם כיתה לא תקינה
                    {invalidClassMessage ? (
                      <span className="mt-1 block font-normal">
                        {invalidClassMessage}
                      </span>
                    ) : null}
                  </span>
                </div>
              ) : null}

              {rows.some((row) => row.fieldWarnings?.length) ? (
                <div className="whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {rows.flatMap((row) =>
                    (row.fieldWarnings ?? []).map(
                      (warning) => `שורה ${row.rowNumber}: ${warning}`
                    )
                  ).join("\n")}
                </div>
              ) : null}

              {classMappingNotice?.classMappedFrom && classMappingNotice.class_name ? (
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-center text-sm text-blue-800">
                  הכיתה בקובץ («{classMappingNotice.classMappedFrom}») שויכה לכיתה
                  הקיימת «{classMappingNotice.class_name}».
                </div>
              ) : null}

              <div className="max-h-64 overflow-auto rounded-2xl border border-brand-100">
                <table className="w-full text-right text-sm">
                  <thead className="sticky top-0 bg-brand-50 text-ink">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">שם</th>
                      {isSpecialEdClass ? (
                        <>
                          <th className="px-3 py-2 font-semibold">אפיון</th>
                          <th className="px-3 py-2 font-semibold">תפקוד</th>
                          <th className="px-3 py-2 font-semibold">כיתה</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2 font-semibold">טלפון</th>
                          <th className="px-3 py-2 font-semibold">מייל</th>
                          <th className="px-3 py-2 font-semibold">ת. לידה</th>
                          {isIntegrationImport ? (
                            <th className="px-3 py-2 font-semibold">
                              תאריך כניסה לשילוב
                            </th>
                          ) : null}
                          <th className="px-3 py-2 font-semibold">כיתה</th>
                        </>
                      )}
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
                          row.status === "over_capacity" && "bg-red-50/70",
                          row.status === "invalid_class" && "bg-red-50/70",
                          row.status === "error" && "bg-red-50/70"
                        )}
                      >
                        <td className="px-3 py-2 text-pink">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-medium text-ink">
                          {row.full_name || "—"}
                        </td>
                        {isSpecialEdClass ? (
                          <>
                            <td className="px-3 py-2 text-pink">
                              {row.characterization || "—"}
                            </td>
                            <td className="max-w-[10rem] truncate px-3 py-2 text-pink">
                              {row.functioning || "—"}
                            </td>
                            <td className="px-3 py-2 text-pink">
                              {row.class_name || "—"}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-pink" dir="ltr">
                              {row.phone || "—"}
                            </td>
                            <td className="px-3 py-2 text-pink" dir="ltr">
                              {row.email || "—"}
                            </td>
                            <td className="px-3 py-2 text-pink">
                              {row.birth_date || "—"}
                            </td>
                            {isIntegrationImport ? (
                              <td className="px-3 py-2 text-pink">
                                {row.integration_start_date || "—"}
                              </td>
                            ) : null}
                            <td className="px-3 py-2 text-pink">
                              {row.class_name || "—"}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2">{rowStatusLabel(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {summary ? (
            <p
              className={cn(
                "text-center text-sm font-medium",
                summary.startsWith("הייבוא נכשל") || summary.startsWith("לא יובאו")
                  ? "text-destructive"
                  : "text-ink"
              )}
              role="status"
            >
              {summary}
            </p>
          ) : null}

          {syncWarnings.length > 0 ? (
            <div className="flex flex-col gap-2">
              {syncWarnings.map((warning, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
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
