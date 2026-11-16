import { notFound } from "next/navigation";
import { SpecialEdClassPageClient } from "@/components/personal/SpecialEdClassPageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";

interface DashboardSpecialEdClassPageProps {
  params: Promise<{
    category: string;
    framework: string;
    status: string;
    class: string;
  }>;
}

export default async function DashboardSpecialEdClassPage({
  params,
}: DashboardSpecialEdClassPageProps) {
  const {
    category,
    framework,
    status,
    class: className,
  } = await params;

  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  if (status !== "special-ed-class" || !className?.trim()) {
    notFound();
  }

  return (
    <SpecialEdClassPageClient
      className={decodeURIComponent(className)}
      sector={category}
      framework={framework}
      area="dashboard"
    />
  );
}
