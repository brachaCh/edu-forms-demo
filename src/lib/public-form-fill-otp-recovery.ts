/**
 * TZ-94: keep typed public-fill values when OTP expires mid-save.
 *
 * Recovery lives in memory. sessionStorage is token-scoped, used only so a
 * refresh during the OTP gate does not drop typed fields, and is cleared after
 * a successful re-verify merge. This never bypasses OTP.
 *
 * Autosave must not overwrite a parked manual draft/submit. Incoming `data`
 * is the latest in-memory snapshot at park time.
 */

export type PublicFormPendingAction = "draft" | "submit";

export type PublicFormOtpRecovery = {
  data: Record<string, string>;
  pendingAction: PublicFormPendingAction | null;
  retryUsed: boolean;
};

export type PublicFormSaveResult = { ok: boolean; error?: string };

export const PUBLIC_FORM_OTP_RECOVERY_STORAGE_PREFIX = "form-fill-otp-recovery:";

export function publicFormOtpRecoveryStorageKey(token: string): string {
  return `${PUBLIC_FORM_OTP_RECOVERY_STORAGE_PREFIX}${token}`;
}

export function createPublicFormOtpRecovery(input: {
  data: Record<string, string>;
  pendingAction?: PublicFormPendingAction | null;
}): PublicFormOtpRecovery {
  return {
    data: { ...input.data },
    pendingAction: input.pendingAction ?? null,
    retryUsed: false,
  };
}

export function pendingActionRank(
  action: PublicFormPendingAction | null | undefined
): number {
  if (action === "submit") return 2;
  if (action === "draft") return 1;
  return 0;
}

/**
 * Merge two parks. A later autosave (no pending action) cannot replace a
 * parked draft/submit. Incoming `data` is the latest in-memory snapshot at
 * park time and always wins over older parked values.
 */
export function mergeParkedPublicFormOtpRecovery(
  existing: PublicFormOtpRecovery | null,
  incoming: {
    data: Record<string, string>;
    pendingAction?: PublicFormPendingAction | null;
  }
): PublicFormOtpRecovery {
  if (!existing) {
    return createPublicFormOtpRecovery(incoming);
  }
  const incomingAction = incoming.pendingAction ?? null;
  const keepExistingAction =
    pendingActionRank(existing.pendingAction) > pendingActionRank(incomingAction);
  const pendingAction = keepExistingAction
    ? existing.pendingAction
    : incomingAction;
  const data = { ...existing.data, ...incoming.data };
  return createPublicFormOtpRecovery({ data, pendingAction });
}

/** Local typed values win; server keeps keys the user never sent. */
export function mergeLocalFillOverServer(
  serverData: Record<string, string>,
  localData: Record<string, string> | null | undefined
): Record<string, string> {
  if (!localData) return { ...serverData };
  return { ...serverData, ...localData };
}

/** Consume the parked save/submit exactly once after re-verification. */
export function takePendingActionOnce(
  recovery: PublicFormOtpRecovery | null
): PublicFormPendingAction | null {
  if (!recovery || recovery.retryUsed || !recovery.pendingAction) return null;
  recovery.retryUsed = true;
  const action = recovery.pendingAction;
  recovery.pendingAction = null;
  return action;
}

export function applyStoredLocalFill(input: {
  serverData: Record<string, string>;
  recovery: PublicFormOtpRecovery | null;
}): {
  data: Record<string, string>;
  pendingAction: PublicFormPendingAction | null;
} {
  const pendingAction =
    input.recovery && !input.recovery.retryUsed
      ? input.recovery.pendingAction
      : null;
  return {
    data: mergeLocalFillOverServer(input.serverData, input.recovery?.data),
    pendingAction,
  };
}

export async function retryPendingPublicFormSaveOnce(options: {
  serverData: Record<string, string>;
  recovery: PublicFormOtpRecovery | null;
  save: (
    data: Record<string, string>,
    complete: boolean
  ) => Promise<PublicFormSaveResult>;
}): Promise<{
  data: Record<string, string>;
  retried: boolean;
  saveResult: PublicFormSaveResult | null;
}> {
  const applied = applyStoredLocalFill({
    serverData: options.serverData,
    recovery: options.recovery,
  });
  const action = takePendingActionOnce(options.recovery);
  if (!action) {
    return {
      data: applied.data,
      retried: false,
      saveResult: null,
    };
  }
  const saveResult = await options.save(applied.data, action === "submit");
  return {
    data: applied.data,
    retried: true,
    saveResult,
  };
}

type StoredRecovery = {
  data: Record<string, string>;
  pendingAction: PublicFormPendingAction | null;
};

function isPendingAction(value: unknown): value is PublicFormPendingAction {
  return value === "draft" || value === "submit";
}

function getDefaultStorage(): Storage | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

export function persistPublicFormOtpRecovery(
  token: string,
  recovery: PublicFormOtpRecovery,
  storage: Storage | null = getDefaultStorage()
): void {
  if (!storage || !token) return;
  const stored: StoredRecovery = {
    data: recovery.data,
    pendingAction: recovery.pendingAction,
  };
  try {
    storage.setItem(publicFormOtpRecoveryStorageKey(token), JSON.stringify(stored));
  } catch {
    // Quota / private mode — in-memory recovery is enough for the same tab.
  }
}

export function readPublicFormOtpRecovery(
  token: string,
  storage: Storage | null = getDefaultStorage()
): PublicFormOtpRecovery | null {
  if (!storage || !token) return null;
  try {
    const raw = storage.getItem(publicFormOtpRecoveryStorageKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRecovery;
    if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
    if (typeof parsed.data !== "object" || Array.isArray(parsed.data)) return null;
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (typeof value === "string") data[key] = value;
    }
    return createPublicFormOtpRecovery({
      data,
      pendingAction: isPendingAction(parsed.pendingAction)
        ? parsed.pendingAction
        : null,
    });
  } catch {
    return null;
  }
}

export function clearPublicFormOtpRecovery(
  token: string,
  storage: Storage | null = getDefaultStorage()
): void {
  if (!storage || !token) return;
  try {
    storage.removeItem(publicFormOtpRecoveryStorageKey(token));
  } catch {
    // ignore
  }
}
