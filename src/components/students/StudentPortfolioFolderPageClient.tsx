"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentFolderWorkspace } from "@/components/students/StudentFolderWorkspace";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { TextScope } from "@/components/providers/TextScope";
import { getStudents } from "@/lib/mock-store";
import { isPersonalSector } from "@/lib/personal-sector";
import { rememberDocumentFolder } from "@/lib/student-card";
import {
  getPortfolioCategory,
  studentPortfolioHref,
  type PortfolioCategoryId,
} from "@/lib/student-portfolio";
import { formatStudentDisplayName } from "@/lib/person-name";
import type { Student } from "@/lib/supabase/types";
import { readNavBackHref } from "@/lib/navigation-back";
import { resolveStudentsListBackHref } from "@/lib/student-list-back";
import { StudentsListBackLink } from "@/components/students/StudentsListBackLink";

interface StudentPortfolioFolderPageClientProps {
  id: string;
  /** קטגוריה קבועה — אם קיים משתמשים ב־textPath שלה */
  categoryId?: PortfolioCategoryId;
  /** שם תיקייה מותאם (או נגזר מהקטגוריה) */
  folderName?: string;
  backHref?: string | null;
}

export function StudentPortfolioFolderPageClient({
  id,
  categoryId,
  folderName,
  backHref,
}: StudentPortfolioFolderPageClientProps) {
  const { ready } = useDataStore();
  const [student, setStudent] = useState<Student | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const found = getStudents().find((s) => s.id === id);
    if (!found) {
      setStudent(null);
      setNotFound(true);
      return;
    }
    setNotFound(false);
    setStudent(found);
  }, [id, ready]);

  useEffect(() => {
    if (!student) return;
    const category = categoryId
      ? getPortfolioCategory(categoryId, student.status)
      : undefined;
    const locked = folderName?.trim() || category?.folder || "";
    if (locked) {
      rememberDocumentFolder(id, locked);
    }
  }, [id, student, categoryId, folderName]);

  if (notFound) {
    return (
      <PageShell>
        <div className="menu-box p-8 text-center">
          <EditableText
            path="common.notFound"
            as="p"
            block
            className="mb-4 text-pink"
          />
          <Button asChild>
            <Link href={studentPortfolioHref(id)}>
              <EditableText path="studentPortfolio.backToPortfolio" />
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  if (!student) {
    return (
      <PageShell>
        <div className="menu-box p-8 text-center text-pink">
          <EditableText path="common.loading" />
        </div>
      </PageShell>
    );
  }

  // חשוב: לפי סטטוס התלמיד — אחרת achievements נמשך משילוב ומופיעים "מסמך 1..6"
  const category = categoryId
    ? getPortfolioCategory(categoryId, student.status)
    : undefined;
  const lockedFolder = folderName?.trim() || category?.folder || "";
  const folderBackHref = backHref?.trim() || studentPortfolioHref(student.id);

  if (!lockedFolder) {
    return (
      <PageShell>
        <div className="menu-box p-8 text-center">
          <EditableText
            path="common.notFound"
            as="p"
            block
            className="mb-4 text-pink"
          />
          <Button asChild>
            <Link href={studentPortfolioHref(id)}>
              <EditableText path="studentPortfolio.backToPortfolio" />
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const content = (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={folderBackHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText path="common.back" />
          </Link>
        </Button>
        <StudentsListBackLink
          href={resolveStudentsListBackHref({
            from: backHref,
            stored: readNavBackHref(),
            student,
          })}
          hideIf={folderBackHref}
          student={student}
        />
      </div>

      {category ? (
        <PageHeader titlePath={category.textPath} />
      ) : (
        <h1 className="mb-3 text-center text-2xl font-bold text-ink sm:text-3xl">
          {lockedFolder}
        </h1>
      )}
      <p className="mb-3 text-center text-sm font-bold text-pink">
        {formatStudentDisplayName(student.full_name)}
      </p>

      <StudentFolderWorkspace
        studentId={student.id}
        folderName={lockedFolder}
      />
    </>
  );

  return (
    <PageShell>
      {isPersonalSector(student.category) ? (
        <TextScope sector={student.category}>{content}</TextScope>
      ) : (
        content
      )}
    </PageShell>
  );
}
