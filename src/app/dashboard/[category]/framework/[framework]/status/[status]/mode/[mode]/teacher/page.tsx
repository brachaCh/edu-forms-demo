import { notFound } from "next/navigation";
import { ClassCurriculumPageClient } from "@/components/personal/ClassCurriculumPageClient";
import { TeacherStudentsPageClient } from "@/components/personal/TeacherStudentsPageClient";
import {
  isEducationFramework,
  isPersonalSector,
} from "@/lib/personal-sector";
import { isSpecialEdMode } from "@/lib/special-ed-mode";

export const dynamic = "force-dynamic";

interface DashboardSpecialEdModeTeacherPageProps {
  params: Promise<{
    category: string;
    framework: string;
    status: string;
    mode: string;
  }>;
}

export default async function DashboardSpecialEdModeTeacherPage({
  params,
}: DashboardSpecialEdModeTeacherPageProps) {
  const { category, framework, status, mode } = await params;

  if (!isPersonalSector(category) || !isEducationFramework(framework)) {
    notFound();
  }
  if (status !== "special-ed-class" || !isSpecialEdMode(mode)) {
    notFound();
  }

  if (mode === "curriculum") {
    return (
      <ClassCurriculumPageClient
        sector={category}
        framework={framework}
        area="dashboard"
      />
    );
  }

  return (
    <TeacherStudentsPageClient
      status="special-ed-class"
      sector={category}
      framework={framework}
      area="dashboard"
      specialEdMode="student"
    />
  );
}
