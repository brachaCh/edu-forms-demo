import { StudentFormFillPageClient } from "@/components/students/StudentFormFillPageClient";
import { resolveFillFolderBackHref } from "@/lib/student-fill-back";

interface StudentParentQuestionnaireTlaFillAliasPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; fillId?: string; new?: string }>;
}

export default async function StudentParentQuestionnaireTlaFillAliasPage({
  params,
  searchParams,
}: StudentParentQuestionnaireTlaFillAliasPageProps) {
  const { id } = await params;
  const { from, fillId, new: newFill } = await searchParams;
  const backHref = resolveFillFolderBackHref({ from, studentId: id });

  return (
    <StudentFormFillPageClient
      id={id}
      formId="parent-questionnaire-tla"
      backHref={backHref}
      fromParam={from ?? null}
      fillId={fillId?.trim() || undefined}
      createNew={newFill === "1"}
    />
  );
}

