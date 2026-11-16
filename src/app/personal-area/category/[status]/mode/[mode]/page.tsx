import { notFound } from "next/navigation";
import { SpecialEdModePageClient } from "@/components/personal/SpecialEdModePageClient";
import { isSpecialEdMode } from "@/lib/special-ed-mode";
import {
  isEducationFramework,
  isPersonalSector,
  teacherNameFromSearchParam,
} from "@/lib/personal-sector";

export const dynamic = "force-dynamic";

interface SpecialEdModePageProps {
  params: Promise<{ status: string; mode: string }>;
  searchParams: Promise<{ name?: string; sector?: string; framework?: string }>;
}

export default async function SpecialEdModePage({
  params,
  searchParams,
}: SpecialEdModePageProps) {
  const { status, mode } = await params;
  const query = await searchParams;
  if (status !== "special-ed-class" || !isSpecialEdMode(mode)) {
    notFound();
  }

  const className = teacherNameFromSearchParam(query.name) || undefined;
  const sectorRaw = query.sector ?? "";
  const sector = isPersonalSector(sectorRaw) ? sectorRaw : undefined;
  const frameworkRaw = query.framework ?? "";
  const framework = isEducationFramework(frameworkRaw)
    ? frameworkRaw
    : undefined;

  return (
    <SpecialEdModePageClient
      mode={mode}
      className={className}
      sector={sector}
      framework={framework}
      area="personal-area"
    />
  );
}
