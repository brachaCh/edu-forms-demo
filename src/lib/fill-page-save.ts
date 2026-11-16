/**
 * Shared in-flight save tracker for fill-page autosave and manual save.
 * leaveFillPage waits on this so «חזרה» cannot restore an older draft over a
 * newer saved fill (TZ-72).
 */

export const LEAVE_FILL_SAVE_WAIT_MS = 3000;
export const LEAVE_FILL_SAVE_POLL_MS = 150;

export type FillSaveKind = "autosave" | "manual";
export type FillSaveStatus = "draft" | "saved" | "completed";

export type FillSaveToken = {
  id: number;
  kind: FillSaveKind;
};

export type CommittedFillSave = {
  id: number;
  json: string;
  status: FillSaveStatus;
};

export type FillSaveTracker = {
  isBusy: () => boolean;
  hasKind: (kind: FillSaveKind) => boolean;
  begin: (kind: FillSaveKind) => FillSaveToken;
  end: (token: FillSaveToken) => void;
  markCommitted: (
    token: FillSaveToken,
    record: { json: string; status: FillSaveStatus }
  ) => void;
  lastCommitted: () => CommittedFillSave | null;
  shouldCommitDraft: (token: FillSaveToken, draftJson: string) => boolean;
  run: <T>(
    kind: FillSaveKind,
    fn: (token: FillSaveToken) => Promise<T>
  ) => Promise<T>;
};

export function createFillSaveTracker(): FillSaveTracker {
  let nextId = 0;
  let depth = 0;
  const active = new Map<number, FillSaveKind>();
  let lastCommitted: CommittedFillSave | null = null;

  function begin(kind: FillSaveKind): FillSaveToken {
    const id = ++nextId;
    depth += 1;
    active.set(id, kind);
    return { id, kind };
  }

  function end(token: FillSaveToken): void {
    if (!active.has(token.id)) return;
    active.delete(token.id);
    depth = Math.max(0, depth - 1);
  }

  function hasKind(kind: FillSaveKind): boolean {
    for (const activeKind of active.values()) {
      if (activeKind === kind) return true;
    }
    return false;
  }

  function markCommitted(
    token: FillSaveToken,
    record: { json: string; status: FillSaveStatus }
  ): void {
    lastCommitted = { id: token.id, json: record.json, status: record.status };
  }

  function shouldCommitDraft(token: FillSaveToken, draftJson: string): boolean {
    if (hasKind("manual")) return false;
    if (!lastCommitted) return true;
    if (lastCommitted.id > token.id && lastCommitted.status === "completed") {
      return false;
    }
    if (
      lastCommitted.status === "completed" &&
      lastCommitted.json !== draftJson &&
      lastCommitted.id >= token.id
    ) {
      return false;
    }
    return true;
  }

  async function run<T>(
    kind: FillSaveKind,
    fn: (token: FillSaveToken) => Promise<T>
  ): Promise<T> {
    const token = begin(kind);
    try {
      return await fn(token);
    } finally {
      end(token);
    }
  }

  return {
    isBusy: () => depth > 0,
    hasKind,
    begin,
    end,
    markCommitted,
    lastCommitted: () => lastCommitted,
    shouldCommitDraft,
    run,
  };
}

export async function waitForInFlightFillSave(
  isBusy: () => boolean,
  options?: {
    timeoutMs?: number;
    pollMs?: number;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<{ timedOut: boolean }> {
  const timeoutMs = options?.timeoutMs ?? LEAVE_FILL_SAVE_WAIT_MS;
  const pollMs = options?.pollMs ?? LEAVE_FILL_SAVE_POLL_MS;
  const sleep =
    options?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let waited = 0;
  while (isBusy() && waited < timeoutMs) {
    await sleep(pollMs);
    waited += pollMs;
  }
  return { timedOut: isBusy() };
}

/**
 * After waiting for an in-flight save, decide whether leaveFillPage should
 * write a draft. Never overwrite a newer completed fill with older data.
 */
export function shouldPersistDraftOnLeave(options: {
  currentJson: string;
  lastSavedJson: string | null;
  lastSavedStatus?: FillSaveStatus | null;
  saveInFlight?: boolean;
  committedBefore?: CommittedFillSave | null;
  committedAfter?: CommittedFillSave | null;
}): boolean {
  if (options.saveInFlight) return false;
  if (options.lastSavedJson == null) return false;
  if (options.currentJson === options.lastSavedJson) return false;

  const after = options.committedAfter ?? null;
  const before = options.committedBefore ?? null;
  if (after?.status === "completed") {
    if (after.json === options.currentJson) return false;
    if (before && after.id !== before.id && options.currentJson === before.json) {
      return false;
    }
  }
  if (options.lastSavedStatus === "completed" && after?.json === options.currentJson) {
    return false;
  }
  return true;
}

/**
 * After a save completes, update the last-saved baseline to what was written
 * but keep any keystrokes that landed in dataRef while the save was in flight.
 */
export function resolveFillSaveLocalState(options: {
  submittedJson: string;
  savedJson: string;
  currentJson: string;
}): { dataRefJson: string; lastSavedJson: string; dirty: boolean } {
  const lastSavedJson = options.savedJson;
  const dataRefJson =
    options.currentJson !== options.submittedJson
      ? options.currentJson
      : options.savedJson;
  return {
    dataRefJson,
    lastSavedJson,
    dirty: dataRefJson !== lastSavedJson,
  };
}

/** Keep fields the user changed after submit; take everything else from saved. */
export function mergeSavedFillIntoCurrentData(
  current: Record<string, string>,
  submitted: Record<string, string>,
  saved: Record<string, string>
): Record<string, string> {
  const keys = new Set([
    ...Object.keys(saved),
    ...Object.keys(current),
    ...Object.keys(submitted),
  ]);
  const next: Record<string, string> = { ...saved };
  for (const key of keys) {
    if ((current[key] ?? "") !== (submitted[key] ?? "")) {
      next[key] = current[key] ?? "";
    }
  }
  return next;
}

export async function leaveFillPageAfterSaves(options: {
  isBusy: () => boolean;
  currentJson: () => string;
  lastSavedJson: () => string | null;
  lastSavedStatus?: () => FillSaveStatus | null;
  lastCommitted?: () => CommittedFillSave | null;
  persistDraft: (json: string) => Promise<boolean>;
  confirmLeaveUnsaved?: () => boolean;
  timeoutMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<"navigate" | "stay"> {
  const lastSaved = options.lastSavedJson();
  const dirty = lastSaved != null && options.currentJson() !== lastSaved;
  if (!dirty) return "navigate";

  const committedBefore = options.lastCommitted?.() ?? null;
  await waitForInFlightFillSave(options.isBusy, options);

  const currentJson = options.currentJson();
  const lastSavedJson = options.lastSavedJson();
  const lastSavedStatus = options.lastSavedStatus?.() ?? null;
  const committedAfter = options.lastCommitted?.() ?? committedBefore;

  if (
    !shouldPersistDraftOnLeave({
      currentJson,
      lastSavedJson,
      lastSavedStatus,
      saveInFlight: options.isBusy(),
      committedBefore,
      committedAfter,
    })
  ) {
    return "navigate";
  }

  const saved = await options.persistDraft(currentJson);
  if (!saved && options.confirmLeaveUnsaved && !options.confirmLeaveUnsaved()) {
    return "stay";
  }
  return "navigate";
}
