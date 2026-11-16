import { notFound } from "next/navigation";
import { FrequencyStudentsPageClient } from "@/components/personal/FrequencyStudentsPageClient";
import { isIntegrationFrequency } from "@/lib/integration-frequency";
import { statusUsesFrequencyStep } from "@/lib/labels";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";
import type { StudentStatus } from "@/lib/supabase/types";

interface SectorFrequencyPageProps {
  params: Promise<{
    category: string;
    framework: string;
    status: string;
    frequency: string;
  }>;
}

export default async function SectorFrequencyPage({
  params,
}: SectorFrequencyPageProps) {
  const { category, framework, status, frequency } = await params;

  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  if (
    status !== "personal-basket" ||
    !statusUsesFrequencyStep(status as StudentStatus)
  ) {
    notFound();
  }
  if (!isIntegrationFrequency(frequency)) {
    notFound();
  }

  return (
    <FrequencyStudentsPageClient
      status="personal-basket"
      frequency={frequency}
      sector={category}
      framework={framework}
    />
  );
}
