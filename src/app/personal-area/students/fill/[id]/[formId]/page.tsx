import { StudentFormFillPageClient } from "@/components/students/StudentFormFillPageClient";
import { resolveFillFolderBackHref } from "@/lib/student-fill-back";

interface StudentFillAliasPageProps {
  params: Promise<{ id: string; formId: string }>;
  searchParams: Promise<{ from?: string; fillId?: string; new?: string; fromFolder?: string }>;
}

export default async function StudentFillAliasPage({
  params,
  searchParams,
}: StudentFillAliasPageProps) {
  const { id, formId } = await params;
  const { from, fillId, new: newFill, fromFolder } = await searchParams;
  const decodedFormId = decodeURIComponent(formId).trim();
  const backHref = resolveFillFolderBackHref({ from, studentId: id });

  return (
    <StudentFormFillPageClient
      id={id}
      formId={decodedFormId}
      backHref={backHref}
      fromParam={from ?? null}
      fillId={fillId?.trim() || undefined}
      createNew={newFill === "1"}
      parentFolder={fromFolder}
    />
  );
}
