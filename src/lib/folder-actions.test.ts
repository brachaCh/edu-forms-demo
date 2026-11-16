/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canRenameFolderActionButtons,
  getFolderActionButtons,
  renameFolderActionButton,
} from "./folder-actions";

describe("TZ-100 extra-documents form titles", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("does not allow renaming buttons in מסמכים נוספים", () => {
    expect(canRenameFolderActionButtons("מסמכים נוספים")).toBe(false);
    expect(canRenameFolderActionButtons("  מסמכים נוספים  ")).toBe(false);
  });

  it("still allows renaming in other portfolio folders", () => {
    expect(canRenameFolderActionButtons('תח"י')).toBe(true);
    expect(canRenameFolderActionButtons("אינפורמציה כללית")).toBe(true);
  });

  it("renameFolderActionButton is a no-op for מסמכים נוספים", () => {
    const before = getFolderActionButtons("s1", "מסמכים נוספים", "integration");
    expect(before).toContain("חידוש הזכאות לשירותי חינוך מיוחדים");

    renameFolderActionButton(
      "s1",
      "מסמכים נוספים",
      "חידוש הזכאות לשירותי חינוך מיוחדים",
      "שם שנערך",
      "integration"
    );

    const after = getFolderActionButtons("s1", "מסמכים נוספים", "integration");
    expect(after).toEqual(before);
    expect(after).toContain("חידוש הזכאות לשירותי חינוך מיוחדים");
    expect(after).not.toContain("שם שנערך");
  });

  it("renameFolderActionButton still works outside מסמכים נוספים", () => {
    const before = getFolderActionButtons("s1", 'תח"י', "integration");
    const from = before[0];
    expect(from).toBeTruthy();

    renameFolderActionButton("s1", 'תח"י', from, "שם חדש", "integration");

    const after = getFolderActionButtons("s1", 'תח"י', "integration");
    expect(after).toContain("שם חדש");
    expect(after).not.toContain(from);
  });
});
