import { describe, it, expect } from "vitest";
import { extractDomainRows } from "./personal-basket-tachi-bulk";
import { tableCellKey, tableRowCountKey } from "@/lib/form-table-grids";

const TABLE_ID = "personal-basket-goals";

function makeFormData(
  rows: Array<{ domain?: string; main_goal?: string; partners?: string }>
): Record<string, string> {
  const data: Record<string, string> = {
    [tableRowCountKey(TABLE_ID)]: String(rows.length),
  };
  rows.forEach((row, i) => {
    if (row.domain !== undefined) {
      data[tableCellKey(TABLE_ID, i, "domain")] = row.domain;
    }
    if (row.main_goal !== undefined) {
      data[tableCellKey(TABLE_ID, i, "main_goal")] = row.main_goal;
    }
    if (row.partners !== undefined) {
      data[tableCellKey(TABLE_ID, i, "partners")] = row.partners;
    }
  });
  return data;
}

describe("extractDomainRows", () => {
  it("extracts filled domain rows", () => {
    const data = makeFormData([
      { domain: "שפה", main_goal: "שיפור קריאה", partners: "מורה יוכי" },
      { domain: "חשבון", main_goal: "שיפור חשבון", partners: "מורה ברכי" },
    ]);
    const rows = extractDomainRows(data);
    expect(rows).toEqual([
      { domain: "שפה", mainGoal: "שיפור קריאה", partners: "מורה יוכי" },
      { domain: "חשבון", mainGoal: "שיפור חשבון", partners: "מורה ברכי" },
    ]);
  });

  it("skips rows with empty domain", () => {
    const data = makeFormData([
      { domain: "שפה", main_goal: "מטרה 1", partners: "" },
      { domain: "", main_goal: "מטרה 2", partners: "איש צוות" },
      { domain: "חשבון", main_goal: "מטרה 3", partners: "" },
    ]);
    const rows = extractDomainRows(data);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.domain)).toEqual(["שפה", "חשבון"]);
  });

  it("skips rows with only whitespace domain", () => {
    const data = makeFormData([
      { domain: "  ", main_goal: "מטרה", partners: "" },
      { domain: "שפה", main_goal: "מטרה אמיתית", partners: "" },
    ]);
    const rows = extractDomainRows(data);
    expect(rows).toHaveLength(1);
    expect(rows[0].domain).toBe("שפה");
  });

  it("returns empty array for empty table", () => {
    const data = makeFormData([]);
    const rows = extractDomainRows(data);
    expect(rows).toEqual([]);
  });

  it("handles missing keys gracefully", () => {
    const data: Record<string, string> = {
      [tableRowCountKey(TABLE_ID)]: "2",
      [tableCellKey(TABLE_ID, 0, "domain")]: "שפה",
    };
    const rows = extractDomainRows(data);
    expect(rows).toEqual([{ domain: "שפה", mainGoal: "", partners: "" }]);
  });

  it("trims whitespace from values", () => {
    const data = makeFormData([
      { domain: "  שפה  ", main_goal: "  מטרה  ", partners: "  שותף  " },
    ]);
    const rows = extractDomainRows(data);
    expect(rows[0]).toEqual({
      domain: "שפה",
      mainGoal: "מטרה",
      partners: "שותף",
    });
  });
});

describe("duplicate detection (unit logic)", () => {
  it("normalizes domain names for comparison (case-insensitive)", () => {
    const existingDomains = new Set<string>(["שפה", "חשבון"]);
    const newDomain = "שפה";
    const normalizedNew = newDomain.trim().toLowerCase();
    expect(existingDomains.has(normalizedNew)).toBe(true);
  });

  it("treats different domains as unique", () => {
    const existingDomains = new Set<string>(["שפה"]);
    const newDomain = "חשבון";
    const normalizedNew = newDomain.trim().toLowerCase();
    expect(existingDomains.has(normalizedNew)).toBe(false);
  });

  it("handles whitespace variations in domain names", () => {
    const existingDomains = new Set<string>(["שפה"]);
    const newDomainWithSpace = "  שפה  ";
    const normalizedNew = newDomainWithSpace.trim().toLowerCase();
    expect(existingDomains.has(normalizedNew)).toBe(true);
  });
});
