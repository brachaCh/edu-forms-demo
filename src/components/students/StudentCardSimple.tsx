"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeftRight,
  Archive,
  ArchiveRestore,
  CalendarDays,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  getStudentFormFills,
  getStudents,
  updateStudent,
} from "@/lib/mock-store";
import type { IntegrationFrequency, Student } from "@/lib/supabase/types";
import { EditableText } from "@/components/editable/EditableText";
import { StudentCustomFieldsOnCard } from "@/components/students/StudentCustomFieldsOnCard";
import { StudentCoreFieldsOnCard } from "@/components/students/StudentCoreFieldsOnCard";
import { StudentCalendarYearField } from "@/components/students/StudentCalendarYearField";
import { StudentIntegrationFrequencyField } from "@/components/students/StudentIntegrationFrequencyField";
import { StudentSingleResponsiblePartyField } from "@/components/students/StudentSingleResponsiblePartyField";
import { CardFieldOrderProvider } from "@/components/students/CardFieldOrderContext";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { TextScope } from "@/components/providers/TextScope";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { rememberStudentForForms } from "@/lib/student-card";
import { buildCardPatchFromFormFills } from "@/lib/form-sync";
import { formatStudentDisplayName } from "@/lib/person-name";
import { studentPortfolioHref } from "@/lib/student-portfolio";
import { studentPortfolioFillHref } from "@/lib/form-schemas";
import { isPersonalSector } from "@/lib/personal-sector";
import {
  hrefWithFrom,
  parseSafeFromParam,
  readNavBackHref,
  rememberNavBackHref,
} from "@/lib/navigation-back";
import {
  resolveStudentsListBackHref,
  studentListHrefFromStudent,
  studentsListBackLabelPath,
} from "@/lib/student-list-back";
import {
  canTransferToPersonalBasket,
  transferStudentToPersonalBasket,
} from "@/lib/transfer-student-to-personal-basket";
import {
  canArchiveStudentFile,
  canRestoreStudentFile,
  archiveStudentFile,
  restoreStudentFile,
  isStudentFileArchived,
} from "@/lib/archive-student-file";
import { TeacherInviteButton } from "@/components/students/TeacherInviteButton";

interface StudentCardSimpleProps {
  id: string;
  /** יעד חזרה מהרשימה (?from=) — עדיף על ניחוש לפי סטטוס */
  backHref?: string | null;
}

