import { EditStudentPageClient } from "@/components/students/EditStudentPageClient";
import { parseSafeFromParam } from "@/lib/navigation-back";

interface EditStudentPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function EditStudentPage({
  params,
  searchParams,
}: EditStudentPageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  return (
    <EditStudentPageClient id={id} backHref={parseSafeFromParam(from)} />
  );
}
