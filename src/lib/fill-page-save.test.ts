import { describe, expect, it, vi } from "vitest";
import {
  createFillSaveTracker,
  leaveFillPageAfterSaves,
  mergeSavedFillIntoCurrentData,
  resolveFillSaveLocalState,
  shouldPersistDraftOnLeave,
  waitForInFlightFillSave,
} from "./fill-page-save";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createFillSaveTracker", () => {
  it("is busy while a save runs and clears in finally after success", async () => {
    const tracker = createFillSaveTracker();
    let released = false;
    const save = tracker.run("manual", async (token) => {
      expect(tracker.isBusy()).toBe(true);
      tracker.markCommitted(token, {
        json: JSON.stringify({ a: "new" }),
        status: "completed",
      });
      released = true;
    });
    expect(tracker.isBusy()).toBe(true);
    await save;
    expect(released).toBe(true);
    expect(tracker.isBusy()).toBe(false);
  });

  it("clears in finally when the save throws so navigation cannot hang", async () => {
    const tracker = createFillSaveTracker();
    const save = tracker.run("manual", async () => {
      throw new Error("save failed");
    });
    await expect(save).rejects.toThrow("save failed");
    expect(tracker.isBusy()).toBe(false);
  });

  it("does not commit a draft over a newer completed fill", async () => {
    const tracker = createFillSaveTracker();
    const draftToken = tracker.begin("autosave");
    const manual = tracker.run("manual", async (token) => {
      tracker.markCommitted(token, {
        json: JSON.stringify({ a: "latest" }),
        status: "completed",
      });
    });
    expect(tracker.shouldCommitDraft(draftToken, JSON.stringify({ a: "old" }))).toBe(
      false
    );
    await manual;
    expect(
      tracker.shouldCommitDraft(draftToken, JSON.stringify({ a: "old" }))
    ).toBe(false);
    tracker.end(draftToken);
  });
});

