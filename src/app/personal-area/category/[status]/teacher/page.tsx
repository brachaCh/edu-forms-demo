import { notFound } from "next/navigation";
import { TeacherStudentsPageClient } from "@/components/personal/TeacherStudentsPageClient";
import type { StudentStatus } from "@/lib/supabase/types";
import { statusUsesTeacherStep } from "@/lib/labels";

export const dynamic = "force-dynamic";

const VALID_STATUSES: StudentStatus[] = [
  "integration",
  "personal-basket",
  "special-ed-class",
  "integration-teacher",
];

interface TeacherStudentsPageProps {
  params: Promise<{ status: string }>;
}

export default async function TeacherStudentsPage({
  params,
}: TeacherStudentsPageProps) {
  const { status } = await params;

  if (!VALID_STATUSES.includes(status as StudentStatus)) {
    notFound();
  }

  if (!statusUsesTeacherStep(status as StudentStatus)) {
    notFound();
  }

  return <TeacherStudentsPageClient status={status as StudentStatus} />;
}
