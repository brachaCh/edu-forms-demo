import { StudentFolderFormsPageClient } from "@/components/students/StudentFolderFormsPageClient";
import { getFormSchema, getFormSchemaByFolder } from "@/lib/form-schemas";
import { decodeFolderParam } from "@/lib/hebrew-quotes";
import { parseSafeFromParam } from "@/lib/navigation-back";
import { studentPortfolioHref } from "@/lib/student-portfolio";

interface StudentPortfolioFormsPageProps {
  params: Promise<{ id: string; folder: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function StudentPortfolioFormsPage({
  params,
  searchParams,
}: StudentPortfolioFormsPageProps) {
  const { id, folder } = await params;
  const { from } = await searchParams;
  const decoded = decodeFolderParam(folder);
  const schema = getFormSchema(decoded) ?? getFormSchemaByFolder(decoded);
  const folderName = schema?.folder ?? decoded;
  const backHref = parseSafeFromParam(from) ?? studentPortfolioHref(id);

  return (
    <StudentFolderFormsPageClient
      id={id}
      folderName={folderName}
      backHref={backHref}
    />
  );
}
