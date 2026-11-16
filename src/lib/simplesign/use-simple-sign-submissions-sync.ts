"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import { loadStudentFormFillById } from "@/lib/mock-store";
import { getSimpleSignFormConfig } from "@/lib/simplesign/config";
import { shouldPollSimpleSignSync } from "@/lib/simplesign/sync-policy";
import {
  loadSimpleSignSubmissions,
  type SimpleSignSubmissionStatus,
} from "@/lib/simplesign-signature-request";

export const SIMPLE_SIGN_SYNC_POLL_MS = 12_000;

/**
 * React bails out of a re-render when the updater returns the same reference.
 * Always passing `[]` would allocate a new array and loop with any memo that
 * depends on submissions.
 */
export function idleSimpleSignSubmissions<T>(prev: T[]): T[] {
  return prev.length === 0 ? prev : [];
}

/**
 * Same gate main used: poll while any row is pending, or signed without a
 * stored PDF. Main did **not** keep polling after that — it called
 * `shouldPollSimpleSignSync` and cleared the interval when it returned false.
 */
export function hasPendingSimpleSignSubmission(
  submissions: Array<{ status: string; signedPdfStored?: boolean }>
): boolean {
  return shouldPollSimpleSignSync(submissions);
}

export function useSimpleSignSubmissionsSync({
  activeFillId,
  formId,
  studentId,
  enabled,
  hasPendingSubmission,
  setSubmissions,
  setData,
}: {
  activeFillId: string | undefined;
  formId: string | undefined;
  studentId: string | undefined;
  enabled: boolean;
  hasPendingSubmission: boolean;
  setSubmissions: Dispatch<SetStateAction<SimpleSignSubmissionStatus[]>>;
  setData: Dispatch<SetStateAction<Record<string, string>>>;
}): { refresh: () => void } {
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!activeFillId || !formId || !studentId || !enabled) {
      setSubmissions((prev) => idleSimpleSignSubmissions(prev));
      refreshRef.current = () => {};
      return;
    }

    const fillId = activeFillId;
    const syncFormId = formId;
    const syncStudentId = studentId;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const parentFieldKeys =
      getSimpleSignFormConfig(syncFormId)?.parentSigners.map(
        (signer) => signer.signatureFieldKey
      ) ?? [];

    async function syncSimpleSign() {
      if (document.visibilityState !== "visible") return;
      const subs = await loadSimpleSignSubmissions(fillId);
      if (cancelled) return;
      if (subs.ok) setSubmissions(subs.submissions);

      const remoteFill = await loadStudentFormFillById(syncStudentId, fillId, {
        quiet: true,
      });
      if (cancelled || !remoteFill?.data) return;

      setData((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const fieldKey of parentFieldKeys) {
          const remoteVal = String(remoteFill.data[fieldKey] ?? "").trim();
          if (remoteVal && remoteVal !== String(prev[fieldKey] ?? "").trim()) {
            next[fieldKey] = remoteVal;
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      const keepPolling = shouldPollSimpleSignSync(subs.submissions);
      if (keepPolling && !timer) {
        timer = setInterval(() => void syncSimpleSign(), SIMPLE_SIGN_SYNC_POLL_MS);
      } else if (!keepPolling && timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    refreshRef.current = () => {
      void syncSimpleSign();
    };
    void syncSimpleSign();
    return () => {
      cancelled = true;
      refreshRef.current = () => {};
      if (timer) clearInterval(timer);
    };
    // hasPendingSubmission is a boolean primitive: true→false stops the
    // interval; false→true (a send on an already-saved fill) starts it.
    // Parent field lists rebuilt from submissions must not be dependencies.
  }, [
    activeFillId,
    formId,
    studentId,
    enabled,
    hasPendingSubmission,
    setSubmissions,
    setData,
  ]);

  const refresh = useCallback(() => {
    refreshRef.current();
  }, []);

  return { refresh };
}
