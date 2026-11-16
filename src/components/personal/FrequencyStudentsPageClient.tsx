"use client";

import { PageShell } from "@/components/layout/PageShell";
import { StudentListByStatus } from "@/components/students/StudentListByStatus";
import { TextScope } from "@/components/providers/TextScope";
import type {
  EducationFramework,
  PersonalSector,
  SectorArea,
} from "@/lib/personal-sector";
import type { IntegrationFrequency, StudentStatus } from "@/lib/supabase/types";

interface FrequencyStudentsPageClientProps {
  frequency: IntegrationFrequency;
  status?: StudentStatus;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
}

export function FrequencyStudentsPageClient({
  frequency,
  status = "personal-basket",
  sector,
  framework,
  area = "personal-area",
}: FrequencyStudentsPageClientProps) {
  const list = (
    <StudentListByStatus
      status={status}
      frequency={frequency}
      sector={sector}
      framework={framework}
      area={area}
    />
  );

  return (
    <PageShell>
      {sector ? <TextScope sector={sector}>{list}</TextScope> : list}
    </PageShell>
  );
}
