"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Eye,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentFolderIconLink } from "@/components/students/StudentFolderIconLink";
import { StudentExcelImportDialog } from "@/components/students/StudentExcelImportDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteStudent, getStudents } from "@/lib/mock-store";
import { EditableText } from "@/components/editable/EditableText";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import {
  sectorFrameworkHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import {
  matchesPersonQuery,
  PersonSearchField,
  uniqueSearchOptions,
} from "@/components/students/PersonSearchField";
import { formatStudentDisplayName } from "@/lib/person-name";
import { hrefWithFrom, rememberNavBackHref } from "@/lib/navigation-back";
import { formatHebrewYear } from "@/lib/calendar-year";
import {
  clearMidYearIntake,
  listMidYearIntakeEntries,
  midYearIntakeTransferLabel,
  midYearIntakeYear,
  type MidYearIntakeTarget,
} from "@/lib/mid-year-intake";
import { transferMidYearIntakeStudents } from "@/lib/transfer-mid-year-intake";
import { studentMatchesFrequency } from "@/lib/integration-frequency";
import type { IntegrationFrequency, Student } from "@/lib/supabase/types";

interface MidYearIntakeListClientProps {
  sector: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  target: MidYearIntakeTarget;
  frequency?: IntegrationFrequency;
  year?: number;
}

function loadIntakeStudents(options: {
  sector: PersonalSector;
  target: MidYearIntakeTarget;
  frequency?: IntegrationFrequency;
  year: number;
}): Student[] {
  const pendingIds = new Set(
    listMidYearIntakeEntries({
      sector: options.sector,
      targetStatus: options.target,
      year: options.year,
    }).map((e) => e.studentId)
  );

  return getStudents()
    .filter((s) => {
      if (!pendingIds.has(s.id)) return false;
      if (s.category !== options.sector) return false;
      if (s.status !== options.target) return false;
      if (options.target === "personal-basket" && options.frequency) {
        return studentMatchesFrequency(
          s.integration_frequency,
          options.frequency
        );
      }
      return true;
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"));
}

export function MidYearIntakeListClient({
  sector,
  framework = "regular",
  area = "personal-area",
  target,
  frequency,
  year = midYearIntakeYear(),
}: MidYearIntakeListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready: dataReady } = useDataStore();
  const [students, setStudents] = useState<Student[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);

  useEffect(() => {
    rememberNavBackHref(pathname);
  }, [pathname]);

  function reloadStudents() {
    setStudents(loadIntakeStudents({ sector, target, frequency, year }));
  }

  useEffect(() => {
    if (!dataReady) return;
    setStudents(loadIntakeStudents({ sector, target, frequency, year }));
    setReady(true);
  }, [dataReady, sector, target, frequency, year]);

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

  const searchOptions = useMemo(
    () =>
      uniqueSearchOptions(
        students.map((s) => formatStudentDisplayName(s.full_name)),
        students.map((s) => s.teacher_name)
      ),
    [students]
  );

  function studentViewHref(studentId: string) {
    return hrefWithFrom(`/personal-area/students/view/${studentId}`, pathname);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteStudent(deleteTarget.id);
    clearMidYearIntake(deleteTarget.id);
    reloadStudents();
    setDeleteTarget(null);
  }

  async function handleTransfer() {
    setTransferring(true);
    setTransferMessage(null);
    try {
      const result = await transferMidYearIntakeStudents(students, {
        target,
        frequency,
      });
      reloadStudents();
      setTransferOpen(false);
      if (result.failed > 0) {
        setTransferMessage(
          `הועברו ${result.transferred}, נכשלו ${result.failed}`
        );
      } else if (result.transferred === 0) {
        setTransferMessage("אין תלמידים להעברה");
      } else {
        setTransferMessage(`הועברו ${result.transferred} תלמידים בהצלחה`);
      }
    } finally {
      setTransferring(false);
    }
  }

  if (!ready) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    );
  }

  const backHref = sectorFrameworkHref(sector, framework, area);
  const categoryLabel =
    target === "integration" ? "תלמידי שילוב" : "תלמידי סל אישי";
  const newParams = new URLSearchParams();
  newParams.set("category", sector);
  newParams.set("framework", framework);
  newParams.set("area", area);
  newParams.set("status", target);
  newParams.set("intake", "1");
  newParams.set("year", String(year));
  if (frequency) newParams.set("frequency", frequency);

  return (
    <div className="menu-box">
      <h2 className="mb-4 border-b-2 border-brand-200 pb-2 text-center text-xl font-bold text-ink">
        <span>
          <EditableText
            path="personalArea.midYearIntakeListTitle"
            as="span"
          />{" "}
          {formatHebrewYear(year)}
        </span>
        <span className="mt-1 block text-lg text-pink">
          {categoryLabel}
          {target === "personal-basket" && frequency
            ? frequency === "high"
              ? " · שכיחות גבוהה"
              : " · שכיחות נמוכה"
            : ""}
        </span>
      </h2>

      <PersonSearchField
        id="mid-year-intake-search"
        value={query}
        onChange={setQuery}
        onSelect={(selectedName) => {
          const selectedStudent = students.find(
            (student) =>
              formatStudentDisplayName(student.full_name) === selectedName
          );
          if (selectedStudent) {
            rememberNavBackHref(pathname);
            router.push(studentViewHref(selectedStudent.id));
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
              <Link
                href={studentViewHref(student.id)}
                className="min-w-0 flex-1 break-words text-lg font-bold text-pink"
                title={formatStudentDisplayName(student.full_name)}
                onClick={() => rememberNavBackHref(pathname)}
              >
                {formatStudentDisplayName(student.full_name)}
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild size="icon" variant="ghost" className="h-9 w-9">
                  <Link
                    href={studentViewHref(student.id)}
                    aria-label="צפייה"
                    onClick={() => rememberNavBackHref(pathname)}
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="icon" variant="ghost" className="h-9 w-9">
                  <Link
                    href={hrefWithFrom(
                      `/personal-area/students/${student.id}`,
                      pathname
                    )}
                    aria-label="עריכה"
                    onClick={() => rememberNavBackHref(pathname)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive hover:bg-red-50"
                  aria-label="מחיקה"
                  onClick={() => setDeleteTarget(student)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <StudentFolderIconLink
                  studentId={student.id}
                  from={studentViewHref(student.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {transferMessage ? (
        <p className="mt-4 text-center text-sm font-medium text-brand-800">
          {transferMessage}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href={`/personal-area/students/new?${newParams.toString()}`}>
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
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button
          type="button"
          size="lg"
          disabled={students.length === 0 || transferring}
          onClick={() => setTransferOpen(true)}
        >
          <ArrowLeftRight className="h-5 w-5" />
          {midYearIntakeTransferLabel(target)}
        </Button>
      </div>

      <div className="mt-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText path="personalArea.backToTable" />
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

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{midYearIntakeTransferLabel(target)}</DialogTitle>
            <DialogDescription>
              <EditableText path="personalArea.midYearIntakeTransferConfirm" />
              {students.length > 0 ? ` (${students.length})` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={transferring}
              onClick={() => void handleTransfer()}
            >
              {midYearIntakeTransferLabel(target)}
            </Button>
            <Button
              variant="ghost"
              disabled={transferring}
              onClick={() => setTransferOpen(false)}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudentExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        status={target}
        sector={sector}
        frequency={frequency}
        markAsMidYearIntake
        intakeYear={year}
        onImported={reloadStudents}
      />
    </div>
  );
}
