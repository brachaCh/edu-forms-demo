"use client";

import { usePathname } from "next/navigation";
import { isDemoMode } from "@/lib/demo-mode";
import { shouldShowProblemReportButton } from "@/lib/problem-report/visibility";
import { useSessionHome } from "@/components/layout/useSessionHome";
import { ProblemReportButton } from "@/components/layout/ProblemReportButton";

export function ProblemReportHeaderControl() {
  const { loggedIn, user } = useSessionHome();
  const pathname = usePathname() ?? "/";

  if (isDemoMode()) return null;
  if (!shouldShowProblemReportButton({ loggedIn, pathname })) return null;

  return <ProblemReportButton sessionEmail={user?.email?.trim() ?? ""} />;
}
