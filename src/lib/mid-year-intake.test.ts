import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  clearMidYearIntake,
  clearMidYearIntakeMany,
  isMidYearIntakePending,
  isMidYearIntakeTarget,
  listMidYearIntakeEntries,
  markMidYearIntake,
  midYearIntakeButtonLabel,
  midYearIntakeHref,
  midYearIntakeTransferLabel,
  midYearIntakeYear,
} from "@/lib/mid-year-intake";

describe("mid-year-intake", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("labels intake for next school year", () => {
    expect(midYearIntakeYear(new Date(2026, 7, 31))).toBe(5788);
    expect(midYearIntakeButtonLabel(5788)).toBe(
      'העלאת תלמידים חדשים לשנה תשפ"ח'
    );
  });

  it("marks and clears pending intake", () => {
    expect(isMidYearIntakePending("s1")).toBe(false);
    markMidYearIntake("s1", {
      targetStatus: "integration",
      year: 5786,
      sector: "schools",
    });
    expect(isMidYearIntakePending("s1")).toBe(true);
    clearMidYearIntake("s1");
    expect(isMidYearIntakePending("s1")).toBe(false);
  });

  it("lists entries by target and sector", () => {
    markMidYearIntake("a", {
      targetStatus: "integration",
      year: 5786,
      sector: "schools",
    });
    markMidYearIntake("b", {
      targetStatus: "personal-basket",
      year: 5786,
      sector: "schools",
      frequency: "high",
    });
    markMidYearIntake("c", {
      targetStatus: "integration",
      year: 5786,
      sector: "kindergartens",
    });

    const schoolsIntegration = listMidYearIntakeEntries({
      sector: "schools",
      targetStatus: "integration",
      year: 5786,
    });
    expect(schoolsIntegration.map((e) => e.studentId).sort()).toEqual(["a"]);
  });

  it("clears many ids", () => {
    markMidYearIntake("x", {
      targetStatus: "integration",
      year: 5786,
      sector: "schools",
    });
    markMidYearIntake("y", {
      targetStatus: "integration",
      year: 5786,
      sector: "schools",
    });
    clearMidYearIntakeMany(["x", "y"]);
    expect(isMidYearIntakePending("x")).toBe(false);
    expect(isMidYearIntakePending("y")).toBe(false);
  });

  it("builds href and labels", () => {
    expect(isMidYearIntakeTarget("integration")).toBe(true);
    expect(isMidYearIntakeTarget("special-ed-class")).toBe(false);
    expect(midYearIntakeTransferLabel("integration")).toContain("שילוב");
    expect(midYearIntakeTransferLabel("personal-basket")).toContain("סל אישי");
    expect(
      midYearIntakeHref({
        sector: "schools",
        target: "integration",
        year: 5786,
      })
    ).toContain("mid-year-intake");
  });
});
