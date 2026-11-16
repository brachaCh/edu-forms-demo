import { NewStudentPageClient } from "@/components/students/NewStudentPageClient";
import { parseCalendarYear } from "@/lib/calendar-year";
import { isIntegrationFrequency } from "@/lib/integration-frequency";
import { midYearIntakeYear } from "@/lib/mid-year-intake";
import {
  isEducationFramework,
  isPersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type { StudentStatus } from "@/lib/supabase/types";

const VALID_STATUSES: StudentStatus[] = [
  "integration",
  "personal-basket",
  "special-ed-class",
  "integration-teacher",
];

function isSectorArea(value: string): value is SectorArea {
  return value === "personal-area" || value === "dashboard";
}

interface NewStudentPageProps {
  searchParams: Promise<{
    category?: string;
    framework?: string;
    status?: string;
    teacher?: string;
    frequency?: string;
    area?: string;
    class?: string;
    intake?: string;
    year?: string;
  }>;
}

export default async function NewStudentPage({
  searchParams,
}: NewStudentPageProps) {
  const {
    category,
    framework,
    status,
    teacher,
    frequency,
    area,
    class: className,
    intake,
    year,
  } = await searchParams;
  const markAsMidYearIntake = intake === "1" || intake === "true";
  return (
    <NewStudentPageClient
      defaultCategory={
        category && isPersonalSector(category) ? category : undefined
      }
      defaultFramework={
        framework && isEducationFramework(framework) ? framework : undefined
      }
      defaultStatus={
        status && VALID_STATUSES.includes(status as StudentStatus)
          ? (status as StudentStatus)
          : undefined
      }
      defaultTeacher={teacher?.trim() || undefined}
      defaultFrequency={
        frequency && isIntegrationFrequency(frequency) ? frequency : undefined
      }
      defaultClassName={className?.trim() || undefined}
      area={area && isSectorArea(area) ? area : undefined}
      markAsMidYearIntake={markAsMidYearIntake}
      intakeYear={
        markAsMidYearIntake
          ? parseCalendarYear(year) ?? midYearIntakeYear()
          : undefined
      }
    />
  );
}
