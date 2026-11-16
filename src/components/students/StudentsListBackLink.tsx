"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { isStaffRosterHref, sameNavHref } from "@/lib/navigation-back";
import { studentsListBackLabelPath } from "@/lib/student-list-back";
import type { Student } from "@/lib/supabase/types";

interface StudentsListBackLinkProps {
  href?: string | null;
  /** אם היעד זהה לכפתור החזרה הראשי — לא מציגים כפילות */
  hideIf?: string | null;
  className?: string;
  student?: Pick<Student, "status"> | null;
  /** אם מסופק — תמיד מנווטים דרכו (לא בולעים לחיצה בשקט) */
  onNavigate?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
}

/** «חזרה לרשימת התלמידים» — בעמודי תלמיד; רוסטר צוות רק בכרטיס צוות */
export function StudentsListBackLink({
  href,
  hideIf,
  className,
  student,
  onNavigate,
}: StudentsListBackLinkProps) {
  if (!href) return null;
  if (isStaffRosterHref(href) && student?.status !== "integration-teacher") {
    return null;
  }
  if (hideIf && sameNavHref(href, hideIf)) return null;

  const labelPath = studentsListBackLabelPath({ href, student });

  return (
    <Button asChild variant="ghost" size="sm" className={className}>
      <Link
        href={href}
        onClick={(event) => {
          if (!onNavigate) return;
          event.preventDefault();
          onNavigate(href, event);
        }}
      >
        <ArrowRight className="h-4 w-4" />
        <EditableText path={labelPath} />
      </Link>
    </Button>
  );
}
