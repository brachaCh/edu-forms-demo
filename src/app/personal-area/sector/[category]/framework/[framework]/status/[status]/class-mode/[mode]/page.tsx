import { notFound, redirect } from "next/navigation";
import { SpecialEdModePageClient } from "@/components/personal/SpecialEdModePageClient";
import {
  isEducationFramework,
  isPersonalSector,
  teacherNameFromSearchParam,
} from "@/lib/personal-sector";
import { isSpecialEdMode } from "@/lib/special-ed-mode";

export const dynamic = "force-dynamic";

interface SectorSpecialEdClassModeAliasPageProps {
  params: Promise<{
    category: string;
    framework: string;
    status: string;
    mode: string;
  }>;
  searchParams: Promise<{ name?: string }>;
}

/** ראוט יציב — /class-mode/[mode]?name= במקום /class/[עברית]/mode/... */
export default async function SectorSpecialEdClassModeAliasPage({
  params,
  searchParams,
}: SectorSpecialEdClassModeAliasPageProps) {
  const { category, framework, status, mode } = await params;
  const query = await searchParams;
  const className = teacherNameFromSearchParam(query.name);

  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  if (status !== "special-ed-class" || !isSpecialEdMode(mode)) {
    notFound();
  }
  if (!className) {
    redirect(
      `/personal-area/sector/${category}/framework/${framework}/status/special-ed-class`
    );
  }

  return (
    <SpecialEdModePageClient
      mode={mode}
      sector={category}
      framework={framework}
      area="personal-area"
      className={className}
    />
  );
}
