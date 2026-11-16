"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { SpecialEdPackageGate } from "@/components/students/SpecialEdPackageGate";
import { PageShell } from "@/components/layout/PageShell";
import { TextScope } from "@/components/providers/TextScope";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { StudentFolderWorkspace } from "@/components/students/StudentFolderWorkspace";
import { ensureClassCurriculumStudent } from "@/lib/class-curriculum-store";
import { syncClassStudentListFromRoster } from "@/lib/class-curriculum-import";
import { rememberNavBackHref } from "@/lib/navigation-back";
import {
  DEFAULT_SPECIAL_ED_CLASS_NAME,
  normalizeSpecialEdClassName,
} from "@/lib/special-ed-classes";
import {
  sectorSpecialEdClassHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type { Student } from "@/lib/supabase/types";

interface ClassCurriculumPageClientProps {
  /** נשמר לתאימות קישורים ישנים */
  teacherName?: string;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  className?: string;
}

export function ClassCurriculumPageClient({
  sector,
  framework = "special",
  area = "personal-area",
  className,
}: ClassCurriculumPageClientProps) {
  const { ready: dataReady } = useDataStore();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classKey = normalizeSpecialEdClassName(
    className || DEFAULT_SPECIAL_ED_CLASS_NAME
  );

  const backHref = sector
    ? sectorSpecialEdClassHref(sector, classKey, framework, area)
    : `/personal-area/category/special-ed-class/class/${encodeURIComponent(classKey)}`;

  useEffect(() => {
    if (typeof window !== "undefined") {
      rememberNavBackHref(
        window.location.pathname + window.location.search
      );
    }
  }, [classKey, sector]);

  useEffect(() => {
    if (!dataReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const owner = await ensureClassCurriculumStudent(classKey, {
          category: sector ?? null,
        });
        try {
          await syncClassStudentListFromRoster({
            category: (sector ?? owner.category) as typeof owner.category,
            className: classKey,
            teacherName: owner.teacher_name,
          });
        } catch {
          // תל"כ ייפתח גם אם הסנכרון נכשל
        }
        if (!cancelled) setStudent(owner);
      } catch {
        if (!cancelled) {
          setError('לא ניתן לפתוח את תל"כ לכיתה זו');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataReady, sector, classKey]);

  const content =
    !dataReady || (!student && !error) ? (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    ) : error || !student ? (
      <div className="menu-box p-8 text-center">
        <p className="text-destructive">{error ?? "שגיאה"}</p>
        <Button asChild variant="ghost" size="sm" className="mt-4">
          <Link href={backHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText path="common.back" />
          </Link>
        </Button>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0">
          <Button asChild variant="ghost" size="sm">
            <Link href={backHref}>
              <ArrowRight className="h-4 w-4" />
              <EditableText path="status.specialEdModeBackToModes" />
            </Link>
          </Button>
          <h1 className="mt-2 flex items-center justify-center gap-2 text-center text-2xl font-bold text-ink">
            <BookOpen className="h-6 w-6 text-brand-600" />
            <EditableText path="status.specialEdModeCurriculum" />
          </h1>
          <p className="text-center text-sm font-bold text-pink">{classKey}</p>
        </div>
        <div className="menu-box flex min-h-0 flex-1 flex-col overflow-auto p-4">
          <StudentFolderWorkspace
            studentId={student.id}
            folderName='תל"כ'
          />
        </div>
      </div>
    );

  return (
    <SpecialEdPackageGate sector={sector} framework={framework} area={area}>
      <PageShell lockPageScroll>
        {sector ? <TextScope sector={sector}>{content}</TextScope> : content}
      </PageShell>
    </SpecialEdPackageGate>
  );
}
