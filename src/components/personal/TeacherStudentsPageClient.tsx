"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { StudentListByStatus } from "@/components/students/StudentListByStatus";
import { TextScope } from "@/components/providers/TextScope";
import { EditableText } from "@/components/editable/EditableText";
import {
  sectorContextFromSearchParams,
  teacherNameFromSearchParam,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type { SpecialEdMode } from "@/lib/special-ed-mode";
import type { StudentStatus } from "@/lib/supabase/types";

interface TeacherStudentsPageClientProps {
  status: StudentStatus;
  teacherName?: string;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  specialEdMode?: SpecialEdMode;
}

function TeacherPageFallback() {
  return (
    <PageShell>
      <div className="p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    </PageShell>
  );
}

function TeacherStudentsPageInner({
  status,
  teacherName: teacherNameProp,
  sector: sectorProp,
  framework: frameworkProp,
  area: areaProp = "personal-area",
  specialEdMode,
}: TeacherStudentsPageClientProps) {
  const searchParams = useSearchParams();
  const fromQuery = sectorContextFromSearchParams(searchParams);
  const sector = sectorProp ?? fromQuery.sector;
  const framework = frameworkProp ?? fromQuery.framework;
  const area = fromQuery.area ?? areaProp;
  const teacherName =
    teacherNameFromSearchParam(searchParams.get("name")) ||
    teacherNameProp?.trim() ||
    "";

  const list = (
    <StudentListByStatus
      status={status}
      teacherName={teacherName || undefined}
      sector={sector}
      framework={framework}
      area={area}
      specialEdMode={specialEdMode}
    />
  );

  return (
    <PageShell>
      {sector ? <TextScope sector={sector}>{list}</TextScope> : list}
    </PageShell>
  );
}

export function TeacherStudentsPageClient(props: TeacherStudentsPageClientProps) {
  return (
    <Suspense fallback={<TeacherPageFallback />}>
      <TeacherStudentsPageInner {...props} />
    </Suspense>
  );
}
