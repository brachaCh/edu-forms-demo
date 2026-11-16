import { notFound } from "next/navigation";
import { CategoryPageClient } from "@/components/personal/CategoryPageClient";
import type { StudentStatus } from "@/lib/supabase/types";

const VALID_STATUSES: StudentStatus[] = [
  "integration",
  "personal-basket",
  "special-ed-class",
  "integration-teacher",
];

interface CategoryPageProps {
  params: Promise<{ status: string }>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { status } = await params;

  if (!VALID_STATUSES.includes(status as StudentStatus)) {
    notFound();
  }

  return <CategoryPageClient status={status as StudentStatus} />;
}
