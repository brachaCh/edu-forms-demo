"use client";

import { Building2, HeartHandshake } from "lucide-react";
import { SimpleActionCard } from "@/components/layout/SimpleActionCard";
import {
  EDUCATION_FRAMEWORKS,
  FRAMEWORK_TEXT_PATH,
  sectorFrameworkHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";

const FRAMEWORK_ICONS: Record<
  EducationFramework,
  typeof Building2 | typeof HeartHandshake
> = {
  regular: Building2,
  special: HeartHandshake,
};

interface FrameworkSelectCardsProps {
  sector: PersonalSector;
  area?: SectorArea;
  preferredFramework?: EducationFramework | null;
  hrefForFramework?: (
    sector: PersonalSector,
    framework: EducationFramework
  ) => string;
}

export function FrameworkSelectCards({
  sector,
  area = "personal-area",
  preferredFramework,
  hrefForFramework,
}: FrameworkSelectCardsProps) {
  const frameworks = preferredFramework
    ? [
        preferredFramework,
        ...EDUCATION_FRAMEWORKS.filter((item) => item !== preferredFramework),
      ]
    : EDUCATION_FRAMEWORKS;

  return (
    <div className="grid w-full gap-4 sm:grid-cols-2">
      {frameworks.map((framework) => (
        <SimpleActionCard
          key={framework}
          href={
            hrefForFramework?.(sector, framework) ??
            sectorFrameworkHref(sector, framework, area)
          }
          textPath={FRAMEWORK_TEXT_PATH[framework]}
          icon={FRAMEWORK_ICONS[framework]}
        />
      ))}
    </div>
  );
}
