import { notFound } from "next/navigation";
import { ClassCurriculumPageClient } from "@/components/personal/ClassCurriculumPageClient";
import { TeacherStudentsPageClient } from "@/components/personal/TeacherStudentsPageClient";
import { isSpecialEdMode } from "@/lib/special-ed-mode";

export const dynamic = "force-dynamic";

interface LegacySpecialEdModeTeacherPageProps {
  params: Promise<{ status: string; mode: string }>;
}

export default async function LegacySpecialEdModeTeacherPage({
  params,
}: LegacySpecialEdModeTeacherPageProps) {
  const { status, mode } = await params;
  if (status !== "special-ed-class" || !isSpecialEdMode(mode)) {
    notFound();
  }

  if (mode === "curriculum") {
    return <ClassCurriculumPageClient />;
  }

  return (
    <TeacherStudentsPageClient
      status="special-ed-class"
      specialEdMode="student"
    />
  );
}
