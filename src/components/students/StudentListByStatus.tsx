"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Download,
  Eye,
  FileSpreadsheet,
  Mail,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { ParentFormBulkSendDialog } from "@/components/students/ParentFormBulkSendDialog";
import { fetchStudentParentFormSendStatuses } from "@/lib/form-parent-send-status-client";
import {
  formatParentFormSendStatusLine,
  type StudentParentFormSendStatus,
} from "@/lib/form-parent-send-status";
import { Button } from "@/components/ui/button";
import { StudentFolderIconLink } from "@/components/students/StudentFolderIconLink";
import {
  studentImportSampleHref,
  studentImportSupportsSampleDownload,
} from "@/lib/student-excel-import";
import {
  StudentExcelImportDialog,
} from "@/components/students/StudentExcelImportDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteStudent,
  getCanManageStudents,
  getStudentsByStatus,
  getStudentsByStatusAndFrequency,
  getStudentsByStatusAndTeacher,
  getStudentsLinkedToTeacher,
} from "@/lib/mock-store";
import { syncStudentsFromClassCurriculum, syncClassStudentListFromRoster } from "@/lib/class-curriculum-import";
import { STATUS_LIST_TITLE_PATH } from "@/lib/labels";
import { canAccessSpecialEdClasses } from "@/lib/plan-limits-client";
import type {
  IntegrationFrequency,
  Student,
  StudentStatus,
} from "@/lib/supabase/types";
import { EditableText } from "@/components/editable/EditableText";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { subscribeDataCache } from "@/lib/data-cache";
import { getTextByPath } from "@/lib/get-text-by-path";
import {
  isPersonalSector,
  sectorFrameworkHref,
  sectorSpecialEdClassHref,
  sectorStatusHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type { SpecialEdMode } from "@/lib/special-ed-mode";
import {
  studentMatchesSpecialEdClass,
} from "@/lib/special-ed-classes";
import {
  matchesPersonQuery,
  PersonSearchField,
  uniqueSearchOptions,
} from "@/components/students/PersonSearchField";
import { TeachersRoster } from "@/components/students/TeachersRoster";
import { formatStudentDisplayName } from "@/lib/person-name";
import { hrefWithFrom, hrefWithSearch, rememberNavBackHref } from "@/lib/navigation-back";
import { studentPortfolioHref } from "@/lib/student-portfolio";
import {
  archiveStudentFile,
  canArchiveStudentFile,
} from "@/lib/archive-student-file";
import {
  formatIntegrationDateForDisplay,
  integrationRenewalDueDate,
  studentIntegrationRenewalIsOverdue,
  studentNeedsIntegrationRenewalAlert,
  studentsNeedingIntegrationRenewal,
} from "@/lib/integration-renewal";

function loadStudentsForList(
  status: StudentStatus,
  teacherName: string | undefined,
  frequency: IntegrationFrequency | undefined,
  sector?: PersonalSector,
  className?: string
): Student[] {
  if (status === "personal-basket" && frequency) {
    return getStudentsByStatusAndFrequency(status, frequency, sector);
  }
  let list: Student[];
  if (!teacherName) {
    list = getStudentsByStatus(status, sector);
  } else if (status === "integration-teacher") {
    list = getStudentsLinkedToTeacher(teacherName, sector);
  } else {
    list = getStudentsByStatusAndTeacher(status, teacherName, sector);
  }
  if (status === "special-ed-class" && className) {
    return list.filter((student) =>
      studentMatchesSpecialEdClass(student, className)
    );
  }
  return list;
}

interface StudentListByStatusProps {
  status: StudentStatus;
  teacherName?: string;
  frequency?: IntegrationFrequency;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  /** כיתות חינוך מיוחד — חזרה למצב תיק תלמיד */
  specialEdMode?: SpecialEdMode;
  /** שם כיתה במסגרות חינוך מיוחד */
  className?: string;
}

export function StudentListByStatus({
  status,
  teacherName,
  frequency,
  sector,
  framework = "special",
  area = "personal-area",
  specialEdMode,
  className,
}: StudentListByStatusProps) {
  // קטגוריית צוות — רשימת מורות בלי תיק תלמיד (לפני hooks של רשימת תלמידים)
  if (status === "integration-teacher" && !teacherName) {
    return (
      <div className="menu-box">
        <TeachersRoster sector={sector} framework={framework} area={area} />
        <div className="mt-4">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={
                sector
                  ? sectorFrameworkHref(sector, framework, area)
                  : "/personal-area"
              }
            >
              <ArrowRight className="h-4 w-4" />
              <EditableText path="personalArea.backToTable" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <StudentListByStatusInner
      status={status}
      teacherName={teacherName}
      frequency={frequency}
      sector={sector}
      framework={framework}
      area={area}
      specialEdMode={specialEdMode}
      className={className}
    />
  );
}

function StudentListByStatusInner({
  status,
  teacherName,
  frequency,
  sector,
  framework = "special",
  area = "personal-area",
  specialEdMode,
  className,
}: StudentListByStatusProps) {
  const router = useRouter();
  const pathname = usePathname();
  const locationHref =
    typeof window !== "undefined"
      ? hrefWithSearch(pathname, window.location.search)
      : pathname;
  const { ready: dataReady, guestDemo } = useDataStore();
  const { texts } = useSiteText();
  const [students, setStudents] = useState<Student[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  // TZ-28: Members cannot add or delete students
  const [canManageStudents, setCanManageStudents] = useState(true);
  // TZ-161: Default to false to prevent button flash before access check completes
  const [canAddSpecialEd, setCanAddSpecialEd] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [renewalToday, setRenewalToday] = useState<Date | null>(null);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [parentQStatusById, setParentQStatusById] = useState<
    Map<string, StudentParentFormSendStatus>
  >(new Map());
  const sampleHref = studentImportSampleHref(status);

  useEffect(() => {
    if (typeof window !== "undefined") {
      rememberNavBackHref(hrefWithSearch(pathname, window.location.search));
    }
  }, [pathname]);

  useEffect(() => {
    setRenewalToday(new Date());
  }, []);

  function studentViewHref(studentId: string) {
    return hrefWithFrom(`/personal-area/students/view/${studentId}`, locationHref);
  }

  function studentFolderHref(studentId: string) {
    return studentPortfolioHref(studentId, locationHref);
  }

  function reloadStudents() {
    setStudents(
      loadStudentsForList(status, teacherName, frequency, sector, className)
    );
  }

  useEffect(() => {
    if (!dataReady) return;
    reloadStudents();
    setReady(true);
    setCanManageStudents(getCanManageStudents());
    setCanAddSpecialEd(canAccessSpecialEdClasses());
    return subscribeDataCache(() => {
      setStudents(
        loadStudentsForList(status, teacherName, frequency, sector, className)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, teacherName, frequency, sector, dataReady, className]);

  useEffect(() => {
    if (!dataReady) return;
    if (status !== "special-ed-class" || specialEdMode !== "student") return;
    let cancelled = false;

    void (async () => {
      try {
        await syncStudentsFromClassCurriculum({
          category: sector ?? "schools",
          teacherName,
          className,
        });
        await syncClassStudentListFromRoster({
          category: sector ?? "schools",
          teacherName,
          className,
        });
      } catch {
        // הרשימה עדיין תוצג גם אם הסנכרון נכשל
      }
      if (cancelled) return;
      reloadStudents();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, teacherName, sector, dataReady, specialEdMode, className]);

  const filtered = useMemo(
    () =>
      students.filter((student) =>
        matchesPersonQuery(
          query,
          student.full_name,
          student.teacher_name,
          student.father_name,
          student.mother_name,
          student.phone,
          student.class_name
        )
      ),
    [students, query]
  );

  const renewalStudents = useMemo(
    () => renewalToday ? studentsNeedingIntegrationRenewal(students, renewalToday) : [],
    [students, renewalToday]
  );

  const searchOptions = useMemo(
    () =>
      status === "personal-basket"
        ? uniqueSearchOptions(
            students.map((s) => formatStudentDisplayName(s.full_name))
          )
        : uniqueSearchOptions(
            students.map((s) => formatStudentDisplayName(s.full_name)),
            students.map((s) => s.teacher_name)
          ),
    [students, status]
  );

  const institutionScopeStudents = useMemo(() => {
    if (status !== "special-ed-class" || !className) return undefined;
    return getStudentsByStatus(status, sector);
  }, [status, className, sector, dataReady]);

  useEffect(() => {
    if (guestDemo || filtered.length === 0) return;
    const formId = "parent-questionnaire";
    let cancelled = false;
    void fetchStudentParentFormSendStatuses(
      formId,
      filtered.map((s) => s.id)
    ).then((result) => {
      if (cancelled || !result.ok || !result.statuses) return;
      const next = new Map<string, StudentParentFormSendStatus>();
      for (const row of result.statuses) {
        next.set(row.studentId, row);
      }
      setParentQStatusById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [filtered, guestDemo, bulkMessage]);

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteStudent(deleteTarget.id);
    reloadStudents();
    setDeleteTarget(null);
  }

  async function handleArchive() {
    if (!archiveTarget || archiveBusy) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const result = await archiveStudentFile(archiveTarget);
      if (!result.ok) {
        setArchiveError(
          getTextByPath(texts, "studentCard.archiveStudentFileError") ||
            "לא ניתן להעביר לארכיון כרגע — נסו שוב"
        );
        return;
      }
      setArchiveTarget(null);
      reloadStudents();
      router.push("/personal-area/archive");
      router.refresh();
    } catch {
      setArchiveError(
        getTextByPath(texts, "studentCard.archiveStudentFileError") ||
          "לא ניתן להעביר לארכיון כרגע — נסו שוב"
      );
    } finally {
      setArchiveBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    );
  }

  const backHref = frequency
    ? sector
      ? sectorStatusHref(sector, status, framework, area)
      : `/personal-area/category/${status}`
    : specialEdMode && className
      ? sector
        ? sectorSpecialEdClassHref(sector, className, framework, area)
        : `/personal-area/category/${status}/class/${encodeURIComponent(className)}`
      : specialEdMode
        ? sector
          ? sectorStatusHref(sector, status, framework, area)
          : `/personal-area/category/${status}`
        : teacherName
          ? sector
            ? sectorStatusHref(sector, status, framework, area)
            : `/personal-area/category/${status}`
          : sector
            ? sectorFrameworkHref(sector, framework, area)
            : "/personal-area";

  const newStudentStatus =
    status === "integration-teacher" ? "integration" : status;

  const frequencyTitlePath =
    frequency === "high"
      ? "status.frequencyHighListTitle"
      : frequency === "low"
        ? "status.frequencyLowListTitle"
        : null;

  return (
    <div className="menu-box">
      <h2 className="mb-4 border-b-2 border-brand-200 pb-2 text-center text-xl font-bold text-ink">
        {teacherName && status === "integration-teacher" ? (
          <>
            <EditableText path="status.teacherStudentsHeading" />
            <span className="mt-1 block text-lg text-pink">{teacherName}</span>
          </>
        ) : frequencyTitlePath ? (
          <EditableText path={frequencyTitlePath} />
        ) : (
          <>
            <EditableText path={STATUS_LIST_TITLE_PATH[status]} />
            {className ? (
              <span className="mt-1 block text-lg text-pink">{className}</span>
            ) : null}
          </>
        )}
      </h2>

      {renewalStudents.length > 0 ? (
        <div
          className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right"
          role="status"
        >
          <div className="flex items-start gap-2 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                <EditableText path="personalArea.integrationRenewalAlertTitle" />
              </p>
              <p className="mt-1 text-sm">
                <EditableText path="personalArea.integrationRenewalAlertHint" />
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {renewalStudents.map((student) => {
                  const due = integrationRenewalDueDate(
                    student.integration_start_date
                  );
                  return (
                    <li key={student.id} className="text-sm">
                      <Link
                        href={studentFolderHref(student.id)}
                        className="font-bold text-pink"
                        onClick={() => rememberNavBackHref(locationHref)}
                      >
                        {formatStudentDisplayName(student.full_name)}
                      </Link>
                      {due ? (
                        <span className="mr-2 text-amber-800">
                          {" "}
                          · {formatIntegrationDateForDisplay(due)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {bulkMessage ? (
        <p className="mb-3 text-center text-sm font-medium text-brand-700">
          {bulkMessage}
        </p>
      ) : null}

      {canManageStudents && !guestDemo && filtered.length > 0 ? (
        <div className="mb-4 flex justify-center">
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => setBulkSendOpen(true)}
          >
            <Mail className="h-5 w-5" />
            שליחה גורפת להורים
          </Button>
        </div>
      ) : null}

      <PersonSearchField
        id={`status-list-search-${status}`}
        value={query}
        onChange={setQuery}
        onSelect={(selectedName) => {
          const selectedStudent = students.find(
            (student) =>
              formatStudentDisplayName(student.full_name) === selectedName
          );
          if (selectedStudent) {
            rememberNavBackHref(locationHref);
            router.push(studentFolderHref(selectedStudent.id));
          }
        }}
        options={searchOptions}
      />

      {filtered.length === 0 ? (
        <div className="p-6 text-center">
          <EditableText
            path="personalArea.emptyList"
            as="p"
            block
            className="text-pink"
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((student) => (
            <li key={student.id} className="menu-item justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={studentFolderHref(student.id)}
                    className="break-words text-lg font-bold text-pink"
                    title={formatStudentDisplayName(student.full_name)}
                    onClick={() => rememberNavBackHref(locationHref)}
                  >
                    {formatStudentDisplayName(student.full_name)}
                  </Link>
                  {parentQStatusById.has(student.id) ? (
                    <p className="text-xs font-medium text-pink/90">
                      שאלון טרום תח״י:{" "}
                      {formatParentFormSendStatusLine({
                        lastSentAt:
                          parentQStatusById.get(student.id)?.lastSentAt ?? null,
                        filled: parentQStatusById.get(student.id)?.filled ?? false,
                      })}
                    </p>
                  ) : null}
                </div>
                {renewalToday && studentNeedsIntegrationRenewalAlert(student, renewalToday) ? (
                  <span className="inline-flex shrink-0 self-start rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 sm:self-center">
                    <EditableText
                      path={
                        studentIntegrationRenewalIsOverdue(student, renewalToday)
                          ? "personalArea.integrationRenewalOverdueBadge"
                          : "personalArea.integrationRenewalBadge"
                      }
                    />
                  </span>
                ) : null}
                {!guestDemo && canArchiveStudentFile(student) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 self-start sm:self-center"
                    onClick={() => {
                      setArchiveError(null);
                      setArchiveTarget(student);
                    }}
                  >
                    <Archive className="h-4 w-4" />
                    <EditableText path="studentCard.archiveStudentFile" />
                  </Button>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild size="icon" variant="ghost" className="h-9 w-9">
                  <Link
                    href={studentViewHref(student.id)}
                    aria-label="צפייה"
                    onClick={() => rememberNavBackHref(locationHref)}
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="icon" variant="ghost" className="h-9 w-9">
                  <Link
                    href={hrefWithFrom(
                      `/personal-area/students/${student.id}`,
                      locationHref
                    )}
                    aria-label="עריכה"
                    onClick={() => rememberNavBackHref(locationHref)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                {/* TZ-28: Hide delete button for members */}
                {canManageStudents && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-destructive hover:bg-red-50"
                    aria-label="מחיקה"
                    onClick={() => setDeleteTarget(student)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {student.status !== "integration-teacher" ? (
                  <StudentFolderIconLink
                    studentId={student.id}
                    from={locationHref}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* TZ-28: Hide add/import buttons for members.
          TZ-35: Hide add/import for special-ed when the plan has no class quota. */}
      {canManageStudents &&
        (status !== "special-ed-class" || canAddSpecialEd) && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link
              href={(() => {
                const params = new URLSearchParams();
                if (sector && isPersonalSector(sector)) {
                  params.set("category", sector);
                }
                params.set("framework", framework);
                params.set("area", area);
                params.set("status", newStudentStatus);
                if (teacherName?.trim()) {
                  params.set("teacher", teacherName.trim());
                }
                if (frequency) {
                  params.set("frequency", frequency);
                }
                if (className?.trim()) {
                  params.set("class", className.trim());
                }
                return `/personal-area/students/new?${params.toString()}`;
              })()}
            >
              <Plus className="h-5 w-5" />
              <EditableText path="personalArea.addStudent" />
            </Link>
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <FileSpreadsheet className="h-5 w-5" />
            <EditableText path="personalArea.importExcel" />
          </Button>
          {studentImportSupportsSampleDownload(status) && sampleHref ? (
            <Button asChild size="lg" variant="outline">
              <a href={sampleHref} download>
                <Download className="h-5 w-5" />
                <EditableText path="personalArea.importExcelDownloadSample" />
              </a>
            </Button>
          ) : null}
        </div>
      )}

      <div className="mt-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText
              path={
                frequency
                  ? "status.backToFrequencies"
                  : specialEdMode
                    ? "status.specialEdModeBackToModes"
                    : teacherName
                      ? status === "integration-teacher"
                        ? "status.backToStaffList"
                        : "status.backToTeachers"
                      : "personalArea.backToTable"
              }
            />
          </Link>
        </Button>
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText path="wizard.deleteButton" as="span" />
            </DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? formatStudentDisplayName(deleteTarget.full_name)
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              <EditableText path="wizard.deleteButton" />
            </Button>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (archiveBusy) return;
          if (!open) {
            setArchiveTarget(null);
            setArchiveError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText
                path="studentCard.archiveStudentFileTitle"
                as="span"
              />
            </DialogTitle>
            <DialogDescription>
              <EditableText
                path="studentCard.archiveStudentFileDescription"
                as="span"
              />
            </DialogDescription>
          </DialogHeader>
          {archiveTarget ? (
            <p className="text-sm font-medium text-ink">
              {formatStudentDisplayName(archiveTarget.full_name)}
            </p>
          ) : null}
          {archiveError ? (
            <p className="text-sm font-medium text-destructive">{archiveError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              disabled={archiveBusy}
              onClick={() => void handleArchive()}
            >
              {archiveBusy ? (
                <EditableText path="studentCard.archiveStudentFileBusy" />
              ) : (
                <EditableText path="studentCard.archiveStudentFileConfirm" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={archiveBusy}
              onClick={() => {
                setArchiveTarget(null);
                setArchiveError(null);
              }}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ParentFormBulkSendDialog
        open={bulkSendOpen}
        onOpenChange={setBulkSendOpen}
        students={filtered}
        institutionScopeStudents={institutionScopeStudents}
        onComplete={(summary) => {
          setBulkMessage(summary);
          reloadStudents();
        }}
      />

      <StudentExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        status={newStudentStatus}
        sector={sector}
        teacherName={teacherName}
        frequency={frequency}
        className={className}
        onImported={reloadStudents}
      />
    </div>
  );
}
