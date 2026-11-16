"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  FileSpreadsheet,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { StudentExcelImportDialog } from "@/components/students/StudentExcelImportDialog";
import {
  categorySpecialEdClassModeHref,
  sectorFrameworkHref,
  sectorSpecialEdModeHref,
  sectorStatusHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type { SpecialEdMode } from "@/lib/special-ed-mode";
import { SPECIAL_ED_STUDENT_IMPORT_SAMPLE_HREF } from "@/lib/student-excel-import";
import { SpecialEdHomeroomPanel } from "@/components/students/SpecialEdHomeroomPanel";
import type { Category } from "@/lib/supabase/types";

/** שני הענפים מהתרשים — בלי תוספות */
const MODES: Array<{
  id: SpecialEdMode;
  titlePath: string;
  icon: typeof FolderOpen;
}> = [
  {
    id: "curriculum",
    titlePath: "status.specialEdModeCurriculum",
    icon: BookOpen,
  },
  {
    id: "student",
    titlePath: "status.specialEdModeStudent",
    icon: FolderOpen,
  },
];

interface SpecialEdModeListProps {
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  className?: string;
  /** Teacher name for Excel import sync */
  teacherName?: string;
  /** Callback after Excel import completes (refreshes parent list) */
  onImported?: () => void;
}

export function SpecialEdModeList({
  sector,
  framework = "special",
  area = "personal-area",
  className,
  teacherName,
  onImported,
}: SpecialEdModeListProps) {
  const [importOpen, setImportOpen] = useState(false);

  const backHref = sector
    ? className
      ? sectorStatusHref(sector, "special-ed-class", framework, area)
      : sectorFrameworkHref(sector, framework, area)
    : className
      ? "/personal-area/category/special-ed-class"
      : "/personal-area";

  function handleImported() {
    onImported?.();
  }

  return (
    <div className="menu-box">
      <h2 className="mb-4 border-b-2 border-brand-200 pb-2 text-center text-xl font-bold text-ink">
        <EditableText path="status.specialEdModeListTitle" />
        {className ? (
          <span className="mt-1 block text-lg text-pink">{className}</span>
        ) : null}
      </h2>

      {className ? (
        <SpecialEdHomeroomPanel
          className={className}
          category={(sector ?? "schools") as Category}
        />
      ) : null}

      {/* TZ-31: Excel import as recommended primary path for adding students */}
      <div className="mb-5 rounded-2xl border border-brand-200/80 bg-gradient-to-l from-brand-50 via-white to-white px-4 py-4 text-center shadow-sm">
        <p className="mb-3 text-sm font-medium text-ink">
          <EditableText path="status.specialEdExcelImportRecommended" />
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="lg"
            onClick={() => setImportOpen(true)}
          >
            <FileSpreadsheet className="h-5 w-5" />
            <EditableText path="personalArea.importExcel" />
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={SPECIAL_ED_STUDENT_IMPORT_SAMPLE_HREF} download>
              <Download className="h-5 w-5" />
              <EditableText path="personalArea.importExcelDownloadSample" />
            </a>
          </Button>
        </div>
      </div>

      <p className="mb-3 text-center text-xs text-pink/70">
        <EditableText path="status.specialEdOrManualEntry" />
      </p>

      <nav className="flex flex-col gap-3">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <Link
              key={mode.id}
              href={
                sector
                  ? sectorSpecialEdModeHref(
                      sector,
                      mode.id,
                      framework,
                      area,
                      className
                    )
                  : className
                    ? categorySpecialEdClassModeHref(mode.id, className)
                    : `/personal-area/category/special-ed-class/mode/${mode.id}`
              }
              className="menu-item justify-between gap-3"
            >
              <EditableText
                path={mode.titlePath}
                as="span"
                className="text-lg font-bold text-pink"
              />
              <span className="flex shrink-0 items-center gap-2 text-pink">
                <Icon className="h-5 w-5" />
                <ArrowLeft className="h-4 w-4" />
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText
              path={
                className
                  ? "status.specialEdClassBackToList"
                  : "personalArea.backToTable"
              }
            />
          </Link>
        </Button>
      </div>

      <StudentExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        status="special-ed-class"
        sector={sector}
        teacherName={teacherName}
        className={className}
        onImported={handleImported}
      />
    </div>
  );
}
