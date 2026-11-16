import { StudentFolderFormsPageClient } from "@/components/students/StudentFolderFormsPageClient";
import { getFormSchema, getFormSchemaByFolder } from "@/lib/form-schemas";
import { decodeFolderParam } from "@/lib/hebrew-quotes";
import { parseSafeFromParam } from "@/lib/navigation-back";
import { studentPortfolioHref } from "@/lib/student-portfolio";

interface StudentFormsAliasPageProps {
  params: Promise<{ id: string; folder: string }>;
  searchParams: Promise<{ from?: string; fromFolder?: string }>;
}

export default async function StudentFormsAliasPage({
  params,
  searchParams,
}: StudentFormsAliasPageProps) {
  const { id, folder } = await params;
  const { from, fromFolder } = await searchParams;
  const decoded = decodeFolderParam(folder);
  const schema = getFormSchema(decoded) ?? getFormSchemaByFolder(decoded);
  const folderName = schema?.folder ?? decoded;
  const backHref = parseSafeFromParam(from) ?? studentPortfolioHref(id);

  return (
    <StudentFolderFormsPageClient
      id={id}
      folderName={folderName}
      backHref={backHref}
      parentFolder={fromFolder}
    />
  );
}
