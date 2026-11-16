import { notFound } from "next/navigation";
import { SpecialEdModePageClient } from "@/components/personal/SpecialEdModePageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";
import { isSpecialEdMode } from "@/lib/special-ed-mode";

interface DashboardSpecialEdModePageProps {
  params: Promise<{
    category: string;
    framework: string;
    status: string;
    mode: string;
  }>;
}

export default async function DashboardSpecialEdModePage({
  params,
}: DashboardSpecialEdModePageProps) {
  const { category, framework, status, mode } = await params;

  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  if (status !== "special-ed-class" || !isSpecialEdMode(mode)) {
    notFound();
  }

  return (
    <SpecialEdModePageClient
      mode={mode}
      sector={category}
      framework={framework}
      area="dashboard"
    />
  );
}
