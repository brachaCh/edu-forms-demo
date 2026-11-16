import { StudentPortfolioFolderPageClient } from "@/components/students/StudentPortfolioFolderPageClient";
import { decodeFolderParam } from "@/lib/hebrew-quotes";
import { parseSafeFromParam } from "@/lib/navigation-back";
import {
  resolvePortfolioCategoryId,
  studentPortfolioHref,
  type PortfolioCategoryId,
} from "@/lib/student-portfolio";

interface StudentFolderAliasPageProps {
  params: Promise<{ id: string; folder: string }>;
  searchParams: Promise<{ from?: string }>;
}

/**
 * Alias יציב לתיקיות (קטגוריות קבועות + תיקיות משנה בעברית).
 * Next.js/Turbopack מחזיר 404 על /portfolio/[id]/custom/[folder] ועל /category/...
 */
export default async function StudentFolderAliasPage({
  params,
  searchParams,
}: StudentFolderAliasPageProps) {
  const { id, folder } = await params;
  const { from } = await searchParams;
  const folderName = decodeFolderParam(folder);
  const categoryId = resolvePortfolioCategoryId(folderName) as
    | PortfolioCategoryId
    | undefined;
  return (
    <StudentPortfolioFolderPageClient
      id={id}
      categoryId={categoryId}
      folderName={folderName}
      backHref={parseSafeFromParam(from) ?? studentPortfolioHref(id)}
    />
  );
}
