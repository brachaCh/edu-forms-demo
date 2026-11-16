"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canAccessSpecialEdClasses,
  hasExistingSpecialEdStudents,
} from "@/lib/plan-limits-client";
import { getUser } from "@/lib/mock-store";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import {
  institutionProfileHref,
  type EducationFramework,
  type PersonalSector,
  type SectorArea,
} from "@/lib/personal-sector";

interface SpecialEdPackageGateProps {
  sector?: PersonalSector;
  framework?: EducationFramework;
  area?: SectorArea;
  /** create = דף תלמיד חדש — תמיד לפי החבילה. view = רשימות/תיקים קיימים. */
  mode?: "view" | "create";
  children: React.ReactNode;
}

export function SpecialEdPackageGate({
  sector,
  framework,
  area = "personal-area",
  mode = "view",
  children,
}: SpecialEdPackageGateProps) {
  const router = useRouter();
  const { ready } = useDataStore();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (canAccessSpecialEdClasses()) {
      setAllowed(true);
      return;
    }
    if (mode === "create") {
      setAllowed(false);
      return;
    }
    setAllowed(hasExistingSpecialEdStudents());
  }, [mode, ready]);

  useEffect(() => {
    // TZ-161: In view mode, redirect to institution profile if not allowed.
    // In create mode, show an inline message instead of redirecting.
    if (allowed !== false || mode === "create") return;
    const user = getUser();
    const href =
      sector && framework
        ? institutionProfileHref(
            {
              institution_type: sector,
              education_framework: framework,
            },
            area
          )
        : institutionProfileHref(
            {
              institution_type: user?.institution_type ?? "schools",
              education_framework: user?.education_framework ?? "regular",
            },
            area
          );
    router.replace(href);
  }, [allowed, area, framework, mode, router, sector]);

  // TZ-161: Show clear Hebrew message when adding special-ed student is blocked
  if (allowed === false && mode === "create") {
    const user = getUser();
    const profileHref =
      sector && framework
        ? institutionProfileHref(
            {
              institution_type: sector,
              education_framework: framework,
            },
            area
          )
        : institutionProfileHref(
            {
              institution_type: user?.institution_type ?? "schools",
              education_framework: user?.education_framework ?? "regular",
            },
            area
          );
    return (
      <div
        className="mx-auto max-w-lg rounded-2xl border-2 border-brand-200 bg-white p-6 text-center shadow-sm"
        dir="rtl"
      >
        <p className="mb-4 text-lg font-bold text-ink">
          החבילה של המוסד לא כוללת כיתות חינוך מיוחד.
        </p>
        <p className="mb-6 text-sm text-pink">
          לשדרוג החבילה פנו לתמיכה או עדכנו את הגדרות המוסד.
        </p>
        <Button asChild variant="outline">
          <Link href={profileHref}>
            חזרה לפרופיל המוסד
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  if (!allowed) return null;
  return children;
}
