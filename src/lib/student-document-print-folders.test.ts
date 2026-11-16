/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePrintBusEnvelope } from "./detached-print";

const studentsImpl = vi.fn(() => [
  {
    id: "s1",
    status: "personal-basket",
    calendar_year: 2026,
    full_name: "יעל כהן",
  },
]);

vi.mock("@/lib/mock-store", () => ({
  getStudentDocuments: () => [],
  getStudents: () => studentsImpl(),
  getStudentFormFills: () => [],
  loadStudentFormFills: async () => [],
  getUser: () => null,
}));

vi.mock("@/lib/free-access", () => ({
  isFreeAccessMode: () => false,
}));

vi.mock("@/lib/supabase-db", () => ({
  canUseSupabase: () => false,
  isStudentDocumentDataError: () => false,
}));

vi.mock("@/lib/data-cache", () => ({
  ensureStudentDocumentData: async (doc: unknown) => doc,
  reloadStudentDocuments: async () => undefined,
}));

vi.mock("@/lib/folder-actions", () => ({
  getDocumentSlot: () => null,
  getFolderActionButtons: () => [],
}));

class FakeBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(name: string) {
    this.name = name;
  }
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

import {
  printDocumentsInFolders,
  PRINT_FOLDERS_FAILED_MESSAGE,
} from "./student-document-print";

describe("printDocumentsInFolders fail before ready (TZ-90)", () => {
  beforeEach(() => {
    localStorage.clear();
    studentsImpl.mockReset();
    studentsImpl.mockImplementation(() => {
      throw new Error("password authentication failed for user postgres");
    });
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("writes a fast-failure error to the bus before ready and keeps it after teardown", async () => {
    const pending = printDocumentsInFolders("s1", ["אינפורמציה כללית"]);
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toEqual({ ok: false, count: 0 });

    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith("matoah-print-bus:")
    );
    expect(keys).toHaveLength(1);
    expect(parsePrintBusEnvelope(localStorage.getItem(keys[0]))?.message).toEqual({
      type: "error",
      message: PRINT_FOLDERS_FAILED_MESSAGE,
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(parsePrintBusEnvelope(localStorage.getItem(keys[0]))?.message).toEqual({
      type: "error",
      message: PRINT_FOLDERS_FAILED_MESSAGE,
    });
  });
});
