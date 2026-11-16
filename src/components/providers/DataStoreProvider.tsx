"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  getDataCache,
  initDataCache,
  setStudentsInCache,
  subscribeDataCache,
} from "@/lib/data-cache";
import {
  isFreeAccessMode,
  subscribeFreeAccessMode,
} from "@/lib/free-access";
import { subscribeAuthSessionChanged } from "@/lib/auth-session-events";
import { ensureDemoDataSeeded } from "@/lib/demo-seed";
import { canUseSupabase, fetchStudents } from "@/lib/supabase-db";
import {
  cacheAuthenticatedUser,
  discardCachedUser,
  getStudents,
  getUser,
  setCanManageStudents,
  setCanAssignTeachers,
} from "@/lib/mock-store";
import type { UserProfile } from "@/lib/supabase/types";
import { syncAssociationLogoFromProfile } from "@/lib/document-branding";
import { sweepExpiredPrintHandoffs } from "@/lib/detached-print";

interface DataStoreContextValue {
  ready: boolean;
  loading: boolean;
  error: string | null;
  usingSupabase: boolean;
  guestDemo: boolean;
  refresh: () => Promise<void>;
}

const DataStoreContext = createContext<DataStoreContextValue>({
  ready: true,
  loading: false,
  error: null,
  usingSupabase: false,
  guestDemo: false,
  refresh: async () => {},
});

function getFreeAccessSnapshot(): boolean {
  return isFreeAccessMode();
}

function getFreeAccessServerSnapshot(): boolean {
  return false;
}

async function syncSessionProfile(): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/auth/session");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      profile?: UserProfile | null;
      canManageStudents?: boolean;
      canAssignTeachers?: boolean;
    };
    if (!data?.profile) {
      discardCachedUser();
      return null;
    }
    const current = getUser();
    if (
      !current ||
      current.id !== data.profile.id ||
      current.institution_id !== data.profile.institution_id
    ) {
      cacheAuthenticatedUser(data.profile);
      syncAssociationLogoFromProfile({
        institutionId: data.profile.institution_id,
        institutionCode: data.profile.institution_code,
        institutionLogoUrl: data.profile.institution_logo_url,
      });
    }
    // TZ-28: Cache whether user can manage students
    if (typeof data.canManageStudents === "boolean") {
      setCanManageStudents(data.canManageStudents);
    }
    // TZ-32: Cache whether user can assign students to teachers
    if (typeof data.canAssignTeachers === "boolean") {
      setCanAssignTeachers(data.canAssignTeachers);
    }
    return data.profile;
  } catch {
    return null;
  }
}

export function DataStoreProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    subscribeDataCache,
    getDataCache,
    () => getDataCache()
  );
  const guestDemo = useSyncExternalStore(
    subscribeFreeAccessMode,
    getFreeAccessSnapshot,
    getFreeAccessServerSnapshot
  );

  const hydrate = useCallback(async (force = false) => {
    ensureDemoDataSeeded();
    if (!canUseSupabase()) {
      setStudentsInCache(getStudents());
      return;
    }
    const profile = await syncSessionProfile();
    const institutionId = profile?.institution_id ?? null;
    if (!institutionId) {
      await initDataCache({ force, institutionId: null });
      return;
    }
    const studentsPromise = fetchStudents(institutionId);
    studentsPromise.catch(() => {
      // initDataCache מטפל בשגיאה
    });
    await initDataCache({ force, institutionId, studentsPromise });
  }, []);

  useEffect(() => {
    void sweepExpiredPrintHandoffs();
    void hydrate(false);
    return subscribeAuthSessionChanged(() => {
      void hydrate(true);
    });
  }, [hydrate]);

  // סנכרון בין מורות באותו מוסד — רענון שקט ברקע
  useEffect(() => {
    if (guestDemo || isFreeAccessMode()) return;

    let busy = false;
    async function softRefresh() {
      if (busy || document.visibilityState !== "visible") return;
      if (!canUseSupabase()) return;
      busy = true;
      try {
        const institutionId = getUser()?.institution_id ?? null;
        if (!institutionId) return;
        const studentsPromise = fetchStudents(institutionId);
        studentsPromise.catch(() => {});
        await initDataCache({
          force: true,
          quiet: true,
          institutionId,
          studentsPromise,
        });
      } finally {
        busy = false;
      }
    }

    function onFocus() {
      void softRefresh();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void softRefresh();
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(() => {
      void softRefresh();
    }, 20_000);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [guestDemo]);

  useEffect(() => {
    if (!guestDemo) return;
    ensureDemoDataSeeded();
    if (!canUseSupabase()) {
      setStudentsInCache(getStudents());
    }
  }, [guestDemo]);

  const refresh = useCallback(async () => {
    ensureDemoDataSeeded();
    if (!canUseSupabase()) {
      setStudentsInCache(getStudents());
      return;
    }
    const profile = await syncSessionProfile();
    const institutionId = profile?.institution_id ?? null;
    if (!institutionId) {
      await initDataCache({
        force: true,
        invalidateNested: true,
        institutionId: null,
      });
      return;
    }
    const studentsPromise = fetchStudents(institutionId);
    studentsPromise.catch(() => {});
    await initDataCache({
      force: true,
      invalidateNested: true,
      institutionId,
      studentsPromise,
    });
  }, []);

  return (
    <DataStoreContext.Provider
      value={{
        ready: state.ready,
        loading: state.loading,
        error: state.error,
        usingSupabase: canUseSupabase(),
        guestDemo,
        refresh,
      }}
    >
      {state.error ? (
        <div className="sticky top-0 z-50 border-b border-brand-200 bg-white px-4 py-2 text-center text-sm text-pink shadow-sm">
          <span className="me-3">{state.error}</span>
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => void refresh()}
            disabled={state.loading}
          >
            נסה שוב
          </button>
        </div>
      ) : null}
      {children}
    </DataStoreContext.Provider>
  );
}

export function useDataStore() {
  return useContext(DataStoreContext);
}
