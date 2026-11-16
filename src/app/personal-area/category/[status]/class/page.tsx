import { notFound } from "next/navigation";
import { SpecialEdClassPageClient } from "@/components/personal/SpecialEdClassPageClient";
import {
  isEducationFramework,
  isPersonalSector,
  teacherNameFromSearchParam,
} from "@/lib/personal-sector";

export const dynamic = "force-dynamic";

interface SpecialEdClassQueryPageProps {
  params: Promise<{ status: string }>;
  searchParams: Promise<{ name?: string; sector?: string; framework?: string }>;
}

export default async function SpecialEdClassQueryPage({
  params,
  searchParams,
}: SpecialEdClassQueryPageProps) {
  const { status } = await params;
  const query = await searchParams;
  const className = teacherNameFromSearchParam(query.name);
  if (status !== "special-ed-class" || !className) notFound();

  const sectorRaw = query.sector ?? "";
  const sector = isPersonalSector(sectorRaw) ? sectorRaw : undefined;
  const frameworkRaw = query.framework ?? "";
  const framework = isEducationFramework(frameworkRaw)
    ? frameworkRaw
    : undefined;

  return (
    <SpecialEdClassPageClient
      className={className}
      sector={sector}
      framework={framework}
      area="personal-area"
    />
  );
}
