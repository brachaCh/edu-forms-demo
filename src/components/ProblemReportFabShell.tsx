"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isDemoMode } from "@/lib/demo-mode";
import { shouldShowProblemReportButton } from "@/lib/problem-report/visibility";
import { useSessionHome } from "@/components/layout/useSessionHome";

const ProblemReportFab = dynamic(
  () => import("@/components/ProblemReportFab").then((m) => m.ProblemReportFab),
  { ssr: false }
);

export function ProblemReportFabShell() {
  const { loggedIn } = useSessionHome();
  const pathname = usePathname() ?? "/";

  if (isDemoMode()) return null;
  if (!shouldShowProblemReportButton({ loggedIn, pathname })) return null;

  return <ProblemReportFab />;
}
