import { StudentFormFillPageClient } from "@/components/students/StudentFormFillPageClient";
import { resolveFillFolderBackHref } from "@/lib/student-fill-back";

interface StudentPortfolioFillPageProps {
  params: Promise<{ id: string; formId: string }>;
  searchParams: Promise<{ from?: string; fillId?: string; new?: string }>;
}

export default async function StudentPortfolioFillPage({
  params,
  searchParams,
}: StudentPortfolioFillPageProps) {
  const { id, formId } = await params;
  const { from, fillId, new: newFill } = await searchParams;
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
    />
  );
}
