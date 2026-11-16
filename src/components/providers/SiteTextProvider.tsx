"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyDemoBranding,
  getDefaultSiteTextsForMode,
} from "@/lib/demo-branding";
import {
  applyStudentFieldCaptionEdit,
  applyTextPatch,
  clearSectorOverridesForPath,
  getSiteTexts,
  getSiteTextsUpdatedAt,
  saveSiteTexts,
  type SiteTexts,
} from "@/lib/site-text";
import {
  clearSiteTextsEverywhere,
  loadSiteTexts,
  persistSiteTexts,
} from "@/lib/site-text-store";

interface SiteTextContextValue {
  texts: SiteTexts;
  updateTexts: (texts: SiteTexts) => void;
  updateText: (path: string, value: string, alsoPaths?: string[]) => void;
  resetToDefaults: () => void;
  reloadTexts: () => Promise<void>;
  dismissSyncError: () => void;
  ready: boolean;
  syncing: boolean;
  syncError: string | null;
}

const SiteTextContext = createContext<SiteTextContextValue | null>(null);

export function SiteTextProvider({ children }: { children: React.ReactNode }) {
  const [texts, setTexts] = useState<SiteTexts>(getDefaultSiteTextsForMode());
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const pendingPersistRef = useRef<SiteTexts | null>(null);
  const persistRunningRef = useRef(false);

  const reloadTexts = useCallback(async () => {
    const startedAt = getSiteTextsUpdatedAt() ?? 0;
    try {
      const loaded = applyDemoBranding(await loadSiteTexts());
      // Don't clobber a newer local edit that landed while loading.
      const nowAt = getSiteTextsUpdatedAt() ?? 0;
      if (nowAt > startedAt) {
        setTexts(applyDemoBranding(getSiteTexts()));
      } else {
        setTexts(loaded);
      }
      setSyncError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "שגיאה בטעינת טקסטים";
      console.error("[SiteTextProvider] load failed:", error);
      setSyncError(message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reloadTexts();
  }, [reloadTexts]);

  // כשחוזרים לחלון — מושכים מהמערכת כדי לקבל שינויים שנעשו במקום אחר
  useEffect(() => {
    let timer: number | null = null;
    function scheduleReload() {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void reloadTexts();
      }, 1500);
    }
    function onFocus() {
      scheduleReload();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        scheduleReload();
      }
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reloadTexts]);

  const persistWithFeedback = useCallback((next: SiteTexts) => {
    // Keep the newest edit locally immediately, then serialize remote writes so
    // an older, slower request can never overwrite a newer text.
    saveSiteTexts(next);
    pendingPersistRef.current = next;
    if (persistRunningRef.current) return;

    persistRunningRef.current = true;
    setSyncing(true);
    setSyncError(null);

    void (async () => {
      try {
        while (pendingPersistRef.current) {
          const current = pendingPersistRef.current;
          pendingPersistRef.current = null;
          await persistSiteTexts(current);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "שגיאה בסנכרון טקסטים";
        console.error("[SiteTextProvider] persist failed:", error);
        setSyncError(message);
      } finally {
        persistRunningRef.current = false;
        setSyncing(false);

        // An edit may have arrived between the loop ending and cleanup.
        if (pendingPersistRef.current) {
          persistWithFeedback(pendingPersistRef.current);
        }
      }
    })();
  }, []);

  const updateTexts = useCallback(
    (next: SiteTexts) => {
      setTexts(next);
      void persistWithFeedback(next);
    },
    [persistWithFeedback]
  );

  const updateText = useCallback(
    (path: string, value: string, _alsoPaths?: string[]) => {
      setTexts((prev) => {
        // שינוי כיתוב לא תואם (ת. לידה→טלפון וכו') מועבר לשדה הנכון
        const redirected = applyStudentFieldCaptionEdit(prev, path, value);
        let next: SiteTexts;
        if (redirected.texts !== prev) {
          next = redirected.texts;
        } else {
          next = applyTextPatch(prev, redirected.path, redirected.value);
          next = clearSectorOverridesForPath(next, redirected.path);
        }
        queueMicrotask(() => persistWithFeedback(next));
        return next;
      });
    },
    [persistWithFeedback]
  );

  const resetToDefaults = useCallback(() => {
    setTexts(getDefaultSiteTextsForMode());
    setSyncing(true);
    setSyncError(null);
    void clearSiteTextsEverywhere()
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "שגיאה באיפוס טקסטים";
        console.error("[SiteTextProvider] reset failed:", error);
        setSyncError(message);
      })
      .finally(() => setSyncing(false));
  }, []);

  const dismissSyncError = useCallback(() => setSyncError(null), []);

  const value = useMemo(
    () => ({
      texts,
      updateTexts,
      updateText,
      resetToDefaults,
      reloadTexts,
      dismissSyncError,
      ready,
      syncing,
      syncError,
    }),
    [
      texts,
      updateTexts,
      updateText,
      resetToDefaults,
      reloadTexts,
      dismissSyncError,
      ready,
      syncing,
      syncError,
    ]
  );

  return (
    <SiteTextContext.Provider value={value}>
      {children}
      {syncError && (
        <div
          role="alert"
          className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-lg rounded-xl border border-destructive/40 bg-white px-4 py-3 text-sm text-destructive shadow-lg sm:left-auto"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">סנכרון הטקסטים נכשל</div>
              <div className="mt-1 text-xs opacity-90">{syncError}</div>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs font-medium underline"
              onClick={dismissSyncError}
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </SiteTextContext.Provider>
  );
}

export function useSiteText() {
  const ctx = useContext(SiteTextContext);
  if (!ctx) {
    throw new Error("useSiteText must be used within SiteTextProvider");
  }
  return ctx;
}
