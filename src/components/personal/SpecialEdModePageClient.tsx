"use client";

import { SpecialEdPackageGate } from "@/components/students/SpecialEdPackageGate";
import { PageShell } from "@/components/layout/PageShell";
import { ClassCurriculumPageClient } from "@/components/personal/ClassCurriculumPageClient";
import { StudentListByStatus } from "@/components/students/StudentListByStatus";
import { TextScope } from "@/components/providers/TextScope";
import { normalizeSpecialEdClassName } from "@/lib/special-ed-classes";
import type {
  EducationFramework,
  PersonalSector,
  SectorArea,
} from "@/lib/personal-sector";
import type { SpecialEdMode } from "@/lib/special-ed-mode";

interface SpecialEdModePageClientProps {
  mode: SpecialEdMode;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  className?: string;
}

export function SpecialEdModePageClient({
  mode,
  sector,
  framework = "special",
  area = "personal-area",
  className,
}: SpecialEdModePageClientProps) {
  const classKey = className
    ? normalizeSpecialEdClassName(className)
    : undefined;

  // תל"כ — ישר לתיק הכיתתי, בלי בחירת איש צוות
  if (mode === "curriculum") {
    return (
      <ClassCurriculumPageClient
        sector={sector}
        framework={framework}
        area={area}
        className={classKey}
      />
    );
  }

  // תיק תלמיד כיתה — ישר לרשימת התלמידים של הכיתה
  const content = (
    <StudentListByStatus
      status="special-ed-class"
      sector={sector}
      framework={framework}
      area={area}
      specialEdMode={mode}
      className={classKey}
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
