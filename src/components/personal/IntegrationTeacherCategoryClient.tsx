"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeachersRoster } from "@/components/students/TeachersRoster";
import { EditableText } from "@/components/editable/EditableText";
import {
  sectorFrameworkHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";

interface IntegrationTeacherCategoryClientProps {
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
}

export function IntegrationTeacherCategoryClient({
  sector,
  framework = "special",
  area = "personal-area",
}: IntegrationTeacherCategoryClientProps) {
  return (
    <div className="menu-box">
      <TeachersRoster
        sector={sector}
        framework={framework}
        area={area}
      />

      <div className="mt-4">
        <Button asChild variant="ghost" size="sm">
          <Link
            href={
              sector
                ? sectorFrameworkHref(sector, framework, area)
                : "/personal-area"
            }
          >
            <ArrowRight className="h-4 w-4" />
            <EditableText path="personalArea.backToTable" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
