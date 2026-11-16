import { notFound } from "next/navigation";
import { FrequencyStudentsPageClient } from "@/components/personal/FrequencyStudentsPageClient";
import { isIntegrationFrequency } from "@/lib/integration-frequency";
import { statusUsesFrequencyStep } from "@/lib/labels";
import type { StudentStatus } from "@/lib/supabase/types";

interface CategoryFrequencyPageProps {
  params: Promise<{ status: string; frequency: string }>;
}

export default async function CategoryFrequencyPage({
  params,
}: CategoryFrequencyPageProps) {
  const { status, frequency } = await params;

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
    />
  );
}
