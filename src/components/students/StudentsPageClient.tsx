"use client";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentsListClient } from "@/components/students/StudentsListClient";

export function StudentsPageClient() {
  return (
    <PageShell>
      <PageHeader
        titlePath="personalArea.studentsTitle"
        subtitlePath="personalArea.studentsSubtitle"
      />
      <StudentsListClient />
    </PageShell>
  );
}
