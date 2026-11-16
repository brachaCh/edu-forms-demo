import { notFound } from "next/navigation";
import { SectorAreaPageClient } from "@/components/personal/SectorAreaPageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";

interface DashboardFrameworkPageProps {
  params: Promise<{ category: string; framework: string }>;
}

export default async function DashboardFrameworkPage({
  params,
}: DashboardFrameworkPageProps) {
  const { category, framework } = await params;
  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }

  return (
    <SectorAreaPageClient
      sector={category}
      framework={framework}
      area="dashboard"
    />
  );
}