export function StudentCardSimple({
  id,
  backHref: backHrefProp,
}: StudentCardSimpleProps) {
  const router = useRouter();
  const { ready } = useDataStore();
  const { texts } = useSiteText();
  const [student, setStudent] = useState<Student | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [askTransfer, setAskTransfer] = useState(false);
  const [transferFrequency, setTransferFrequency] =
    useState<IntegrationFrequency>("high");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [askArchive, setAskArchive] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [askRestore, setAskRestore] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const listBackHref = parseSafeFromParam(backHrefProp);

  function listHrefForStudent(current: Student): string {
    return (
      resolveStudentsListBackHref({
        from: backHrefProp,
        stored: readNavBackHref(),
        student: current,
      }) ?? studentListHrefFromStudent(current)
    );
  }

  useEffect(() => {
    if (listBackHref) {
      rememberNavBackHref(listBackHref);
    }
  }, [listBackHref]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      const found = getStudents().find((s) => s.id === id);
      if (!found) {
        if (!cancelled) setNotFound(true);
        return;
      }

      const fills = getStudentFormFills(id);
      const patch = buildCardPatchFromFormFills(found, fills);
      let next = found;
      if (Object.keys(patch).length > 0) {
        const updated = await updateStudent(found.id, patch);
        if (updated) next = updated;
      }

      if (cancelled) return;
      setStudent(next);
      rememberStudentForForms(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, ready]);

  async function handleDelete() {
    if (!student) return;
    await deleteStudent(student.id);
    router.push(listHrefForStudent(student));
    router.refresh();
  }

  async function handleTransfer() {
    if (!student) return;
    setTransferBusy(true);
    setTransferError(null);
    try {
      const result = await transferStudentToPersonalBasket(
        student,
        transferFrequency
      );
      if (!result.ok) {
        setTransferError(
          getTextByPath(texts, "studentCard.transferToPersonalBasketError") ||
            "לא ניתן להעביר את התיק כרגע — נסו שוב"
        );
        return;
      }
      setStudent(result.student);
      rememberStudentForForms(result.student);
      setAskTransfer(false);
      router.push(listHrefForStudent(result.student));
      router.refresh();
    } catch {
      setTransferError(
        getTextByPath(texts, "studentCard.transferToPersonalBasketError") ||
          "לא ניתן להעביר את התיק כרגע — נסו שוב"
      );
    } finally {
      setTransferBusy(false);
    }
  }

  async function handleArchive() {
    if (!student) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const result = await archiveStudentFile(student);
      if (!result.ok) {
        setArchiveError(
          getTextByPath(texts, "studentCard.archiveStudentFileError") ||
            "לא ניתן להעביר לארכיון כרגע — נסו שוב"
        );
        return;
      }
      setStudent(result.student);
      rememberStudentForForms(result.student);
      setAskArchive(false);
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

  async function handleRestore() {
    if (!student) return;
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      const result = await restoreStudentFile(student);
      if (!result.ok) {
        setRestoreError(
          getTextByPath(texts, "studentCard.restoreStudentFileError") ||
            "לא ניתן לשחזר כרגע — נסו שוב"
        );
        return;
      }
      setStudent(result.student);
      rememberStudentForForms(result.student);
      setAskRestore(false);
      router.push(listHrefForStudent(result.student));
      router.refresh();
    } catch {
      setRestoreError(
        getTextByPath(texts, "studentCard.restoreStudentFileError") ||
          "לא ניתן לשחזר כרגע — נסו שוב"
      );
    } finally {
      setRestoreBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="menu-box p-8 text-center">
        <EditableText
          path="common.notFound"
          as="p"
          block
          className="mb-4 text-pink"
        />
        <Button asChild>
          <Link href="/personal-area">
            <EditableText path="common.back" />
          </Link>
        </Button>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    );
  }

  const showTransfer = canTransferToPersonalBasket(student);
  const showArchive = canArchiveStudentFile(student);
  const showRestore = canRestoreStudentFile(student);
  const isArchived = isStudentFileArchived(student);
  const resolvedBackHref = isArchived
    ? "/personal-area/archive"
    : listHrefForStudent(student);

  const card = (
    <div className="scroll-visible menu-box h-full min-h-0 pb-8">
      <div className="mb-3 flex justify-center border-b border-brand-200 pb-1.5">
        <EditableText
          path={
            student.status === "integration-teacher"
              ? "personalArea.staffCardTitle"
              : "personalArea.studentCardTitle"
          }
          as="h2"
          className="text-lg font-bold text-ink"
        />
      </div>

      {isArchived ? (
        <p className="mb-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-center text-sm text-brand-800">
          <EditableText path="studentCard.archivedBanner" as="span" />
        </p>
      ) : null}

      <CardFieldOrderProvider
        studentId={student.id}
        status={student.status}
        category={student.category}
      >
        <div className="flex flex-col gap-2">
          <StudentCoreFieldsOnCard
            student={student}
            onStudentChange={setStudent}
          />
          <StudentIntegrationFrequencyField
            student={student}
            onStudentChange={setStudent}
          />
          <StudentSingleResponsiblePartyField
            student={student}
            onStudentChange={setStudent}
          />
          <StudentCustomFieldsOnCard studentId={student.id} />
          <div style={{ order: 10000 }}>
            <StudentCalendarYearField
              student={student}
              onStudentChange={setStudent}
            />
          </div>
        </div>
      </CardFieldOrderProvider>

      <div className="mt-4 flex justify-center">
        {student.status !== "integration-teacher" && (
          <Button asChild size="lg" className="gap-2">
            <Link
              href={studentPortfolioHref(student.id, resolvedBackHref)}
              onClick={() => rememberNavBackHref(resolvedBackHref)}
            >
              <FolderOpen className="h-5 w-5" />
              <EditableText path="studentPortfolio.goToPortfolio" />
            </Link>
          </Button>
        )}
        {student.status === "integration-teacher" && !isArchived ? (
          <Button asChild size="lg" className="gap-2">
            <Link
              href={studentPortfolioFillHref(
                student.id,
                "staff-schedule",
                resolvedBackHref
              )}
              onClick={() => rememberNavBackHref(resolvedBackHref)}
            >
              <CalendarDays className="h-5 w-5" />
              מערכת שעות
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={resolvedBackHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText
              path={
                isArchived
                  ? "personalArea.studentsArchiveButton"
                  : studentsListBackLabelPath({
                      href: resolvedBackHref,
                      student,
                    })
              }
            />
          </Link>
        </Button>
        {!isArchived ? (
          <Button asChild size="sm">
            <Link
              href={hrefWithFrom(
                `/personal-area/students/${student.id}`,
                resolvedBackHref
              )}
              onClick={() => rememberNavBackHref(resolvedBackHref)}
            >
              <Pencil className="h-4 w-4" />
              <EditableText path="wizard.editButton" />
            </Link>
          </Button>
        ) : null}
        {student.status === "integration-teacher" && (
          <TeacherInviteButton
            studentId={student.id}
            teacherName={student.full_name}
            email={student.email}
            variant="button"
          />
        )}
        {showTransfer && !isArchived ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setTransferError(null);
              setTransferFrequency("high");
              setAskTransfer(true);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" />
            <EditableText path="studentCard.transferToPersonalBasket" />
          </Button>
        ) : null}
        {showArchive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setArchiveError(null);
              setAskArchive(true);
            }}
          >
            <Archive className="h-4 w-4" />
            <EditableText path="studentCard.archiveStudentFile" />
          </Button>
        ) : null}
        {showRestore ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setRestoreError(null);
              setAskRestore(true);
            }}
          >
            <ArchiveRestore className="h-4 w-4" />
            <EditableText path="studentCard.restoreStudentFile" />
          </Button>
        ) : null}
        {!isArchived ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setAskDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            <EditableText path="wizard.deleteButton" />
          </Button>
        ) : null}
      </div>

      <Dialog open={askDelete} onOpenChange={setAskDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText path="wizard.deleteButton" as="span" />
            </DialogTitle>
            <DialogDescription>
              {formatStudentDisplayName(student.full_name)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              <EditableText path="wizard.deleteButton" />
            </Button>
            <Button variant="ghost" onClick={() => setAskDelete(false)}>
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={askTransfer}
        onOpenChange={(open) => {
          if (transferBusy) return;
          setAskTransfer(open);
          if (!open) setTransferError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText
                path="studentCard.transferToPersonalBasketTitle"
                as="span"
              />
            </DialogTitle>
            <DialogDescription>
              <EditableText
                path="studentCard.transferToPersonalBasketDescription"
                as="span"
              />
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <p className="text-sm font-medium text-ink">
              {formatStudentDisplayName(student.full_name)}
            </p>
            <label className="block text-xs font-bold text-pink">
              <EditableText path="studentCard.transferFrequencyLabel" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={transferFrequency === "high" ? "default" : "outline"}
                disabled={transferBusy}
                onClick={() => setTransferFrequency("high")}
              >
                <EditableText path="status.frequencyHigh" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={transferFrequency === "low" ? "default" : "outline"}
                disabled={transferBusy}
                onClick={() => setTransferFrequency("low")}
              >
                <EditableText path="status.frequencyLow" />
              </Button>
            </div>
            {transferError && (
              <p className="text-sm font-medium text-destructive">
                {transferError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              disabled={transferBusy}
              onClick={() => void handleTransfer()}
            >
              {transferBusy ? (
                <EditableText path="studentCard.transferToPersonalBasketBusy" />
              ) : (
                <EditableText path="studentCard.transferToPersonalBasketConfirm" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={transferBusy}
              onClick={() => setAskTransfer(false)}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={askArchive}
        onOpenChange={(open) => {
          if (archiveBusy) return;
          setAskArchive(open);
          if (!open) setArchiveError(null);
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
          <p className="text-sm font-medium text-ink">
            {formatStudentDisplayName(student.full_name)}
          </p>
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
              onClick={() => setAskArchive(false)}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={askRestore}
        onOpenChange={(open) => {
          if (restoreBusy) return;
          setAskRestore(open);
          if (!open) setRestoreError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText
                path="studentCard.restoreStudentFileTitle"
                as="span"
              />
            </DialogTitle>
            <DialogDescription>
              <EditableText
                path="studentCard.restoreStudentFileDescription"
                as="span"
              />
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium text-ink">
            {formatStudentDisplayName(student.full_name)}
          </p>
          {restoreError ? (
            <p className="text-sm font-medium text-destructive">{restoreError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              disabled={restoreBusy}
              onClick={() => void handleRestore()}
            >
              {restoreBusy ? (
                <EditableText path="studentCard.restoreStudentFileBusy" />
              ) : (
                <EditableText path="studentCard.restoreStudentFileConfirm" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={restoreBusy}
              onClick={() => setAskRestore(false)}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  const wrapped = <div className="h-full min-h-0">{card}</div>;

  return isPersonalSector(student.category) ? (
    <TextScope sector={student.category}>{wrapped}</TextScope>
  ) : (
    wrapped
  );
}
