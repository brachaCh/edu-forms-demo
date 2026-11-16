import { StudentViewPageClient } from "@/components/students/StudentViewPageClient";
import { parseSafeFromParam } from "@/lib/navigation-back";

interface StudentViewPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function StudentViewPage({
  params,
  searchParams,
}: StudentViewPageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  return (
    <StudentViewPageClient id={id} backHref={parseSafeFromParam(from)} />
  );
}
