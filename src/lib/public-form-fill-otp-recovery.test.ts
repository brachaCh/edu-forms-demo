import { describe, expect, it, vi } from "vitest";
import {
  applyStoredLocalFill,
  clearPublicFormOtpRecovery,
  createPublicFormOtpRecovery,
  mergeLocalFillOverServer,
  mergeParkedPublicFormOtpRecovery,
  persistPublicFormOtpRecovery,
  publicFormOtpRecoveryStorageKey,
  readPublicFormOtpRecovery,
  retryPendingPublicFormSaveOnce,
  takePendingActionOnce,
} from "./public-form-fill-otp-recovery";

const TOKEN = "fill-token-test-aaaaaaaaaaaaaaaaaa";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("mergeLocalFillOverServer", () => {
  it("lets local typed values win and keeps server-only keys", () => {
    const merged = mergeLocalFillOverServer(
      { notes: "last saved", extra: "from server" },
      { notes: "typed after last save" }
    );
    expect(merged).toEqual({
      notes: "typed after last save",
      extra: "from server",
    });
  });

  it("keeps a local file-field value that was not uploaded yet", () => {
    const merged = mergeLocalFillOverServer(
      { notes: "saved" },
      { notes: "typed", attachment_ref: "local-pending-file:notes.pdf" }
    );
    expect(merged.attachment_ref).toBe("local-pending-file:notes.pdf");
    expect(merged.notes).toBe("typed");
  });
});

describe("expire during draft save", () => {
  it("parks draft values and retries the draft save once after re-verify", async () => {
    const local = { notes: "draft typed after last save" };
    const recovery = createPublicFormOtpRecovery({
      data: local,
      pendingAction: "draft",
    });
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "OTP_REQUIRED" })
      .mockResolvedValueOnce({ ok: true });

    const first = await save(local, false);
    expect(first).toEqual({ ok: false, error: "OTP_REQUIRED" });

    const retried = await retryPendingPublicFormSaveOnce({
      serverData: { notes: "last saved", extra: "from server" },
      recovery,
      save,
    });

    expect(retried.retried).toBe(true);
    expect(retried.data).toEqual({
      notes: "draft typed after last save",
      extra: "from server",
    });
    expect(retried.saveResult).toEqual({ ok: true });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(retried.data, false);

    const second = await retryPendingPublicFormSaveOnce({
      serverData: { notes: "last saved" },
      recovery,
      save,
    });
    expect(second.retried).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("expire during submit", () => {
  it("parks submit values and retries finish-and-send once after re-verify", async () => {
    const local = { notes: "submit typed after last save" };
    const recovery = createPublicFormOtpRecovery({
      data: local,
      pendingAction: "submit",
    });
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "OTP_REQUIRED" })
      .mockResolvedValueOnce({ ok: true });

    const first = await save(local, true);
    expect(first).toEqual({ ok: false, error: "OTP_REQUIRED" });

    const retried = await retryPendingPublicFormSaveOnce({
      serverData: { notes: "last saved" },
      recovery,
      save,
    });

    expect(retried.retried).toBe(true);
    expect(retried.data.notes).toBe("submit typed after last save");
    expect(save).toHaveBeenLastCalledWith(retried.data, true);
    expect(takePendingActionOnce(recovery)).toBeNull();
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("autosave must not overwrite a parked save/submit", () => {
  it("keeps a parked submit and lets the latest dataRef snapshot win", async () => {
    const parked = mergeParkedPublicFormOtpRecovery(null, {
      data: { notes: "old parked", extra: "from earlier park" },
      pendingAction: "submit",
    });
    const afterAutosave = mergeParkedPublicFormOtpRecovery(parked, {
      data: { notes: "newest typed" },
      pendingAction: null,
    });

    expect(afterAutosave.pendingAction).toBe("submit");
    expect(afterAutosave.data).toEqual({
      notes: "newest typed",
      extra: "from earlier park",
    });

    const save = vi.fn().mockResolvedValue({ ok: true });
    const retried = await retryPendingPublicFormSaveOnce({
      serverData: { notes: "last saved" },
      recovery: afterAutosave,
      save,
    });
    expect(retried.retried).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(afterAutosave.data, true);
  });

  it("keeps a parked draft when a later autosave returns OTP_REQUIRED", async () => {
    const parked = mergeParkedPublicFormOtpRecovery(null, {
      data: { notes: "old parked draft" },
      pendingAction: "draft",
    });
    const afterAutosave = mergeParkedPublicFormOtpRecovery(parked, {
      data: { notes: "newest typed" },
      pendingAction: null,
    });

    expect(afterAutosave.pendingAction).toBe("draft");
    expect(afterAutosave.data.notes).toBe("newest typed");

    const save = vi.fn().mockResolvedValue({ ok: true });
    const retried = await retryPendingPublicFormSaveOnce({
      serverData: { notes: "last saved" },
      recovery: afterAutosave,
      save,
    });
    expect(retried.retried).toBe(true);
    expect(save).toHaveBeenCalledWith(afterAutosave.data, false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("lets a later manual submit replace an earlier autosave park", () => {
    const autosavePark = mergeParkedPublicFormOtpRecovery(null, {
      data: { notes: "autosave only" },
      pendingAction: null,
    });
    const afterSubmit = mergeParkedPublicFormOtpRecovery(autosavePark, {
      data: { notes: "newest submit" },
      pendingAction: "submit",
    });
    expect(afterSubmit.pendingAction).toBe("submit");
    expect(afterSubmit.data.notes).toBe("newest submit");
  });
});

describe("values preserved + retry once", () => {
  it("does not overwrite local edits with the server-loaded snapshot", () => {
    const recovery = createPublicFormOtpRecovery({
      data: { notes: "kept locally", attachment_ref: "local-pending-file:scan.pdf" },
      pendingAction: "draft",
    });
    const applied = applyStoredLocalFill({
      serverData: { notes: "stale server", staff_note: "from server" },
      recovery,
    });
    expect(applied.data).toEqual({
      notes: "kept locally",
      staff_note: "from server",
      attachment_ref: "local-pending-file:scan.pdf",
    });
    expect(applied.pendingAction).toBe("draft");
  });

  it("scopes sessionStorage to the form token and clears it after success", () => {
    const recovery = createPublicFormOtpRecovery({
      data: { notes: "typed" },
      pendingAction: "draft",
    });
    const storage = memoryStorage();
    persistPublicFormOtpRecovery(TOKEN, recovery, storage);
    const raw = storage.getItem(publicFormOtpRecoveryStorageKey(TOKEN));
    expect(JSON.parse(raw!)).toEqual({
      data: { notes: "typed" },
      pendingAction: "draft",
    });

    const restored = readPublicFormOtpRecovery(TOKEN, storage);
    expect(restored?.data).toEqual({ notes: "typed" });
    expect(restored?.pendingAction).toBe("draft");

    clearPublicFormOtpRecovery(TOKEN, storage);
    expect(readPublicFormOtpRecovery(TOKEN, storage)).toBeNull();
  });
});
