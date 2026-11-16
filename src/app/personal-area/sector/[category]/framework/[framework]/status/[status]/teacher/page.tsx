import { notFound } from "next/navigation";
import { TeacherStudentsPageClient } from "@/components/personal/TeacherStudentsPageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";
import type { StudentStatus } from "@/lib/supabase/types";
import { statusUsesTeacherStep } from "@/lib/labels";

export const dynamic = "force-dynamic";

const VALID_STATUSES: StudentStatus[] = [
  "integration",
  "personal-basket",
  "special-ed-class",
  "integration-teacher",
];

interface SectorTeacherPageProps {
  params: Promise<{
    category: string;
    framework: string;
    status: string;
  }>;
}

export default async function SectorTeacherPage({
  params,
}: SectorTeacherPageProps) {
  const { category, framework, status } = await params;

  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  if (!VALID_STATUSES.includes(status as StudentStatus)) {
    notFound();
  }
  if (!statusUsesTeacherStep(status as StudentStatus)) {
    notFound();
  }

  return (
    <TeacherStudentsPageClient
      status={status as StudentStatus}
      sector={category}
      framework={framework}
    />
  );
}
