import { StudentPortfolioFolderPageClient } from "@/components/students/StudentPortfolioFolderPageClient";
import { decodeFolderParam } from "@/lib/hebrew-quotes";
import { parseSafeFromParam } from "@/lib/navigation-back";

interface StudentPortfolioCustomFolderPageProps {
  params: Promise<{ id: string; folder: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function StudentPortfolioCustomFolderPage({
  params,
  searchParams,
}: StudentPortfolioCustomFolderPageProps) {
  const { id, folder } = await params;
  const { from } = await searchParams;
  const folderName = decodeFolderParam(folder);
  return (
    <StudentPortfolioFolderPageClient
      id={id}
      folderName={folderName}
      backHref={parseSafeFromParam(from)}
    />
  );
}
