"use client";

import dynamic from "next/dynamic";
import { isDemoMode } from "@/lib/demo-mode";

const BugReportFab = dynamic(
  () => import("@/components/BugReportFab").then((m) => m.BugReportFab),
  { ssr: false }
);

const SHOW_BUG_REPORT_FAB: boolean = false;

export function BugReportFabShell() {
  if (!SHOW_BUG_REPORT_FAB) return null;
  if (isDemoMode()) return null;
  return <BugReportFab />;
}
