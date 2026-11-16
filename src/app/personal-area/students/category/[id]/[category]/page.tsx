import { notFound, redirect } from "next/navigation";
import {
  getPortfolioCategory,
  resolvePortfolioCategoryId,
  studentPortfolioCategoryHref,
} from "@/lib/student-portfolio";

interface StudentPortfolioCategoryAliasPageProps {
  params: Promise<{ id: string; category: string }>;
}

/**
 * Alias ישן — מפנה לנתיב /folder היציב.
 * Turbopack לעיתים מחזיר 404 על הראוט הזה עצמו; middleware גם מפנה ל-/folder.
 */
export default async function StudentPortfolioCategoryAliasPage({
  params,
}: StudentPortfolioCategoryAliasPageProps) {
  const { id, category } = await params;
  const resolved = resolvePortfolioCategoryId(category);
  if (!resolved || !getPortfolioCategory(resolved)) {
    notFound();
  }
  redirect(studentPortfolioCategoryHref(id, resolved));
}
