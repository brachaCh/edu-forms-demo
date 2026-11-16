import { notFound, redirect } from "next/navigation";
import {
  getPortfolioCategory,
  resolvePortfolioCategoryId,
  studentPortfolioCategoryHref,
} from "@/lib/student-portfolio";

interface StudentPortfolioCategoryPageProps {
  params: Promise<{ id: string; category: string }>;
}

/** Legacy — Turbopack 404 על נתיב זה; מפנים ל-/folder היציב. */
export default async function StudentPortfolioCategoryPage({
  params,
}: StudentPortfolioCategoryPageProps) {
  const { id, category } = await params;
  const resolved = resolvePortfolioCategoryId(category);
  if (!resolved || !getPortfolioCategory(resolved)) {
    notFound();
  }
  redirect(studentPortfolioCategoryHref(id, resolved));
}
