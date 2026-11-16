"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Eye, Pencil, Plus, Trash2, Users } from "lucide-react";
import {
  deleteStudent,
  getStaffTeachers,
  getStudentsLinkedToTeacher,
} from "@/lib/mock-store";
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
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { subscribeDataCache } from "@/lib/data-cache";
import {
  categoryTeacherHref,
  sectorTeacherHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type { Student } from "@/lib/supabase/types";
import {
  matchesPersonQuery,
  PersonSearchField,
  uniqueSearchOptions,
} from "@/components/students/PersonSearchField";
import { hrefWithFrom, hrefWithSearch, rememberNavBackHref } from "@/lib/navigation-back";
import { TeacherInviteButton } from "@/components/students/TeacherInviteButton";
import { studentPortfolioFillHref } from "@/lib/form-schemas";

interface TeachersRosterProps {
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
}

/** רשימת צוות החינוך המיוחד — לחיצה על מורה פותחת את תלמידיה (בלי תיק תלמיד) */
export function TeachersRoster({
  sector,
  framework = "special",
  area = "personal-area",
}: TeachersRosterProps) {
  const pathname = usePathname();
  const locationHref =
    typeof window !== "undefined"
      ? hrefWithSearch(pathname, window.location.search)
      : pathname;
  const { ready: dataReady } = useDataStore();
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  useEffect(() => {
    if (!dataReady) return;
    setReady(true);
  }, [dataReady]);

  useEffect(() => {
    if (!dataReady) return;
    return subscribeDataCache(() => {
      setVersion((v) => v + 1);
    });
  }, [dataReady]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      rememberNavBackHref(hrefWithSearch(pathname, window.location.search));
    }
  }, [pathname]);

  const allTeachers = useMemo(() => {
    if (!ready) return [];
    return getStaffTeachers(sector);
  }, [ready, sector, version]);

  const teachers = useMemo(
    () =>
      allTeachers.filter((teacher) =>
        matchesPersonQuery(query, teacher.full_name, teacher.phone)
      ),
    [allTeachers, query]
  );

  const searchOptions = useMemo(
    () =>
      uniqueSearchOptions(allTeachers.map((teacher) => teacher.full_name)),
    [allTeachers]
  );

  const countsByTeacher = useMemo(() => {
    const next: Record<string, number> = {};
    for (const teacher of allTeachers) {
      next[teacher.id] = getStudentsLinkedToTeacher(
        teacher.full_name,
        sector
      ).length;
    }
    return next;
  }, [allTeachers, sector, version]);

  const newCardHref = useMemo(() => {
    const params = new URLSearchParams();
    if (sector) params.set("category", sector);
    params.set("framework", framework);
    params.set("area", area);
    params.set("status", "integration-teacher");
    return `/personal-area/students/new?${params.toString()}`;
  }, [sector, framework, area]);

  function studentsHref(teacher: Student): string {
    const name = teacher.full_name.trim();
    if (sector) {
      return sectorTeacherHref(
        sector,
        "integration-teacher",
        name,
        framework,
        area
      );
    }
    return categoryTeacherHref("integration-teacher", name);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteStudent(deleteTarget.id);
    setDeleteTarget(null);
    setVersion((v) => v + 1);
  }

  if (!ready) {
    return (
      <div className="p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 border-b-2 border-brand-200 pb-2 text-center text-xl font-bold text-ink">
        <EditableText path="status.integrationTeacherListTitle" />
      </h2>

      <PersonSearchField
        id="teachers-roster-search"
        value={query}
        onChange={setQuery}
        options={searchOptions}
        labelPath="personalArea.staffSearchPlaceholder"
      />

      {teachers.length === 0 ? (
        <EditableText
          path="status.teachersEmptyList"
          as="p"
          block
          className="py-4 text-center text-pink"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {teachers.map((teacher) => (
            <li key={teacher.id} className="flex items-center gap-1">
              <Link
                href={studentsHref(teacher)}
                className="menu-item min-w-0 flex-1 justify-between gap-3"
                title="רשימת תלמידים מקושרים"
              >
                <span className="min-w-0 break-words text-lg font-bold text-pink">
                  {teacher.full_name}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm text-pink">
                  {countsByTeacher[teacher.id] ?? 0}{" "}
                  <EditableText path="personalArea.recordsLabel" />
                  <Users className="h-5 w-5 shrink-0" aria-hidden />
                </span>
              </Link>
              <Button asChild size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                <Link
                  href={hrefWithFrom(
                    `/personal-area/students/view/${teacher.id}`,
                    locationHref
                  )}
                  aria-label="תצוגת כרטיס איש צוות"
                  title="תצוגת כרטיס איש צוות"
                  onClick={() => rememberNavBackHref(locationHref)}
                >
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                <Link
                  href={studentPortfolioFillHref(
                    teacher.id,
                    "staff-schedule",
                    locationHref
                  )}
                  aria-label="מערכת שעות"
                  title="מערכת שעות"
                  onClick={() => rememberNavBackHref(locationHref)}
                >
                  <CalendarDays className="h-4 w-4" />
                </Link>
              </Button>
              <TeacherInviteButton
                studentId={teacher.id}
                teacherName={teacher.full_name}
                email={teacher.email}
                iconOnly
              />
              <Button asChild size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                <Link
                  href={hrefWithFrom(
                    `/personal-area/students/${teacher.id}`,
                    locationHref
                  )}
                  aria-label="עריכת כרטיס מורה"
                  onClick={() => rememberNavBackHref(locationHref)}
                >
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 text-destructive hover:bg-red-50"
                aria-label="מחיקה"
                onClick={() => setDeleteTarget(teacher)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex justify-center">
        <Button asChild size="lg">
          <Link href={newCardHref}>
            <Plus className="h-5 w-5" />
            <EditableText path="status.addStaffCard" />
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
            <DialogDescription>{deleteTarget?.full_name}</DialogDescription>
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
    </div>
  );
}
