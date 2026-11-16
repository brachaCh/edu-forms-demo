import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  FREE_ACCESS_DEFAULT_DEMO_STUDENT_ID,
  FREE_ACCESS_FILLABLE_STUDENT_ID_KEY,
  FREE_ACCESS_IMPORTED_IDS_KEY,
  FREE_ACCESS_KEY,
  FREE_ACCESS_STARTED_AT_KEY,
  getFreeAccessFillableStudentId,
  getFreeAccessImportedStudentIds,
  isFreeAccessStudentFillable,
  rememberFreeAccessImportedStudent,
} from "./free-access";

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("window", {
    localStorage,
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("localStorage", localStorage);
}

describe("free-access excel fillable student", () => {
  beforeEach(() => {
    installLocalStorageMock();
    window.localStorage.setItem(FREE_ACCESS_KEY, "1");
    window.localStorage.setItem(FREE_ACCESS_STARTED_AT_KEY, String(Date.now()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults fillable student to demo before import", () => {
    expect(getFreeAccessFillableStudentId()).toBe(
      FREE_ACCESS_DEFAULT_DEMO_STUDENT_ID
    );
    expect(
      isFreeAccessStudentFillable(FREE_ACCESS_DEFAULT_DEMO_STUDENT_ID)
    ).toBe(true);
    expect(isFreeAccessStudentFillable("other")).toBe(false);
  });

  it("marks the first imported student as the only fillable one", () => {
    rememberFreeAccessImportedStudent("imported-1");
    rememberFreeAccessImportedStudent("imported-2");

    expect(getFreeAccessImportedStudentIds()).toEqual([
      "imported-1",
      "imported-2",
    ]);
    expect(getFreeAccessFillableStudentId()).toBe("imported-1");
    expect(isFreeAccessStudentFillable("imported-1")).toBe(true);
    expect(isFreeAccessStudentFillable("imported-2")).toBe(false);
    expect(
      isFreeAccessStudentFillable(FREE_ACCESS_DEFAULT_DEMO_STUDENT_ID)
    ).toBe(false);
  });

  it("does not overwrite an existing fillable id", () => {
    window.localStorage.setItem(FREE_ACCESS_FILLABLE_STUDENT_ID_KEY, "kept");
    window.localStorage.setItem(
      FREE_ACCESS_IMPORTED_IDS_KEY,
      JSON.stringify(["kept"])
    );
    rememberFreeAccessImportedStudent("newer");
    expect(getFreeAccessFillableStudentId()).toBe("kept");
  });
});
