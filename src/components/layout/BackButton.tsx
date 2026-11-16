"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSessionHome } from "@/components/layout/useSessionHome";
import {
  clearNavBackHref,
  consumeInAppHistory,
  hrefWithSearch,
  LOGGED_IN_HOME_HREF,
  parseSafeFromParam,
  previousInAppHistory,
  readNavBackHref,
  recordInAppHistory,
  resolveDistinctHeaderBackHref,
  sameNavLocation,
} from "@/lib/navigation-back";

interface BackButtonProps {
  className?: string;
  fallbackHref?: string;
}

function readFromParam(): string | null {
  if (typeof window === "undefined") return null;
  return parseSafeFromParam(
    new URLSearchParams(window.location.search).get("from")
  );
}

function currentHref(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  return hrefWithSearch(pathname, window.location.search);
}

export function BackButton({
  className,
  fallbackHref,
}: BackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { texts } = useSiteText();
  const { guestDemo, loggedIn, homeHref } = useSessionHome();
  const label = getTextByPath(texts, "common.back");
  const [isPending, startTransition] = useTransition();
  const [locked, setLocked] = useState(false);
  const unlockTimerRef = useRef<number | null>(null);

  const treatAsLoggedIn =
    guestDemo || loggedIn || pathname.startsWith("/personal-area");
  const loggedInHomeHref = loggedIn ? homeHref : LOGGED_IN_HOME_HREF;

  useEffect(() => {
    setLocked(false);
    if (unlockTimerRef.current != null) {
      window.clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    recordInAppHistory(currentHref(pathname));
  }, [pathname]);

  useEffect(() => {
    // ניווט ל«בית» של האזור האישי / טבלאות — מאפס יעד חזרה ישן
    if (
      pathname === "/personal-area" ||
      pathname.startsWith("/personal-area/sector-home/") ||
      pathname.startsWith("/personal-area/sector-table/")
    ) {
      clearNavBackHref();
    }
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current != null) {
        window.clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  if (pathname === "/") {
    return null;
  }

  // טבלת קטגוריות אחרי בחירת מסגרת — אין צורך בחזרה לבחירת מסגרת
  if (pathname.startsWith("/personal-area/sector-table/")) {
    return null;
  }

  function handleBack() {
    if (locked || isPending) return;

    const href = currentHref(pathname);
    const from = readFromParam();
    const target = resolveDistinctHeaderBackHref({
      pathname,
      levels: 1,
      from,
      storedFrom: readNavBackHref(),
      historyPrevious: previousInAppHistory(href),
      fallback: fallbackHref ?? (treatAsLoggedIn ? loggedInHomeHref : "/"),
      search: typeof window !== "undefined" ? window.location.search : "",
      treatAsLoggedIn,
      loggedInHomeHref,
      currentHref: href,
    });

    // רק אם כבר בבית הסופי — אחרת תמיד מנווטים (גם כשאין היסטוריה)
    if (sameNavLocation(target, href)) return;

    setLocked(true);
    if (unlockTimerRef.current != null) {
      window.clearTimeout(unlockTimerRef.current);
    }
    unlockTimerRef.current = window.setTimeout(() => {
      setLocked(false);
      unlockTimerRef.current = null;
    }, 4000);

    consumeInAppHistory(href);
    startTransition(() => {
      router.push(target);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleBack}
      disabled={locked || isPending}
      className={className}
      aria-label="חזרה לדף הקודם"
      aria-busy={locked || isPending}
    >
      <span>{label}</span>
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
