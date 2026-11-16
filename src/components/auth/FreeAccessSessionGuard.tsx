"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { clearUser } from "@/lib/mock-store";
import {
  endFreeAccessSession,
  FREE_ACCESS_EXPIRED_MESSAGE,
  FREE_ACCESS_KEY,
  getFreeAccessRemainingMs,
  isFreeAccessMode,
  isFreeAccessSessionExpired,
  markFreeAccessWelcomeShown,
  shouldShowFreeAccessWelcome,
  subscribeFreeAccessMode,
} from "@/lib/free-access";

export function FreeAccessSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { texts } = useSiteText();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [expiredOpen, setExpiredOpen] = useState(false);
  const [active, setActive] = useState(false);

  const finishExpiredSession = useCallback(() => {
    endFreeAccessSession();
    clearUser();
    setWelcomeOpen(false);
    setActive(false);
    setExpiredOpen(true);
  }, []);

  useEffect(() => {
    const sync = () => {
      setActive(isFreeAccessMode());
      if (shouldShowFreeAccessWelcome()) {
        setWelcomeOpen(true);
      }
    };
    sync();
    return subscribeFreeAccessMode(sync);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (typeof window === "undefined") return;
      try {
        const keyActive = window.localStorage.getItem(FREE_ACCESS_KEY) === "1";
        if (!keyActive) return;
      } catch {
        return;
      }

      if (isFreeAccessSessionExpired() || getFreeAccessRemainingMs() <= 0) {
        finishExpiredSession();
        return;
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [finishExpiredSession, pathname]);

  function dismissWelcome() {
    markFreeAccessWelcomeShown();
    setWelcomeOpen(false);
  }

  function leaveAfterExpiry() {
    setExpiredOpen(false);
    router.replace("/");
  }

  // אם כבר לא במצב כניסה חופשית — אל תציג welcome
  const showWelcome = welcomeOpen && isFreeAccessMode();
  const showBanner = active && isFreeAccessMode();

  return (
    <>
      {showBanner ? (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-950"
        >
          <EditableText path="landing.guestWaiverNotice" as="span" />
        </div>
      ) : null}

      <Dialog
        open={showWelcome}
        onOpenChange={(open) => {
          if (!open) dismissWelcome();
        }}
      >
        <DialogContent className="text-right">
          <DialogHeader>
            <DialogTitle>
              <EditableText path="landing.guestWelcomeTitle" />
            </DialogTitle>
            <DialogDescription className="text-base text-ink">
              <EditableText path="landing.guestWelcomeBody" />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={dismissWelcome}>
              {getTextByPath(texts, "landing.guestWelcomeConfirm") || "יאללה, מתחילים"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={expiredOpen}
        onOpenChange={(open) => {
          if (!open) leaveAfterExpiry();
        }}
      >
        <DialogContent className="text-right">
          <DialogHeader>
            <DialogTitle>
              <EditableText path="landing.guestExpiredTitle" />
            </DialogTitle>
            <DialogDescription className="text-base text-ink">
              {getTextByPath(texts, "landing.guestExpiredBody") ||
                FREE_ACCESS_EXPIRED_MESSAGE}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={leaveAfterExpiry}>
              {getTextByPath(texts, "landing.guestExpiredConfirm") || "חזרה לדף הבית"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
