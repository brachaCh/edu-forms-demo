"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArchiveRestore, Eye, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getArchivedStudents } from "@/lib/mock-store";
import { EditableText } from "@/components/editable/EditableText";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import {
  matchesPersonQuery,
  PersonSearchField,
  uniqueSearchOptions,
} from "@/components/students/PersonSearchField";
import { formatStudentDisplayName } from "@/lib/person-name";
import { formatHebrewYear } from "@/lib/calendar-year";
import { hrefWithFrom, rememberNavBackHref } from "@/lib/navigation-back";
import { studentPortfolioHref } from "@/lib/student-portfolio";
import {
  canRestoreStudentFile,
  restoreStudentFile,
} from "@/lib/archive-student-file";
import type { Student } from "@/lib/supabase/types";

function formatArchiveDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL");
}

export function StudentsArchivePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, guestDemo } = useDataStore();
  const { texts } = useSiteText();
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<Student | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function refresh() {
    setStudents(getArchivedStudents());
  }

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready]);

  useEffect(() => {
    rememberNavBackHref(pathname);
  }, [pathname]);

  const filtered = useMemo(() => {
    return students.filter((s) =>
      matchesPersonQuery(
        query,
        s.full_name,
        s.teacher_name,
        s.class_name,
        s.father_name,
        s.mother_name
      )
    );
  }, [students, query]);

  const searchOptions = useMemo(
    () =>
      uniqueSearchOptions(
        students.map((s) => formatStudentDisplayName(s.full_name))
      ),
    [students]
  );

  function cardHref(studentId: string) {
    return hrefWithFrom(`/personal-area/students/view/${studentId}`, pathname);
  }

  async function handleRestore() {
    if (!restoreTarget || restoreBusy) return;
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      const result = await restoreStudentFile(restoreTarget);
      if (!result.ok) {
        setRestoreError(
          getTextByPath(texts, "personalArea.studentsArchiveRestoreError") ||
            "לא ניתן לשחזר את התיק כרגע — נסו שוב"
        );
        return;
      }
      setRestoreTarget(null);
      refresh();
    } catch {
      setRestoreError(
        getTextByPath(texts, "personalArea.studentsArchiveRestoreError") ||
          "לא ניתן לשחזר את התיק כרגע — נסו שוב"
      );
    } finally {
      setRestoreBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="personalArea.loading" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="menu-box space-y-2 text-center">
        <p className="text-sm text-pink">
          <EditableText path="personalArea.studentsArchiveHint" as="span" />
        </p>
      </div>

      <div className="menu-box">
        <PersonSearchField
          id="students-archive-search"
          value={query}
          onChange={setQuery}
          onSelect={(selectedName) => {
            const selectedStudent = students.find(
              (student) =>
                formatStudentDisplayName(student.full_name) === selectedName
            );
            if (selectedStudent) {
              rememberNavBackHref(pathname);
              router.push(cardHref(selectedStudent.id));
            }
          }}
          options={searchOptions}
        />

        {filtered.length === 0 ? (
          <p className="mt-6 text-center text-pink">
            <EditableText path="personalArea.studentsArchiveEmpty" />
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-brand-200">
            {filtered.map((student) => (
              <li
                key={student.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-center sm:text-right">
                  <div className="font-bold text-ink">
                    {formatStudentDisplayName(student.full_name)}
                  </div>
                  <div className="text-xs text-pink">
                    <EditableText
                      path="personalArea.studentsArchiveDateLabel"
                      as="span"
                    />
                    {": "}
                    {formatArchiveDate(student.archived_at)}
                    {student.calendar_year
                      ? ` · ${formatHebrewYear(student.calendar_year)}`
                      : null}
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={cardHref(student.id)}
                      onClick={() => rememberNavBackHref(pathname)}
                    >
                      <Eye className="h-4 w-4" />
                      <EditableText path="personalArea.studentsArchiveOpenCard" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={studentPortfolioHref(student.id, pathname)}
                      onClick={() => rememberNavBackHref(pathname)}
                    >
                      <FolderOpen className="h-4 w-4" />
                      <EditableText path="personalArea.studentsArchiveOpenPortfolio" />
                    </Link>
                  </Button>
                  {!guestDemo && canRestoreStudentFile(student) ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setRestoreError(null);
                        setRestoreTarget(student);
                      }}
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      <EditableText path="personalArea.studentsArchiveRestore" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (restoreBusy) return;
          if (!open) {
            setRestoreTarget(null);
            setRestoreError(null);
          }
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
          {restoreTarget ? (
            <p className="text-sm font-medium text-ink">
              {formatStudentDisplayName(restoreTarget.full_name)}
            </p>
          ) : null}
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
              onClick={() => setRestoreTarget(null)}
            >
              <EditableText path="wizard.cancelButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
