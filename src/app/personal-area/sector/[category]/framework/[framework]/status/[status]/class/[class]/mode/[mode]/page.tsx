import { notFound } from "next/navigation";
import { SpecialEdModePageClient } from "@/components/personal/SpecialEdModePageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";
import { isSpecialEdMode } from "@/lib/special-ed-mode";

interface SectorSpecialEdClassModePageProps {
  params: Promise<{
    category: string;
    framework: string;
    status: string;
    class: string;
    mode: string;
  }>;
}

function decodeClassParam(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export default async function SectorSpecialEdClassModePage({
  params,
}: SectorSpecialEdClassModePageProps) {
  const {
    category,
    framework,
    status,
    class: classParam,
    mode,
  } = await params;

  const className = decodeClassParam(classParam ?? "");

  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  if (
    status !== "special-ed-class" ||
    !isSpecialEdMode(mode) ||
    !className
  ) {
    notFound();
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
