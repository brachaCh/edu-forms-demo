import { notFound } from "next/navigation";
import { SectorAreaPageClient } from "@/components/personal/SectorAreaPageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";

interface SectorFrameworkPageProps {
  params: Promise<{ category: string; framework: string }>;
}

export default async function SectorFrameworkPage({
  params,
}: SectorFrameworkPageProps) {
  const { category, framework } = await params;
  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  return (
    <SectorAreaPageClient sector={category} framework={framework} />
  );
}
