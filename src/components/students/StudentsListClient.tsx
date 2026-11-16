"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteStudent, getCanManageStudents, getStudents } from "@/lib/mock-store";
import { getStatusLabels } from "@/lib/labels";
import type { Student } from "@/lib/supabase/types";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { EditableText } from "@/components/editable/EditableText";
import {
  matchesPersonQuery,
  PersonSearchField,
  uniqueSearchOptions,
} from "@/components/students/PersonSearchField";
import { StudentFolderIconLink } from "@/components/students/StudentFolderIconLink";
import { formatStudentDisplayName } from "@/lib/person-name";
import { hrefWithFrom, rememberNavBackHref } from "@/lib/navigation-back";

export function StudentsListClient() {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, guestDemo } = useDataStore();
  const { texts } = useSiteText();
  const statusLabels = getStatusLabels(texts);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  // TZ-28: Members cannot add or delete students
  const [canManageStudents, setCanManageStudents] = useState(true);

  useEffect(() => {
    if (!ready) return;
    setStudents(getStudents().filter((s) => !s.archived_at));
    setCanManageStudents(getCanManageStudents());
  }, [ready]);

  useEffect(() => {
    rememberNavBackHref(pathname);
  }, [pathname]);

  function studentViewHref(studentId: string) {
    return hrefWithFrom(`/personal-area/students/view/${studentId}`, pathname);
  }

  const filtered = useMemo(() => {
    return students.filter((s) =>
      matchesPersonQuery(
        query,
        s.full_name,
        s.teacher_name,
        s.father_name,
        s.mother_name,
        s.phone,
        s.class_name,
        s.status ? statusLabels[s.status] : ""
      )
    );
  }, [students, query, statusLabels]);

  const searchOptions = useMemo(
    () =>
      uniqueSearchOptions(
        students.map((s) => formatStudentDisplayName(s.full_name)),
        students.map((s) => s.teacher_name)
      ),
    [students]
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteStudent(deleteTarget.id);
    setStudents(getStudents().filter((s) => !s.archived_at));
    setDeleteTarget(null);
  }

  return (
    <div className="menu-box">
      <PersonSearchField
        id="students-full-list-search"
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

      {/* TZ-28: Hide add button for members */}
      {canManageStudents && (
        <div className="mb-4 flex justify-center">
          <Button asChild size="lg">
            <Link href="/personal-area/students/new">
              <Plus className="h-5 w-5" />
              <EditableText path="personalArea.addStudent" />
            </Link>
          </Button>
        </div>
      )}

      {guestDemo ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm text-brand-800">
          כניסה חופשית: מוצג תלמיד דוגמה אחד בלי אפשרות הוספה, עריכה או מחיקה.
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="p-6 text-center">
          <EditableText
            path="personalArea.emptyList"
            as="p"
            block
            className="mb-4 text-pink"
          />
          {/* TZ-28: Hide add button for members */}
          {canManageStudents && (
            <Button asChild>
              <Link href="/personal-area/students/new">
                <Plus className="h-5 w-5" />
                <EditableText path="personalArea.addStudent" />
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((s) => (
            <li key={s.id} className="menu-item justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={studentViewHref(s.id)}
                  className="block break-words text-lg font-bold text-pink"
                  title={formatStudentDisplayName(s.full_name)}
                  onClick={() => rememberNavBackHref(pathname)}
                >
                  {formatStudentDisplayName(s.full_name)}
                </Link>
                {s.status && (
                  <span className="text-xs font-semibold text-brand-600">
                    {statusLabels[s.status]}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild size="icon" variant="ghost" className="h-9 w-9">
                  <Link
                    href={studentViewHref(s.id)}
                    aria-label="צפייה"
                    onClick={() => rememberNavBackHref(pathname)}
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="icon" variant="ghost" className="h-9 w-9">
                  <Link
                    href={`/personal-area/students/${s.id}`}
                    aria-label="עריכה"
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
                    disabled={guestDemo}
                    onClick={() => setDeleteTarget(s)}
                    aria-label="מחיקה"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {s.status !== "integration-teacher" ? (
                  <StudentFolderIconLink
                    studentId={s.id}
                    from={studentViewHref(s.id)}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת כרטיס תלמיד</DialogTitle>
            <DialogDescription>
              האם למחוק את הכרטיס של{" "}
              <span className="font-bold text-brand-900">
                {deleteTarget
                  ? formatStudentDisplayName(deleteTarget.full_name)
                  : null}
              </span>
              ? פעולה זו אינה הפיכה.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              מחק
            </Button>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
