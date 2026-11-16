"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SectorSelectCards } from "@/components/personal/SectorSelectCards";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import {
  getUser,
  patchUserSession,
  resolveInstitutionCode,
  resolveInstitutionDetails,
} from "@/lib/mock-store";
import type { UserProfile } from "@/lib/supabase/types";
import { EditableText } from "@/components/editable/EditableText";
import { shouldPromptLoginAfterSessionCheck } from "@/lib/auth-navigation";
import { institutionProfileHref } from "@/lib/personal-sector";
import {
  establishGuestDemoSession,
  getFreeAccessEmail,
  isFreeAccessMode,
} from "@/lib/free-access";

async function loadSessionUser(): Promise<{
  profile: UserProfile | null;
  isPlatformAdmin: boolean;
  failed: boolean;
}> {
  try {
    const response = await fetch("/api/auth/session");
    if (!response.ok) return { profile: null, isPlatformAdmin: false, failed: true };
    const data = (await response.json()) as {
      profile: UserProfile | null;
      isPlatformAdmin?: boolean;
    };
    return {
      profile: data.profile,
      isPlatformAdmin: data.isPlatformAdmin === true,
      failed: false,
    };
  } catch {
    return { profile: null, isPlatformAdmin: false, failed: true };
  }
}

export function PersonalAreaClient() {
  const router = useRouter();
  const { guestDemo } = useDataStore();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [institutionCode, setInstitutionCode] = useState("—");

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const freeAccess = guestDemo || isFreeAccessMode();
      let { profile: sessionUser, isPlatformAdmin, failed } =
        await loadSessionUser();
      if (cancelled) return;

      if (!sessionUser && freeAccess) {
        const opened = await establishGuestDemoSession(getFreeAccessEmail());
        if (opened) {
          const retry = await loadSessionUser();
          sessionUser = retry.profile;
          isPlatformAdmin = retry.isPlatformAdmin;
          failed = retry.failed;
        }
      }
      if (cancelled) return;

      if (!sessionUser) {
        const cached = getUser();
        if (
          shouldPromptLoginAfterSessionCheck({
            sessionProfile: sessionUser,
            sessionCheckFailed: failed,
            cachedProfile: cached,
          })
        ) {
          router.replace("/login");
          return;
        }
        sessionUser = cached;
      }
      if (!sessionUser) {
        router.replace("/login");
        return;
      }

      if (!isPlatformAdmin && !sessionUser.setup_completed_at) {
        router.replace("/personal-area/setup");
        return;
      }

      patchUserSession(sessionUser);
      setUser(sessionUser);

      try {
        const code = await resolveInstitutionCode(sessionUser);
        if (cancelled) return;
        setInstitutionCode(code);
        const details = await resolveInstitutionDetails(sessionUser);
        if (cancelled) return;
        const sessionPatch: Partial<UserProfile> = {};
        if (code !== "—" && sessionUser.institution_code !== code) {
          sessionPatch.institution_code = code;
        }
        if (
          details.institution_name &&
          details.institution_name !== sessionUser.institution_name
        ) {
          sessionPatch.institution_name = details.institution_name;
        }
        if (details.school_name && details.school_name !== sessionUser.school_name) {
          sessionPatch.school_name = details.school_name;
        }
        if (Object.keys(sessionPatch).length > 0) {
          const updated = patchUserSession(sessionPatch);
          if (updated) setUser(updated);
        }
      } catch {
        // Institution lookup failed — still continue.
      }

      if (freeAccess) {
        setReady(true);
        return;
      }

      router.replace(institutionProfileHref(sessionUser));
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [guestDemo, router]);

  if (!ready) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="personalArea.loading" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="menu-box flex shrink-0 flex-col items-center py-3 text-center">
        {user ? (
          <>
            <div className="text-base font-bold text-pink sm:text-lg">
              <EditableText path="personalArea.hello" center /> {user.full_name}
            </div>
            <div className="text-sm text-pink">
              <EditableText path="personalArea.institutionCode" center />{" "}
              {institutionCode}
            </div>
            {user.institution_name?.trim() ? (
              <div className="text-sm text-pink">
                <EditableText path="personalArea.institutionName" center />{" "}
                {user.institution_name.trim()}
              </div>
            ) : null}
            {user.school_name?.trim() ? (
              <div className="text-sm text-pink">
                <EditableText path="personalArea.schoolName" center />{" "}
                {user.school_name.trim()}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-base font-bold text-pink sm:text-lg">
            <EditableText path="personalArea.title" center />
          </div>
        )}
      </div>

      <div className="menu-box">
        <h2 className="mb-4 border-b-2 border-brand-200 pb-2 text-center text-xl font-bold text-ink">
          <EditableText
            path="personalArea.chooseSectorSubtitle"
            as="span"
            center
          />
        </h2>
        <SectorSelectCards />
      </div>
    </div>
  );
}
