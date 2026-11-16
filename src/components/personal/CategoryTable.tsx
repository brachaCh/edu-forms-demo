"use client";

import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getStaffTeachers,
  getStudents,
  getUser,
  patchUserSession,
  resolveInstitutionDetails,
} from "@/lib/mock-store";
import {
  filterStatusesForSpecialEdPackage,
  statusDisplayOrderForFramework,
  statusTextPathForFramework,
} from "@/lib/labels";
import { shouldShowSpecialEdClasses } from "@/lib/plan-limits-client";
import type { UserProfile } from "@/lib/supabase/types";
import type { IntegrationFrequency } from "@/lib/supabase/types";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatHebrewYear } from "@/lib/calendar-year";
import {
  isMidYearIntakePending,
  midYearIntakeHref,
  midYearIntakeYear,
} from "@/lib/mid-year-intake";
import {
  sectorStatusHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";
import { useRouter } from "next/navigation";

interface CategoryTableProps {
  sector: PersonalSector;
  framework: EducationFramework;
  area?: SectorArea;
}

export function CategoryTable({
  sector,
  framework,
  area = "personal-area",
}: CategoryTableProps) {
  const { texts } = useSiteText();
  const { ready } = useDataStore();
  const router = useRouter();
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeTarget, setIntakeTarget] = useState<
    "integration" | "personal-basket" | null
  >(null);
  const [intakeFrequency, setIntakeFrequency] =
    useState<IntegrationFrequency>("high");
  const [includeSpecialEdClasses, setIncludeSpecialEdClasses] = useState(false);
  const statusKeys = filterStatusesForSpecialEdPackage(
    statusDisplayOrderForFramework(framework),
    includeSpecialEdClasses
  );
  const year = midYearIntakeYear();

  useEffect(() => {
    setIncludeSpecialEdClasses(shouldShowSpecialEdClasses());
  }, [ready]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSchoolName() {
      let sessionUser: UserProfile | null = null;
      try {
        const response = await fetch("/api/auth/session");
        if (response.ok) {
          const data = (await response.json()) as {
            profile: UserProfile | null;
          };
          sessionUser = data.profile;
        }
      } catch {
        // offline — fall back to local cache
      }

      if (cancelled) return;

      const localUser = getUser();
      const user = sessionUser
        ? {
            ...sessionUser,
            school_name:
              sessionUser.school_name ?? localUser?.school_name ?? null,
          }
        : localUser;

      if (!user) return;

      if (sessionUser) {
        patchUserSession(user);
      }
      setIncludeSpecialEdClasses(shouldShowSpecialEdClasses());

      const details = await resolveInstitutionDetails(user);
      if (cancelled) return;

      const resolved =
        details.school_name?.trim() || user.school_name?.trim() || null;
      if (
        details.school_name?.trim() &&
        details.school_name !== user.school_name
      ) {
        patchUserSession({ school_name: details.school_name });
      }
      setSchoolName(resolved);
    }

    void hydrateSchoolName();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    if (!ready) return {} as Record<string, number>;
    const students = getStudents().filter((s) => s.category === sector);
    const next: Record<string, number> = {};
    for (const key of statusKeys) {
      if (key === "integration-teacher") {
        next[key] = getStaffTeachers(sector).length;
        continue;
      }
      next[key] = students.filter(
        (s) => s.status === key && !isMidYearIntakePending(s.id)
      ).length;
    }
    return next;
  }, [texts, ready, sector, statusKeys]);

  function openIntake(target: "integration" | "personal-basket") {
    if (target === "personal-basket") {
      setIntakeTarget(target);
      return;
    }
    setIntakeOpen(false);
    setIntakeTarget(null);
    router.push(
      midYearIntakeHref({
        sector,
        framework,
        area,
        target,
        year,
      })
    );
  }

  function confirmPersonalBasketIntake() {
    setIntakeOpen(false);
    setIntakeTarget(null);
    router.push(
      midYearIntakeHref({
        sector,
        framework,
        area,
        target: "personal-basket",
        frequency: intakeFrequency,
        year,
      })
    );
  }

  return (
    <div className="menu-box">
      {schoolName ? (
        <p className="mb-3 text-center text-lg font-bold text-pink sm:text-xl">
          {schoolName}
        </p>
      ) : null}
      <div className="mb-4 flex justify-center border-b-2 border-brand-200 pb-2">
        <EditableText
          path="personalArea.categoryTableTitle"
          as="h2"
          center
          className="text-xl font-bold text-ink"
        />
      </div>
      <nav className="flex flex-col gap-3">
        {statusKeys.map((value) => (
          <Link
            key={value}
            href={sectorStatusHref(sector, value, framework, area)}
            className="menu-item justify-between"
          >
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <EditableText
                path={statusTextPathForFramework(value, framework)}
                as="span"
                className="text-lg font-bold text-pink"
              />
              {framework === "special" && value === "special-ed-class" ? (
                <EditableText
                  path="status.specialFrameworkClassHint"
                  as="span"
                  className="text-sm font-medium text-ink/70"
                />
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm text-pink">
              {counts[value] ?? 0}{" "}
              <EditableText path="personalArea.recordsLabel" />
              <ArrowLeft className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </nav>

      {framework === "regular" ? (
        <div className="mt-5 border-t-2 border-brand-100 pt-4">
          <Button
            type="button"
            className="w-full justify-between"
            size="lg"
            onClick={() => {
              setIntakeTarget(null);
              setIntakeOpen(true);
            }}
          >
            <span className="flex items-center gap-2 text-start">
              <UserPlus className="h-5 w-5 shrink-0" />
              <span>
                <EditableText
                  path="personalArea.midYearIntakeButton"
                  as="span"
                />{" "}
                {formatHebrewYear(year)}
              </span>
            </span>
            <ArrowLeft className="h-4 w-4 shrink-0" />
          </Button>
        </div>
      ) : null}

      <Dialog
        open={intakeOpen}
        onOpenChange={(open) => {
          setIntakeOpen(open);
          if (!open) setIntakeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText path="personalArea.midYearIntakeChooseTitle" />
            </DialogTitle>
            <DialogDescription>
              <EditableText path="personalArea.midYearIntakeChooseDescription" />
            </DialogDescription>
          </DialogHeader>

          {intakeTarget === "personal-basket" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-ink">
                <EditableText path="personalArea.midYearIntakeChooseFrequency" />
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  variant={intakeFrequency === "high" ? "default" : "outline"}
                  onClick={() => setIntakeFrequency("high")}
                >
                  <EditableText path="status.frequencyHigh" />
                </Button>
                <Button
                  type="button"
                  variant={intakeFrequency === "low" ? "default" : "outline"}
                  onClick={() => setIntakeFrequency("low")}
                >
                  <EditableText path="status.frequencyLow" />
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" onClick={confirmPersonalBasketIntake}>
                  <EditableText path="personalArea.midYearIntakeContinue" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIntakeTarget(null)}
                >
                  <EditableText path="wizard.cancelButton" />
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="justify-between"
                onClick={() => openIntake("integration")}
              >
                <EditableText path="status.integration" />
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-between"
                onClick={() => openIntake("personal-basket")}
              >
                <EditableText path="status.personalBasket" />
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIntakeOpen(false)}
                >
                  <EditableText path="wizard.cancelButton" />
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
