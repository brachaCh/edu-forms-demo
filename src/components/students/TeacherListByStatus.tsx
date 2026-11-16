"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getKnownTeacherNames,
  getStudentsByStatusAndTeacher,
} from "@/lib/mock-store";
import type { StudentStatus } from "@/lib/supabase/types";
import { EditableText } from "@/components/editable/EditableText";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import {
  sectorFrameworkHref,
  sectorSpecialEdModeHref,
  sectorSpecialEdModeTeacherHref,
  categorySpecialEdModeTeacherHref,
  categoryTeacherHref,
  sectorTeacherHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import type { SpecialEdMode } from "@/lib/special-ed-mode";
import {
  matchesPersonQuery,
  PersonSearchField,
} from "@/components/students/PersonSearchField";

interface TeacherListByStatusProps {
  status: StudentStatus;
  embedded?: boolean;
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  /** כיתות חינוך מיוחד — אחרי בחירת מצב תיק תלמיד / תל"כ */
  specialEdMode?: SpecialEdMode;
}

export function TeacherListByStatus({
  status,
  embedded = false,
  sector,
  framework = "special",
  area = "personal-area",
  specialEdMode,
}: TeacherListByStatusProps) {
  const { ready: dataReady } = useDataStore();
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!dataReady) return;
    setReady(true);
  }, [dataReady]);

  const teachers = useMemo(() => {
    if (!ready) return [];
    return getKnownTeacherNames(sector).filter((name) =>
      matchesPersonQuery(query, name)
    );
  }, [ready, sector, query]);

  const allTeachers = useMemo(() => {
    if (!ready) return [];
    return getKnownTeacherNames(sector);
  }, [ready, sector]);

  const countsByTeacher = useMemo(() => {
    const next: Record<string, number> = {};
    for (const name of allTeachers) {
      next[name] = getStudentsByStatusAndTeacher(status, name, sector).length;
    }
    return next;
  }, [allTeachers, status, sector]);

  if (!ready) {
    return (
      <div
        className={
          embedded
            ? "p-8 text-center text-pink"
            : "menu-box p-8 text-center text-pink"
        }
      >
        <EditableText path="common.loading" />
      </div>
    );
  }

  const content = (
    <>
      {!embedded && (
        <h2 className="mb-4 border-b-2 border-brand-200 pb-2 text-center text-xl font-bold text-ink">
          <EditableText path="status.teachersListTitle" />
        </h2>
      )}

      {embedded && (
        <h3 className="mb-4 border-b-2 border-brand-200 pb-2 text-center text-lg font-bold text-ink">
          <EditableText path="status.teachersListTitle" />
        </h3>
      )}

      <PersonSearchField
        id={`teacher-list-search-${status}`}
        value={query}
        onChange={setQuery}
        options={allTeachers}
        labelPath="personalArea.staffSearchPlaceholder"
      />

      {teachers.length === 0 ? (
        <div className="p-6 text-center">
          <EditableText
            path="status.teachersEmptyList"
            as="p"
            block
            className="text-pink"
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {teachers.map((name) => (
            <li key={name}>
              <Link
                href={
                  specialEdMode && sector
                    ? sectorSpecialEdModeTeacherHref(
                        sector,
                        specialEdMode,
                        name,
                        framework,
                        area
                      )
                    : specialEdMode
                      ? categorySpecialEdModeTeacherHref(specialEdMode, name)
                      : sector
                        ? sectorTeacherHref(
                            sector,
                            status,
                            name,
                            framework,
                            area
                          )
                        : categoryTeacherHref(status, name)
                }
                className="menu-item justify-between"
              >
                <span className="text-lg font-bold text-pink">{name}</span>
                <span className="flex items-center gap-2 text-sm text-pink">
                  {countsByTeacher[name] ?? 0}{" "}
                  <EditableText path="personalArea.recordsLabel" />
                  <Briefcase className="h-5 w-5 shrink-0" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!embedded && (
        <div className="mt-4">
          <Button asChild variant="ghost" size="sm">
            <Link
              href={
                specialEdMode && sector
                  ? sectorSpecialEdModeHref(
                      sector,
                      specialEdMode,
                      framework,
                      area
                    )
                  : specialEdMode
                    ? `/personal-area/category/${status}/mode/${specialEdMode}`
                    : sector
                      ? sectorFrameworkHref(sector, framework, area)
                      : "/personal-area"
              }
            >
              <ArrowRight className="h-4 w-4" />
              <EditableText
                path={
                  specialEdMode
                    ? "status.specialEdModeBackToModes"
                    : "personalArea.backToTable"
                }
              />
            </Link>
          </Button>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return <div className="menu-box">{content}</div>;
}
