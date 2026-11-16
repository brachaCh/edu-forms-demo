import { Suspense } from "react";
import { TutorialsPageClient } from "@/components/dashboard/TutorialsPageClient";

export default function TutorialsPage() {
  return (
    <Suspense fallback={null}>
      <TutorialsPageClient />
    </Suspense>
  );
}
