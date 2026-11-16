import { notFound } from "next/navigation";
import { FrameworkSelectPageClient } from "@/components/personal/FrameworkSelectPageClient";
import { isPersonalSector } from "@/lib/personal-sector";

interface SectorPageProps {
  params: Promise<{ category: string }>;
}

export default async function SectorPage({ params }: SectorPageProps) {
  const { category } = await params;
  if (!isPersonalSector(category)) {
    notFound();
  }
  return <FrameworkSelectPageClient sector={category} />;
}
