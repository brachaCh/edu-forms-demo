"use client";

import { OfisenseCredit } from "@/components/layout/OfisenseCredit";
import { SiteNavLinks } from "@/components/layout/SiteNavLinks";

export function SiteFooter() {
  return (
    <footer className="mt-auto shrink-0">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm text-muted-foreground">
        <SiteNavLinks />
      </div>
      <OfisenseCredit />
    </footer>
  );
}
