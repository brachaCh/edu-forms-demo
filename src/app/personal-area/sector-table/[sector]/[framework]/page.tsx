import { notFound } from "next/navigation";
import { SectorAreaPageClient } from "@/components/personal/SectorAreaPageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";

interface SectorTableAliasPageProps {
  params: Promise<{ sector: string; framework: string }>;
}

export default async function SectorTableAliasPage({
  params,
}: SectorTableAliasPageProps) {
  const { sector, framework } = await params;
  if (!isPersonalSector(sector) || !isEducationFramework(framework)) {
    notFound();
  }
  return <SectorAreaPageClient sector={sector} framework={framework} />;
}
