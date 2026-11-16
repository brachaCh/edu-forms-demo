import { StudentPortfolioPageClient } from "@/components/students/StudentPortfolioPageClient";
import { parseSafeFromParam } from "@/lib/navigation-back";

interface StudentPortfolioPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function StudentPortfolioPage({
  params,
  searchParams,
}: StudentPortfolioPageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  return (
    <StudentPortfolioPageClient
      id={id}
      backHref={parseSafeFromParam(from)}
    />
  );
}
