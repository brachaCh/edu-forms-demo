import { notFound } from "next/navigation";
import { FrameworkSelectPageClient } from "@/components/personal/FrameworkSelectPageClient";
import {
  DASHBOARD_SECTOR_TEXT_PATH,
  isPersonalSector,
} from "@/lib/personal-sector";

interface DashboardSectorPageProps {
  params: Promise<{ category: string }>;
}

export default async function DashboardSectorPage({
  params,
}: DashboardSectorPageProps) {
  const { category } = await params;
  if (!isPersonalSector(category)) {
    notFound();
  }

  return (
    <FrameworkSelectPageClient
      sector={category}
      area="dashboard"
      titlePath={DASHBOARD_SECTOR_TEXT_PATH[category]}
    />
  );
}
