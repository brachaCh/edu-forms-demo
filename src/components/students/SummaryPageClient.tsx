"use client";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SummaryClient } from "@/components/students/SummaryClient";

export function SummaryPageClient() {
  return (
    <PageShell>
      <PageHeader
        titlePath="personalArea.summaryTitle"
        subtitlePath="personalArea.summarySubtitle"
      />
      <SummaryClient />
    </PageShell>
  );
}
