import { notFound, redirect } from "next/navigation";
import {
  resolvePortfolioCategoryId,
  studentPortfolioCategoryHref,
} from "@/lib/student-portfolio";

interface StudentPortfolioCategoryLegacyAliasPageProps {
  params: Promise<{ id: string; category: string }>;
}

/** Legacy alias — redirects to the stable /category/ route. */
export default async function StudentPortfolioCategoryLegacyAliasPage({
  params,
}: StudentPortfolioCategoryLegacyAliasPageProps) {
  const { id, category } = await params;
  const resolved = resolvePortfolioCategoryId(category);
  if (!resolved) {
    notFound();
  }
  redirect(studentPortfolioCategoryHref(id, resolved));
}
