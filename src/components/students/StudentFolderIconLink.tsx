"use client";

import Link from "next/link";
import { Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { studentPortfolioHref } from "@/lib/student-portfolio";

interface StudentFolderIconLinkProps {
  studentId: string;
  className?: string;
  label?: string;
  /** יעד חזרה לתיק (בד״כ כרטיס או רשימה) */
  from?: string | null;
}

/** אייקון בולט לתיק התלמיד — מצד שמאל של שורת הרשימה (ב־RTL) */
export function StudentFolderIconLink({
  studentId,
  className,
  label = "תיק התלמיד",
  from,
}: StudentFolderIconLinkProps) {
  return (
    <Link
      href={studentPortfolioHref(studentId, from)}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-[0_8px_18px_-8px_rgba(47,59,103,0.75)] transition hover:from-brand-500 hover:to-brand-700 hover:shadow-[0_10px_22px_-8px_rgba(47,59,103,0.85)] active:scale-95",
        className
      )}
    >
      <Briefcase className="h-6 w-6" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}
