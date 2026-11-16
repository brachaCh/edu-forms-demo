"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { MidYearIntakeListClient } from "@/components/students/MidYearIntakeListClient";
import { EditableText } from "@/components/editable/EditableText";
import { TextScope } from "@/components/providers/TextScope";
import { parseCalendarYear } from "@/lib/calendar-year";
import { isIntegrationFrequency } from "@/lib/integration-frequency";
import {
  isMidYearIntakeTarget,
  midYearIntakeYear,
} from "@/lib/mid-year-intake";
import {
  isEducationFramework,
  isPersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";

function MidYearIntakeFallback() {
  return (
    <PageShell>
      <div className="p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    </PageShell>
  );
}

function MidYearIntakeInner() {
  const searchParams = useSearchParams();
  const sectorRaw = searchParams.get("sector") ?? "";
  const frameworkRaw = searchParams.get("framework") ?? "regular";
  const areaRaw = searchParams.get("area") ?? "personal-area";
  const targetRaw = searchParams.get("target") ?? "";
  const frequencyRaw = searchParams.get("frequency") ?? "";
  const yearRaw = searchParams.get("year");

  const sector = isPersonalSector(sectorRaw) ? sectorRaw : null;
  const framework = isEducationFramework(frameworkRaw)
    ? frameworkRaw
    : "regular";
  const area: SectorArea =
    areaRaw === "dashboard" ? "dashboard" : "personal-area";
  const target = isMidYearIntakeTarget(targetRaw) ? targetRaw : null;
  const frequency =
    target === "personal-basket" && isIntegrationFrequency(frequencyRaw)
      ? frequencyRaw
      : target === "personal-basket"
        ? "high"
        : undefined;
  const year = parseCalendarYear(yearRaw) ?? midYearIntakeYear();

  if (!sector || !target) {
    return (
      <PageShell>
        <div className="menu-box p-8 text-center text-pink">
          <EditableText path="common.notFound" />
        </div>
      </PageShell>
    );
  }

  const content = (
    <MidYearIntakeListClient
      sector={sector}
      framework={framework}
      area={area}
      target={target}
      frequency={frequency}
      year={year}
    />
  );

  return (
    <PageShell>
      <TextScope sector={sector}>{content}</TextScope>
    </PageShell>
  );
}

export function MidYearIntakePageClient() {
  return (
    <Suspense fallback={<MidYearIntakeFallback />}>
      <MidYearIntakeInner />
    </Suspense>
  );
}
