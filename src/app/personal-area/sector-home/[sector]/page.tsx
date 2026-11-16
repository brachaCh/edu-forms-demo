import { notFound } from "next/navigation";
import { FrameworkSelectPageClient } from "@/components/personal/FrameworkSelectPageClient";
import { isPersonalSector } from "@/lib/personal-sector";

interface SectorHomeAliasPageProps {
  params: Promise<{ sector: string }>;
}

export default async function SectorHomeAliasPage({
  params,
}: SectorHomeAliasPageProps) {
  const { sector } = await params;
  if (!isPersonalSector(sector)) {
    notFound();
  }
  return <FrameworkSelectPageClient sector={sector} />;
}
