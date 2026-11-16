"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users2,
  Package,
  BookOpen,
  UserCog,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { getStudents } from "@/lib/mock-store";
import { getCategoryLabels, getStatusLabels } from "@/lib/labels";
import { shouldShowSpecialEdClasses } from "@/lib/plan-limits-client";
import type { Category, Student, StudentStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { useSiteText } from "@/components/providers/SiteTextProvider";

const STATUS_META: {
  key: StudentStatus;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}[] = [
  {
    key: "integration-teacher",
    icon: UserCog,
    gradient: "from-brand-300 to-brand-500",
  },
  { key: "integration", icon: Users2, gradient: "from-brand-400 to-brand-600" },
  {
    key: "personal-basket",
    icon: Package,
    gradient: "from-pink-400 to-brand-500",
  },
  {
    key: "special-ed-class",
    icon: BookOpen,
    gradient: "from-rose-400 to-brand-500",
  },
];

const CATEGORY_KEYS: Category[] = ["schools", "high-schools", "kindergartens"];

export function SummaryClient() {
  const { ready } = useDataStore();
  const { texts } = useSiteText();
  const categoryLabels = getCategoryLabels(texts);
  const statusLabels = getStatusLabels(texts);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [includeSpecialEdClasses, setIncludeSpecialEdClasses] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setStudents(getStudents());
    setIncludeSpecialEdClasses(shouldShowSpecialEdClasses());
  }, [ready]);

  const summary = useMemo(() => {
    const list = students ?? [];
    const byStatus: Record<StudentStatus, number> = {
      integration: 0,
      "personal-basket": 0,
      "special-ed-class": 0,
      "integration-teacher": 0,
    };
    const matrix: Record<StudentStatus, Record<Category, number>> = {
      integration: { schools: 0, "high-schools": 0, kindergartens: 0, tutorials: 0 },
      "personal-basket": { schools: 0, "high-schools": 0, kindergartens: 0, tutorials: 0 },
      "special-ed-class": { schools: 0, "high-schools": 0, kindergartens: 0, tutorials: 0 },
      "integration-teacher": { schools: 0, "high-schools": 0, kindergartens: 0, tutorials: 0 },
    };
    list.forEach((s) => {
      if (s.status) {
        byStatus[s.status] += 1;
        matrix[s.status][s.category] += 1;
      }
    });
    return { byStatus, matrix, total: list.length };
  }, [students]);

  if (students === null) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-brand-600">
          טוען סיכום...
        </CardContent>
      </Card>
    );
  }

  const hasData = students.length > 0;
  const statusCards = includeSpecialEdClasses
    ? STATUS_META
    : STATUS_META.filter((item) => item.key !== "special-ed-class");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statusCards.map(({ key, icon: Icon, gradient }) => (
          <Card key={key}>
            <CardContent className="p-5">
              <div
                className={cn(
                  "mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                  gradient
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-3xl font-extrabold text-brand-900 tabular-nums">
                {summary.byStatus[key]}
              </div>
              <div className="text-sm font-semibold text-brand-600">
                {statusLabels[key]}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {hasData ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>סיווג</TableHead>
                  {CATEGORY_KEYS.map((cat) => (
                    <TableHead key={cat} className="text-center">
                      {categoryLabels[cat]}
                    </TableHead>
                  ))}
                  <TableHead className="text-center">סה״כ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusCards.map(({ key }) => {
                  const rowTotal = CATEGORY_KEYS.reduce(
                    (acc, c) => acc + summary.matrix[key][c],
                    0
                  );
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-bold text-brand-900">
                        {statusLabels[key]}
                      </TableCell>
                      {CATEGORY_KEYS.map((cat) => (
                        <TableCell
                          key={cat}
                          className="text-center tabular-nums"
                        >
                          {summary.matrix[key][cat] || (
                            <span className="text-brand-300">—</span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold text-brand-800 tabular-nums">
                        {rowTotal}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>סה״כ תלמידים בקטגוריה</TableCell>
                  {CATEGORY_KEYS.map((cat) => {
                    const total = students.filter((s) => s.category === cat).length;
                    return (
                      <TableCell key={cat} className="text-center tabular-nums">
                        {total}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center tabular-nums">
                    {summary.total}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          ) : (
            <div className="p-12 text-center">
              <div className="mb-3 text-6xl">📊</div>
              <h3 className="mb-2 text-lg font-bold text-brand-900">
                אין נתונים לסיכום
              </h3>
              <p className="mb-5 text-sm text-brand-600">
                יש להוסיף תלמידים לרשימה כדי לראות את הסיכום כאן
              </p>
              <Button asChild>
                <Link href="/personal-area">
                  מעבר לאזור האישי
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-2 text-base font-bold text-brand-900">
            זרימת הנתונים במערכת
          </h3>
          <p className="text-sm text-brand-700">
            כל כרטיס תלמיד → מצטרף אוטומטית לרשימת הקטגוריה שלו → נספר בטבלת
            הסיכום לפי הסיווג (שילוב, סל אישי, חינוך מיוחד, מורות שילוב).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
