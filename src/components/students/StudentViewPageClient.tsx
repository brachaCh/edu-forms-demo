"use client";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentCardSimple } from "@/components/students/StudentCardSimple";

interface StudentViewPageClientProps {
  id: string;
  backHref?: string | null;
}

export function StudentViewPageClient({
  id,
  backHref,
}: StudentViewPageClientProps) {
  return (
    <PageShell lockPageScroll>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0">
          <PageHeader titlePath="personalArea.studentCardTitle" />
        </div>
        <div className="min-h-0 flex-1">
          <StudentCardSimple key={id} id={id} backHref={backHref} />
        </div>
      </div>
    </PageShell>
  );
}
