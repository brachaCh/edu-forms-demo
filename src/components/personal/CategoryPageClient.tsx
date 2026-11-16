"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { IntegrationTeacherCategoryClient } from "@/components/personal/IntegrationTeacherCategoryClient";
import { IntegrationFrequencyList } from "@/components/students/IntegrationFrequencyList";
import { SpecialEdClassList } from "@/components/students/SpecialEdClassList";
import { SpecialEdPackageGate } from "@/components/students/SpecialEdPackageGate";
import { StudentListByStatus } from "@/components/students/StudentListByStatus";
import { TeacherListByStatus } from "@/components/students/TeacherListByStatus";
import { TextScope } from "@/components/providers/TextScope";
import { EditableText } from "@/components/editable/EditableText";
import {
  statusUsesFrequencyStep,
  statusUsesSpecialEdClassStep,
  statusUsesTeacherStep,
} from "@/lib/labels";
import {
  sectorContextFromSearchParams,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type { StudentStatus } from "@/lib/supabase/types";

interface CategoryPageClientProps {
  status: StudentStatus;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
}

function CategoryPageFallback() {
  return (
    <PageShell>
      <div className="p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    </PageShell>
  );
}

function CategoryPageInner({
  status,
  sector: sectorProp,
  framework: frameworkProp,
  area: areaProp = "personal-area",
}: CategoryPageClientProps) {
  const searchParams = useSearchParams();
  const fromQuery = sectorContextFromSearchParams(searchParams);
  const sector = sectorProp ?? fromQuery.sector;
  const framework = frameworkProp ?? fromQuery.framework;
  const area = fromQuery.area ?? areaProp;

  const content =
    status === "integration-teacher" ? (
      <IntegrationTeacherCategoryClient
        sector={sector}
        framework={framework}
        area={area}
      />
    ) : statusUsesSpecialEdClassStep(status) ? (
      <SpecialEdPackageGate sector={sector} framework={framework} area={area}>
        <SpecialEdClassList
          sector={sector}
          framework={framework}
          area={area}
        />
      </SpecialEdPackageGate>
    ) : statusUsesFrequencyStep(status) ? (
      <IntegrationFrequencyList
        status={status}
        sector={sector}
        framework={framework}
        area={area}
      />
    ) : statusUsesTeacherStep(status) ? (
      <TeacherListByStatus
        status={status}
        sector={sector}
        framework={framework}
        area={area}
      />
    ) : (
      <StudentListByStatus
        status={status}
        sector={sector}
        framework={framework}
        area={area}
      />
    );

  return (
    <PageShell>
      {sector ? <TextScope sector={sector}>{content}</TextScope> : content}
    </PageShell>
  );
}

export function CategoryPageClient(props: CategoryPageClientProps) {
  return (
    <Suspense fallback={<CategoryPageFallback />}>
      <CategoryPageInner {...props} />
    </Suspense>
  );
}
