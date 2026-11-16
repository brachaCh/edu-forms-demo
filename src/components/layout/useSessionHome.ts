"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import {
  isAuthenticatedAppPath,
  logoHomeHref,
  shouldShowInstitutionProfileBack,
  sidebarHomeHref,
} from "@/lib/auth-navigation";
import { LOGGED_IN_HOME_HREF } from "@/lib/navigation-back";
import { subscribeAuthSessionChanged } from "@/lib/auth-session-events";
import { getUser } from "@/lib/mock-store";
import type { UserProfile } from "@/lib/supabase/types";

type HomeProfile = Pick<
  UserProfile,
  "setup_completed_at" | "institution_type" | "education_framework"
>;

let cachedUser: UserProfile | null = null;

function sameHomeProfile(
  a: HomeProfile | null,
  b: HomeProfile | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.setup_completed_at === b.setup_completed_at &&
    a.institution_type === b.institution_type &&
    a.education_framework === b.education_framework
  );
}

function getUserSnapshot(): UserProfile | null {
  const next = getUser();
  if (sameHomeProfile(cachedUser, next)) return cachedUser;
  cachedUser = next;
  return cachedUser;
}

function getServerUserSnapshot(): UserProfile | null {
  return null;
}

export function useSessionHome() {
  const pathname = usePathname() ?? "/";
  const { guestDemo } = useDataStore();
  const user = useSyncExternalStore(
    subscribeAuthSessionChanged,
    getUserSnapshot,
    getServerUserSnapshot
  );

  const loggedIn = Boolean(user) && !guestDemo;
  const onAppInterior = isAuthenticatedAppPath(pathname);
  const treatAsLoggedIn = loggedIn || (onAppInterior && !guestDemo);
  const homeHref = loggedIn
    ? sidebarHomeHref({ loggedIn: true, profile: user })
    : treatAsLoggedIn
      ? LOGGED_IN_HOME_HREF
      : sidebarHomeHref({ loggedIn: false, profile: user });
  const logoHref = logoHomeHref({ loggedIn, profile: user });
  const showInstitutionProfileBack = shouldShowInstitutionProfileBack({
    loggedIn: treatAsLoggedIn,
    pathname,
    profileHref: homeHref,
    guestDemo,
  });

  return {
    user,
    guestDemo,
    loggedIn,
    homeHref,
    logoHref,
    showInstitutionProfileBack,
  };
}