describe("waitForInFlightFillSave", () => {
  it("returns once the tracker is idle", async () => {
    const tracker = createFillSaveTracker();
    const save = tracker.run("autosave", async () => {
      await delay(25);
    });
    const waited = waitForInFlightFillSave(() => tracker.isBusy(), {
      timeoutMs: 3000,
      pollMs: 10,
    });
    await save;
    await expect(waited).resolves.toEqual({ timedOut: false });
  });

  it("stops after the timeout when a save never finishes", async () => {
    const sleep = vi.fn(async () => undefined);
    let busy = true;
    const result = await waitForInFlightFillSave(() => busy, {
      timeoutMs: 300,
      pollMs: 150,
      sleep,
    });
    expect(result.timedOut).toBe(true);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe("shouldPersistDraftOnLeave", () => {
  it("does not restore a draft after a newer completed save", () => {
    expect(
      shouldPersistDraftOnLeave({
        currentJson: JSON.stringify({ a: "old" }),
        lastSavedJson: JSON.stringify({ a: "latest" }),
        lastSavedStatus: "completed",
        committedBefore: {
          id: 1,
          json: JSON.stringify({ a: "old" }),
          status: "draft",
        },
        committedAfter: {
          id: 2,
          json: JSON.stringify({ a: "latest" }),
          status: "completed",
        },
      })
    ).toBe(false);
  });

  it("does not persist while a save is still in flight after timeout", () => {
    expect(
      shouldPersistDraftOnLeave({
        currentJson: JSON.stringify({ a: "new" }),
        lastSavedJson: JSON.stringify({ a: "old" }),
        saveInFlight: true,
      })
    ).toBe(false);
  });
});

describe("leaveFillPageAfterSaves", () => {
  it("waits for an in-flight manual save and keeps the latest data (TZ-72)", async () => {
    const store = { status: "draft", data: { note: "old" } };
    const tracker = createFillSaveTracker();
    let lastSavedJson = JSON.stringify({ note: "old" });
    let currentJson = JSON.stringify({ note: "latest" });
    const persistCalls: string[] = [];

    const manual = tracker.run("manual", async (token) => {
      await delay(40);
      store.status = "completed";
      store.data = { note: "latest" };
      lastSavedJson = JSON.stringify({ note: "latest" });
      currentJson = lastSavedJson;
      tracker.markCommitted(token, {
        json: lastSavedJson,
        status: "completed",
      });
    });

    const result = await leaveFillPageAfterSaves({
      isBusy: () => tracker.isBusy(),
      currentJson: () => currentJson,
      lastSavedJson: () => lastSavedJson,
      lastSavedStatus: () => tracker.lastCommitted()?.status ?? "draft",
      lastCommitted: () => tracker.lastCommitted(),
      persistDraft: async (json) => {
        persistCalls.push(json);
        store.status = "draft";
        store.data = JSON.parse(json) as { note: string };
        return true;
      },
      timeoutMs: 3000,
      pollMs: 10,
    });

    await manual;
    expect(result).toBe("navigate");
    expect(persistCalls).toEqual([]);
    expect(store.status).toBe("completed");
    expect(store.data).toEqual({ note: "latest" });
  });

  it("waits for an in-flight autosave and then navigates with the saved draft", async () => {
    const store = { status: "draft", data: { note: "old" } };
    const tracker = createFillSaveTracker();
    let lastSavedJson = JSON.stringify({ note: "old" });
    let currentJson = JSON.stringify({ note: "typed" });
    const persistCalls: string[] = [];

    const autosave = tracker.run("autosave", async (token) => {
      await delay(40);
      store.data = { note: "typed" };
      lastSavedJson = JSON.stringify({ note: "typed" });
      currentJson = lastSavedJson;
      tracker.markCommitted(token, {
        json: lastSavedJson,
        status: "draft",
      });
    });

    const result = await leaveFillPageAfterSaves({
      isBusy: () => tracker.isBusy(),
      currentJson: () => currentJson,
      lastSavedJson: () => lastSavedJson,
      lastSavedStatus: () => tracker.lastCommitted()?.status ?? "draft",
      lastCommitted: () => tracker.lastCommitted(),
      persistDraft: async (json) => {
        persistCalls.push(json);
        store.data = JSON.parse(json) as { note: string };
        return true;
      },
      timeoutMs: 3000,
      pollMs: 10,
    });

    await autosave;
    expect(result).toBe("navigate");
    expect(persistCalls).toEqual([]);
    expect(store.data).toEqual({ note: "typed" });
  });

  it("does not hang navigation when the in-flight save fails", async () => {
    const tracker = createFillSaveTracker();
    const lastSavedJson = JSON.stringify({ note: "old" });
    const currentJson = JSON.stringify({ note: "typed" });
    let persistCalls = 0;

    const failed = tracker
      .run("manual", async () => {
        await delay(20);
        throw new Error("save failed");
      })
      .catch(() => undefined);

    const started = Date.now();
    const result = await leaveFillPageAfterSaves({
      isBusy: () => tracker.isBusy(),
      currentJson: () => currentJson,
      lastSavedJson: () => lastSavedJson,
      lastCommitted: () => tracker.lastCommitted(),
      persistDraft: async () => {
        persistCalls += 1;
        return false;
      },
      confirmLeaveUnsaved: () => true,
      timeoutMs: 3000,
      pollMs: 10,
    });
    await failed;

    expect(result).toBe("navigate");
    expect(persistCalls).toBe(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("resolveFillSaveLocalState", () => {
  it("preserves typing during a save and remains unsaved/dirty", () => {
    const submitted = { note: "hello", father_signature: "" };
    const saved = { note: "hello", father_signature: "sig" };
    const typedDuringSave = { note: "hello world", father_signature: "" };

    const ui = mergeSavedFillIntoCurrentData(typedDuringSave, submitted, saved);
    expect(ui).toEqual({ note: "hello world", father_signature: "sig" });

    const local = resolveFillSaveLocalState({
      submittedJson: JSON.stringify(saved),
      savedJson: JSON.stringify(saved),
      currentJson: JSON.stringify(ui),
    });

    expect(JSON.parse(local.dataRefJson)).toEqual({
      note: "hello world",
      father_signature: "sig",
    });
    expect(local.lastSavedJson).toBe(JSON.stringify(saved));
    expect(local.dirty).toBe(true);
  });

  it("aligns dataRef with the saved payload when nothing was typed during save", () => {
    const saved = { note: "hello", father_signature: "sig" };
    const local = resolveFillSaveLocalState({
      submittedJson: JSON.stringify(saved),
      savedJson: JSON.stringify(saved),
      currentJson: JSON.stringify(saved),
    });
    expect(local.dataRefJson).toBe(local.lastSavedJson);
    expect(local.dirty).toBe(false);
  });

  it("table refine autosave uses dataRef at insert so other cells typed during refine are kept (TZ-166)", () => {
    const cellRefined = "table:0:notes";
    const cellOther = "table:0:summary";
    const snapshotAtRender = {
      [cellRefined]: "טקסט גולמי לניסוח",
      [cellOther]: "",
    };
    const dataRefAtInsert = {
      ...snapshotAtRender,
      [cellOther]: "עריכה בתא אחר בזמן הניסוח",
    };
    const refinedText = "טקסט מנוסח";

    const staleTableSnapshot = {
      ...snapshotAtRender,
      [cellRefined]: refinedText,
    };
    expect(staleTableSnapshot[cellOther]).toBe("");

    const autosavePayload = {
      ...dataRefAtInsert,
      [cellRefined]: refinedText,
    };
    expect(autosavePayload[cellOther]).toBe(
      "עריכה בתא אחר בזמן הניסוח"
    );

    const resolved = resolveFillSaveLocalState({
      submittedJson: JSON.stringify(autosavePayload),
      savedJson: JSON.stringify(autosavePayload),
      currentJson: JSON.stringify(autosavePayload),
    });
    expect(JSON.parse(resolved.dataRefJson)).toEqual(autosavePayload);
  });
});
