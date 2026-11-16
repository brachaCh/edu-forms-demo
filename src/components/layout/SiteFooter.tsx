"use client";

import { OfisenseCredit } from "@/components/layout/OfisenseCredit";
import { SiteNavLinks } from "@/components/layout/SiteNavLinks";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto shrink-0">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm text-muted-foreground">
        <SiteNavLinks />
        <span className="hidden text-brand-200 sm:inline" aria-hidden>
          |
        </span>
        <div className="flex items-center gap-1.5 font-medium text-ink/70">
          <span>© {year} כל הזכויות שמורות לאופיסנס (OfficeSense)</span>
        </div>
      </div>
      <OfisenseCredit />
    </footer>
  );
}
