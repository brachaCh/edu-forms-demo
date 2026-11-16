"use client";

import { SpecialEdPackageGate } from "@/components/students/SpecialEdPackageGate";
import { PageShell } from "@/components/layout/PageShell";
import { SpecialEdModeList } from "@/components/students/SpecialEdModeList";
import { TextScope } from "@/components/providers/TextScope";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { resolveEffectiveTeacherName } from "@/lib/student-excel-import-actions";
import {
  getCanManageStudents,
  getStudents,
  getUser,
} from "@/lib/mock-store";
import {
  listStudentsInSpecialEdClass,
  normalizeSpecialEdClassName,
} from "@/lib/special-ed-classes";
import type {
  EducationFramework,
  PersonalSector,
  SectorArea,
} from "@/lib/personal-sector";

interface SpecialEdClassPageClientProps {
  className: string;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
}

/** אחרי בחירת כיתה — בחירה בין תיק תלמיד לתל"כ */
export function SpecialEdClassPageClient({
  className,
  sector,
  framework = "special",
  area = "personal-area",
}: SpecialEdClassPageClientProps) {
  const { refresh } = useDataStore();
  const classKey = normalizeSpecialEdClassName(className);
  const category = sector ?? "schools";

  const user = getUser();
  const staffCard = user?.id
    ? getStudents().find(
        (s) =>
          s.status === "integration-teacher" && s.user_profile_id === user.id
      )
    : null;
  const rosterTeacher = listStudentsInSpecialEdClass(classKey, category).find(
    (s) => s.teacher_name?.trim()
  )?.teacher_name;
  const teacherName =
    resolveEffectiveTeacherName({
      isAdmin: getCanManageStudents(),
      propTeacherName: rosterTeacher,
      memberTeacherName: staffCard?.full_name,
    }) ?? undefined;

  const content = (
    <SpecialEdModeList
      sector={sector}
      framework={framework}
      area={area}
      className={classKey}
      teacherName={teacherName}
      onImported={() => {
        void refresh();
      }}
    />
  );

  return (
    <SpecialEdPackageGate sector={sector} framework={framework} area={area}>
      <PageShell>
        {sector ? <TextScope sector={sector}>{content}</TextScope> : content}
      </PageShell>
    </SpecialEdPackageGate>
  );
}
