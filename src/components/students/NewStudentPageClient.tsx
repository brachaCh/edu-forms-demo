"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { SpecialEdPackageGate } from "@/components/students/SpecialEdPackageGate";
import { StudentWizard } from "@/components/students/StudentWizard";
import { TextScope } from "@/components/providers/TextScope";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { getCanManageStudents, hasCanManageStudentsLoaded } from "@/lib/mock-store";
import { midYearIntakeHref, isMidYearIntakeTarget, midYearIntakeYear } from "@/lib/mid-year-intake";
import {
  isPersonalSector,
  sectorFrameworkHref,
  sectorFrequencyHref,
  sectorSpecialEdModeHref,
  sectorStatusHref,
  sectorTeacherHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type {
  IntegrationFrequency,
  StudentStatus,
} from "@/lib/supabase/types";
import { statusUsesTeacherStep } from "@/lib/labels";
import { studentsListBackLabelPath } from "@/lib/student-list-back";

interface NewStudentPageClientProps {
  defaultCategory?: PersonalSector;
  defaultFramework?: EducationFramework;
  defaultStatus?: StudentStatus;
  defaultTeacher?: string;
  defaultFrequency?: IntegrationFrequency;
  defaultClassName?: string;
  area?: SectorArea;
  markAsMidYearIntake?: boolean;
  intakeYear?: number;
}

export function NewStudentPageClient({
  defaultCategory,
  defaultFramework = "special",
  defaultStatus,
  defaultTeacher,
  defaultFrequency,
  defaultClassName,
  area = "personal-area",
  markAsMidYearIntake = false,
  intakeYear,
}: NewStudentPageClientProps) {
  const router = useRouter();
  const { ready } = useDataStore();
  const [accessChecked, setAccessChecked] = useState(false);

  // TZ-28: Block members from creating students
  useEffect(() => {
    if (!ready) return;
    // Wait for session to load canManageStudents
    if (!hasCanManageStudentsLoaded()) return;

    if (!getCanManageStudents()) {
      // Redirect members back to student list
      router.replace("/personal-area/students");
      return;
    }
    setAccessChecked(true);
  }, [ready, router]);

  const teacher = defaultTeacher?.trim();
  const classKey = defaultClassName?.trim();
  const year = intakeYear ?? midYearIntakeYear();

  const backHref =
    markAsMidYearIntake &&
    defaultCategory &&
    defaultStatus &&
    isMidYearIntakeTarget(defaultStatus)
      ? midYearIntakeHref({
          sector: defaultCategory,
          framework: defaultFramework,
          area,
          target: defaultStatus,
          frequency: defaultFrequency,
          year,
        })
      : defaultCategory &&
          defaultStatus === "special-ed-class" &&
          classKey
        ? sectorSpecialEdModeHref(
            defaultCategory,
            "student",
            defaultFramework,
            area,
            classKey
          )
        : defaultCategory &&
            defaultStatus === "personal-basket" &&
            defaultFrequency
          ? sectorFrequencyHref(
              defaultCategory,
              "personal-basket",
              defaultFrequency,
              defaultFramework,
              area
            )
          : defaultCategory &&
              defaultStatus &&
              teacher &&
              statusUsesTeacherStep(defaultStatus) &&
              defaultStatus !== "integration-teacher"
            ? sectorTeacherHref(
                defaultCategory,
                defaultStatus,
                teacher,
                defaultFramework,
                area
              )
            : defaultCategory && defaultStatus
              ? sectorStatusHref(
                  defaultCategory,
                  defaultStatus,
                  defaultFramework,
                  area
                )
              : defaultCategory
                ? sectorFrameworkHref(defaultCategory, defaultFramework, area)
                : "/personal-area";

  // TZ-28: Don't render until access is confirmed
  if (!accessChecked) {
    return (
      <PageShell lockPageScroll>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="text-muted-foreground">טוען...</div>
        </div>
      </PageShell>
    );
  }

  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText
              path={
                defaultCategory
                  ? studentsListBackLabelPath({
                      href: backHref,
                      student: defaultStatus
                        ? { status: defaultStatus }
                        : null,
                    })
                  : "dashboard.personalArea"
              }
            />
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <StudentWizard
          defaultCategory={defaultCategory}
          defaultStatus={defaultStatus}
          defaultTeacher={defaultTeacher}
          defaultFrequency={defaultFrequency}
          defaultClassName={defaultClassName}
          continueHref={backHref}
          markAsMidYearIntake={markAsMidYearIntake}
          intakeYear={year}
        />
      </div>
    </div>
  );

  const page = (
    <PageShell lockPageScroll>
      {defaultCategory && isPersonalSector(defaultCategory) ? (
        <TextScope sector={defaultCategory}>{content}</TextScope>
      ) : (
        content
      )}
    </PageShell>
  );

  if (defaultStatus === "special-ed-class") {
    return (
      <SpecialEdPackageGate
        sector={defaultCategory}
        framework={defaultFramework}
        area={area}
        mode="create"
      >
        {page}
      </SpecialEdPackageGate>
    );
  }

  return page;
}
