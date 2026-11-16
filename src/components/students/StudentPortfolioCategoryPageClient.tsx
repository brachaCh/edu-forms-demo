"use client";

import { StudentPortfolioFolderPageClient } from "@/components/students/StudentPortfolioFolderPageClient";
import type { PortfolioCategoryId } from "@/lib/student-portfolio";

interface StudentPortfolioCategoryPageClientProps {
  id: string;
  categoryId: PortfolioCategoryId;
}

/** תאימות לאחור — תיקיית קטגוריה קבועה בתיק התלמיד */
export function StudentPortfolioCategoryPageClient({
  id,
  categoryId,
}: StudentPortfolioCategoryPageClientProps) {
  return (
    <StudentPortfolioFolderPageClient id={id} categoryId={categoryId} />
  );
}
