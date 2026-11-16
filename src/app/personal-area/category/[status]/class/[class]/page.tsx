import { notFound } from "next/navigation";
import { SpecialEdClassPageClient } from "@/components/personal/SpecialEdClassPageClient";

interface LegacySpecialEdClassPageProps {
  params: Promise<{ class: string }>;
}

export default async function LegacySpecialEdClassPage({
  params,
}: LegacySpecialEdClassPageProps) {
  const { class: className } = await params;
  if (!className?.trim()) notFound();

  return (
    <SpecialEdClassPageClient
      className={decodeURIComponent(className)}
      area="personal-area"
    />
  );
}
