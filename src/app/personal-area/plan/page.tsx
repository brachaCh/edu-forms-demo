import { Suspense } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PlanSelectPageClient } from "@/components/billing/PlanSelectPageClient";

export default function PlanSelectPage() {
  return (
    <PageShell>
      <Suspense
        fallback={
          <div className="menu-box p-8 text-center text-pink">טוען...</div>
        }
      >
        <PlanSelectPageClient mode="manage" />
      </Suspense>
    </PageShell>
  );
}
