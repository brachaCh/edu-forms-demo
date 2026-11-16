import { Suspense } from "react";
import { PlanSelectPageClient } from "@/components/billing/PlanSelectPageClient";

export default function RegisterPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="menu-box p-8 text-center text-pink">טוען...</div>
      }
    >
      <PlanSelectPageClient mode="onboarding" />
    </Suspense>
  );
}
