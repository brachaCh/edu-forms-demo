"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { shouldPromptLoginAfterSessionCheck } from "@/lib/auth-navigation";
import {
  getPersonalAreaGateHref,
  isBillingExemptProfile,
} from "@/lib/billing-access";
import {
  establishGuestDemoSession,
  getFreeAccessEmail,
  isFreeAccessMode,
} from "@/lib/free-access";
import { cacheAuthenticatedUser, getUser } from "@/lib/mock-store";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import type { UserProfile } from "@/lib/supabase/types";

async function loadSessionUser(): Promise<{
  profile: UserProfile | null;
  sumitConfigured: boolean;
  isPlatformAdmin: boolean;
  failed: boolean;
}> {
  try {
    const response = await fetch("/api/auth/session");
    if (!response.ok) {
      return {
        profile: null,
        sumitConfigured: true,
        isPlatformAdmin: false,
        failed: true,
      };
    }
    const data = (await response.json()) as {
      profile: UserProfile | null;
      sumitConfigured?: boolean;
      isPlatformAdmin?: boolean;
    };
    return {
      profile: data.profile,
      sumitConfigured: data.sumitConfigured !== false,
      isPlatformAdmin: data.isPlatformAdmin === true,
      failed: false,
    };
  } catch {
    return {
      profile: null,
      sumitConfigured: true,
      isPlatformAdmin: false,
      failed: true,
    };
  }
}

export function PersonalAreaBillingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { guestDemo } = useDataStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let { profile: user, sumitConfigured, isPlatformAdmin, failed } =
        await loadSessionUser();
      if (cancelled) return;

      if (!user && (guestDemo || isFreeAccessMode())) {
        const opened = await establishGuestDemoSession(getFreeAccessEmail());
        if (opened) {
          const retry = await loadSessionUser();
          user = retry.profile;
          sumitConfigured = retry.sumitConfigured;
          isPlatformAdmin = retry.isPlatformAdmin;
          failed = retry.failed;
        }
      }
      if (cancelled) return;

      if (!user) {
        const cached = getUser();
        if (
          shouldPromptLoginAfterSessionCheck({
            sessionProfile: user,
            sessionCheckFailed: failed,
            cachedProfile: cached,
          })
        ) {
          router.replace("/login");
          return;
        }
        user = cached;
      }
      if (!user) {
        router.replace("/login");
        return;
      }

      cacheAuthenticatedUser(user);

      const billingExempt =
        guestDemo ||
        isFreeAccessMode() ||
        isPlatformAdmin ||
        isBillingExemptProfile(user);
      const gateHref = getPersonalAreaGateHref(user, pathname, {
        billingExempt,
        paymentRequired: sumitConfigured,
        isPlatformAdmin,
      });

      if (gateHref && gateHref !== pathname) {
        router.replace(gateHref);
        return;
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [guestDemo, pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-pink">
        טוען...
      </div>
    );
  }

  return children;
}
