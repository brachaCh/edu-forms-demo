"use client";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryTable } from "@/components/personal/CategoryTable";
import { PersonalAreaManageActions } from "@/components/personal/PersonalAreaManageActions";
import { TransferOwnershipPanel } from "@/components/personal/TransferOwnershipPanel";
import { UpcomingStaffMeetingsSection } from "@/components/personal/UpcomingStaffMeetingsSection";
import { TextScope } from "@/components/providers/TextScope";
import {
  DASHBOARD_SECTOR_TEXT_PATH,
  FRAMEWORK_TEXT_PATH,
  SECTOR_TEXT_PATH,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";

interface SectorAreaPageClientProps {
  sector: PersonalSector;
  framework: EducationFramework;
  area?: SectorArea;
  titlePath?: string;
}

export function SectorAreaPageClient({
  sector,
  framework,
  area = "personal-area",
  titlePath,
}: SectorAreaPageClientProps) {
  const resolvedTitlePath = titlePath ?? FRAMEWORK_TEXT_PATH[framework];
  const subtitlePath =
    area === "dashboard"
      ? DASHBOARD_SECTOR_TEXT_PATH[sector]
      : SECTOR_TEXT_PATH[sector];

  return (
    <PageShell>
      <TextScope sector={sector}>
        <PageHeader
          titlePath={resolvedTitlePath}
          subtitlePath={subtitlePath}
        />
        <div className="flex flex-col gap-6">
          <CategoryTable sector={sector} framework={framework} area={area} />
          {area === "personal-area" ? (
            <>
              <UpcomingStaffMeetingsSection />
              <PersonalAreaManageActions />
              <TransferOwnershipPanel />
            </>
          ) : null}
        </div>
      </TextScope>
    </PageShell>
  );
}
