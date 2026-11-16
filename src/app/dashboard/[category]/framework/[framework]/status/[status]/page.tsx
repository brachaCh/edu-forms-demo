import { notFound } from "next/navigation";
import { CategoryPageClient } from "@/components/personal/CategoryPageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";
import type { StudentStatus } from "@/lib/supabase/types";

const VALID_STATUSES: StudentStatus[] = [
  "integration",
  "personal-basket",
  "special-ed-class",
  "integration-teacher",
];

interface DashboardStatusPageProps {
  params: Promise<{ category: string; framework: string; status: string }>;
}

export default async function DashboardStatusPage({
  params,
}: DashboardStatusPageProps) {
  const { category, framework, status } = await params;

  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  if (!VALID_STATUSES.includes(status as StudentStatus)) {
    notFound();
  }

  return (
    <CategoryPageClient
      status={status as StudentStatus}
      sector={category}
      framework={framework}
      area="dashboard"
    />
  );
}
