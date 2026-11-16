"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { LiveDate } from "@/components/layout/LiveDate";
import { BackButton } from "@/components/layout/BackButton";
import { InstitutionProfileBackLink } from "@/components/layout/InstitutionProfileBackLink";
import { useSessionHome } from "@/components/layout/useSessionHome";

interface AppHeaderProps {
  className?: string;
  actions?: React.ReactNode;
  maxWidthClassName?: string;
  /** בדף הכניסה הלוגו הגדול הוא הגיבור — בלי כפילות בכותרת */
  hideLogo?: boolean;
}

export function AppHeader({
  className,
  actions,
  maxWidthClassName = "max-w-4xl",
  hideLogo = false,
}: AppHeaderProps) {
  const { logoHref, loggedIn } = useSessionHome();

  return (
    <header className={cn("shrink-0 px-4 py-2 sm:px-6", className)}>
      <div
        className={cn(
          "mx-auto flex items-start justify-between gap-3",
          maxWidthClassName
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <BackButton className="shrink-0" />
          <InstitutionProfileBackLink className="shrink-0" />
          <LiveDate />
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start sm:gap-3">
          {actions}
          {!hideLogo ? (
            <Link
              href={logoHref}
              className="shrink-0 transition-opacity hover:opacity-80"
              aria-label={
                loggedIn ? "חזרה לפרופיל המוסד" : "חזרה לדף הכניסה"
              }
            >
              <Logo size="md" />
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
