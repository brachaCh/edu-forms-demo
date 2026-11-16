"use client";

import { Baby, GraduationCap, School } from "lucide-react";
import { SimpleActionCard } from "@/components/layout/SimpleActionCard";
import {
  PERSONAL_SECTORS,
  sectorHomeHref,
  type PersonalSector,
} from "@/lib/personal-sector";

/** תוויות ייעודיות לבחירת מגזר — לא categories.* (שנערכו בטעות לטקסטי מסגרת) */
const SECTOR_LABEL_PATH: Record<PersonalSector, string> = {
  kindergartens: "personalArea.sectorKindergartens",
  "high-schools": "personalArea.sectorHighSchools",
  schools: "personalArea.sectorSchools",
};

const SECTOR_ICONS: Record<
  PersonalSector,
  typeof Baby | typeof GraduationCap | typeof School
> = {
  kindergartens: Baby,
  "high-schools": GraduationCap,
  schools: School,
};

export function SectorSelectCards() {
  return (
    <div className="grid w-full gap-4 sm:grid-cols-3">
      {PERSONAL_SECTORS.map((sector) => (
        <SimpleActionCard
          key={sector}
          href={sectorHomeHref(sector)}
          textPath={SECTOR_LABEL_PATH[sector]}
          icon={SECTOR_ICONS[sector]}
        />
      ))}
    </div>
  );
}
