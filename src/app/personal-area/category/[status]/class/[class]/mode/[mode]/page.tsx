import { notFound } from "next/navigation";
import { SpecialEdModePageClient } from "@/components/personal/SpecialEdModePageClient";
import { isSpecialEdMode } from "@/lib/special-ed-mode";

interface LegacySpecialEdClassModePageProps {
  params: Promise<{ status: string; class: string; mode: string }>;
}

export default async function LegacySpecialEdClassModePage({
  params,
}: LegacySpecialEdClassModePageProps) {
  const { status, class: className, mode } = await params;
  if (status !== "special-ed-class" || !isSpecialEdMode(mode) || !className?.trim()) {
    notFound();
  }

  return (
    <SpecialEdModePageClient
      mode={mode}
      area="personal-area"
      className={decodeURIComponent(className)}
    />
  );
}
