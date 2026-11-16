"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IdCard,
  ListChecks,
  LayoutGrid,
  Pencil,
  Trash2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteStudent, getStudents } from "@/lib/mock-store";
import { getCategoryLabels, getStatusLabels } from "@/lib/labels";
import { formatStudentDisplayName } from "@/lib/person-name";
import type { Student } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import {
  hrefWithFrom,
  parseSafeFromParam,
  readNavBackHref,
} from "@/lib/navigation-back";

interface StudentDetailViewProps {
  id: string;
}

export function StudentDetailView({ id }: StudentDetailViewProps) {
  const { texts } = useSiteText();
  const { guestDemo } = useDataStore();
  const CATEGORY_LABELS = getCategoryLabels(texts);
  const STATUS_LABELS = getStatusLabels(texts);
  const router = useRouter();
  const searchParams = useSearchParams();
  const listBackHref = useMemo(
    () =>
      parseSafeFromParam(searchParams.get("from")) ??
      readNavBackHref() ??
      "/personal-area",
    [searchParams]
  );
  const [students, setStudents] = useState<Student[] | null>(null);
  const [askDelete, setAskDelete] = useState(false);

  useEffect(() => {
    setStudents(getStudents());
  }, []);

  const student = useMemo(
    () => students?.find((s) => s.id === id),
    [students, id]
  );

  const sameCategory = useMemo(() => {
    if (!students || !student) return [];
    return students.filter((s) => s.category === student.category);
  }, [students, student]);

  if (students === null) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-brand-600">
          טוען כרטיס תלמיד...
        </CardContent>
      </Card>
    );
  }

  if (!student) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="mb-3 text-brand-700">כרטיס תלמיד לא נמצא.</p>
          <Button asChild>
            <Link href={listBackHref}>
              חזרה לרשימה
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  function handleDelete() {
    if (!student) return;
    deleteStudent(student.id);
    router.push(listBackHref);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href={listBackHref}>
            <ArrowRight className="h-4 w-4" />
            חזרה לרשימה
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link
              href={hrefWithFrom(
                `/personal-area/students/${student.id}`,
                listBackHref
              )}
            >
              <Pencil className="h-4 w-4" />
              עריכה
            </Link>
          </Button>
          <Button
            variant="destructive"
            disabled={guestDemo}
            onClick={() => setAskDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            מחיקה
          </Button>
        </div>
      </div>
      {guestDemo ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm font-medium text-brand-800">
          כניסה חופשית: אפשר לצפות בכרטיס לדוגמה, בלי עריכה או מחיקה.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <StageBlock
          step={1}
          icon={IdCard}
          title="כרטיס התלמיד"
          description="הפרטים האישיים כפי שנשמרו"
        >
          <div className="flex flex-col gap-3">
            <FieldRow
              label="שם מלא"
              value={formatStudentDisplayName(student.full_name)}
              highlight
            />
            <FieldRow
              label="טלפון"
              value={student.phone ?? "—"}
              ltr
            />
            <FieldRow
              label="שם האב"
              value={student.father_name ?? "—"}
            />
            <FieldRow
              label="שם האם"
              value={student.mother_name ?? "—"}
            />
          </div>
        </StageBlock>

        <StageBlock
          step={2}
          icon={ListChecks}
          title="רשימת קטגוריה"
          description={`מופיע/ה ברשימה של ${CATEGORY_LABELS[student.category]}`}
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white">
            {CATEGORY_LABELS[student.category]}
          </div>
          {student.class_name && (
            <div className="mb-3 text-xs text-brand-600">
              כיתה / קבוצה:{" "}
              <span className="font-bold text-brand-900">
                {student.class_name}
              </span>
            </div>
          )}
          <div className="rounded-xl border border-brand-100 bg-white p-3">
            <div className="mb-2 text-xs font-bold text-brand-600">
              תלמידים ברשימה ({sameCategory.length})
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {sameCategory.slice(0, 6).map((s) => (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2 py-1",
                    s.id === student.id
                      ? "bg-brand-100 font-bold text-brand-900"
                      : "text-brand-700"
                  )}
                >
                  <span>{formatStudentDisplayName(s.full_name)}</span>
                  {s.id === student.id && (
                    <span className="text-xs">← זה כאן</span>
                  )}
                </li>
              ))}
              {sameCategory.length > 6 && (
                <li className="text-center text-xs text-brand-500">
                  ועוד {sameCategory.length - 6}...
                </li>
              )}
            </ul>
          </div>
        </StageBlock>

        <StageBlock
          step={3}
          icon={LayoutGrid}
          title="טבלת סיכום"
          description={
            student.status
              ? `נספר/ת בשורה של: ${STATUS_LABELS[student.status]}`
              : "טרם סווג/ה בטבלת הסיכום"
          }
        >
          {student.status ? (
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {STATUS_LABELS[student.status]}
              </div>
              <div className="overflow-hidden rounded-xl border border-brand-100">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>סיווג</TableHead>
                      <TableHead className="text-center">
                        {CATEGORY_LABELS[student.category]}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-bold text-brand-900">
                        {STATUS_LABELS[student.status]}
                      </TableCell>
                      <TableCell className="text-center font-bold text-brand-800">
                        +1
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 text-xs text-brand-600">
                התלמיד/ה נספר/ת אוטומטית בטבלת הסיכום המרכזית
              </p>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-brand-200 bg-white p-4 text-center">
              <p className="mb-3 text-sm text-brand-700">
                טרם הוגדר סיווג לתלמיד/ה
              </p>
              <Button asChild size="sm">
                <Link href={`/personal-area/students/${student.id}`}>
                  <Pencil className="h-4 w-4" />
                  הגדרת סיווג
                </Link>
              </Button>
            </div>
          )}

          {student.notes && (
            <div className="mt-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
              <span className="font-bold text-brand-900">הערות:</span>{" "}
              {student.notes}
            </div>
          )}
        </StageBlock>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-sm text-brand-800">
              <p className="font-bold text-brand-900">
                כרטיס זה יופיע ב-3 מקומות שונים במערכת
              </p>
              <p className="text-brand-600">
                בכרטיס עצמו, ברשימת הקטגוריה, ובטבלת הסיכום המרכזית
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={listBackHref}>חזרה לרשימה</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/personal-area/summary">טבלת סיכום</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={askDelete}
        onOpenChange={(open) => !open && setAskDelete(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת כרטיס תלמיד</DialogTitle>
            <DialogDescription>
              האם למחוק את הכרטיס של{" "}
              <span className="font-bold text-brand-900">
                {formatStudentDisplayName(student.full_name)}
              </span>
              ? פעולה זו אינה הפיכה.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete}>
              מחק
            </Button>
            <Button variant="ghost" onClick={() => setAskDelete(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StageBlock({
  step,
  icon: Icon,
  title,
  description,
  children,
}: {
  step: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-brand-500">שלב {step}</div>
            <h3 className="text-base font-extrabold text-brand-900">
              {title}
            </h3>
          </div>
        </div>
        <p className="mb-4 text-sm text-brand-600">{description}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function FieldRow({
  label,
  value,
  highlight,
  ltr,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  ltr?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2",
        highlight && "border-brand-300 bg-brand-50"
      )}
    >
      <span className="text-xs font-semibold text-brand-600">{label}</span>
      <span
        className={cn(
          "text-sm font-bold text-brand-900",
          highlight && "text-brand-700"
        )}
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </span>
    </div>
  );
}
