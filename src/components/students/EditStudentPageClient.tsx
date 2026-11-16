"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { EditStudentClient } from "@/components/students/EditStudentClient";
import { readNavBackHref } from "@/lib/navigation-back";
import {
  resolveStudentsListBackHref,
  studentsListBackLabelPath,
} from "@/lib/student-list-back";
import { useMemo } from "react";

interface EditStudentPageClientProps {
  id: string;
  backHref?: string | null;
}

export function EditStudentPageClient({
  id,
  backHref,
}: EditStudentPageClientProps) {
  const listHref = useMemo(
    () =>
      resolveStudentsListBackHref({
        from: backHref,
        stored: readNavBackHref(),
      }),
    [backHref]
  );
  const resolvedBackHref =
    listHref || `/personal-area/students/view/${id}`;

  return (
    <PageShell lockPageScroll>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0">
          <Button asChild variant="ghost" size="sm">
            <Link href={resolvedBackHref}>
              <ArrowRight className="h-4 w-4" />
              <EditableText
                path={
                  listHref
                    ? studentsListBackLabelPath({ href: listHref })
                    : "studentPortfolio.backToCard"
                }
              />
            </Link>
          </Button>
          <PageHeader
            titlePath="wizard.editStudentTitle"
            subtitlePath="personalArea.editStudentSubtitle"
          />
        </div>
        <div className="min-h-0 flex-1">
          <EditStudentClient id={id} />
        </div>
      </div>
    </PageShell>
  );
}
