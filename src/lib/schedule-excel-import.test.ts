import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseScheduleImportFile } from "@/lib/schedule-excel-import";
import { scheduleCellKey, scheduleInClassKey } from "@/lib/form-table-grids";

async function matrixBuffer(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("מערכת");
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe("parseScheduleImportFile", () => {
  it("imports days as columns and periods as rows", async () => {
    const result = await parseScheduleImportFile(
      await matrixBuffer([
        ["שיעור", "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"],
        [1, "עברית", "חשבון", "אנגלית", "מדעים", "ספורט", ""],
        [2, "מוזיקה", "", "אומנות", "חשבון", "עברית", "שישי קצר"],
      ])
    );

    expect(result.filledCount).toBeGreaterThan(0);
    expect(result.cells[scheduleCellKey("sun", 1)]).toBe("עברית");
    expect(result.cells[scheduleCellKey("mon", 1)]).toBe("חשבון");
    expect(result.cells[scheduleCellKey("fri", 2)]).toBe("שישי קצר");
    expect(result.cells[scheduleCellKey("mon", 2)]).toBeUndefined();
  });

  it("imports periods as columns and days as rows", async () => {
    const result = await parseScheduleImportFile(
      await matrixBuffer([
        ["יום", 1, 2, 3],
        ["ראשון", "עברית", "חשבון", "הפסקה"],
        ["שני", "אנגלית", "", "ספורט"],
      ])
    );

    expect(result.cells[scheduleCellKey("sun", 1)]).toBe("עברית");
    expect(result.cells[scheduleCellKey("sun", 3)]).toBe("הפסקה");
    expect(result.cells[scheduleCellKey("mon", 1)]).toBe("אנגלית");
    expect(result.cells[scheduleCellKey("mon", 3)]).toBe("ספורט");
  });

  it("marks in-class flags from cell text", async () => {
    const result = await parseScheduleImportFile(
      await matrixBuffer([
        ["", "ראשון", "שני", "שלישי"],
        [1, "עברית [בכיתה]", "חשבון", ""],
      ])
    );

    expect(result.cells[scheduleCellKey("sun", 1)]).toBe("עברית");
    expect(result.cells[scheduleInClassKey("sun", 1)]).toBe("1");
  });

  it("returns empty when the sheet is not a schedule", async () => {
    const result = await parseScheduleImportFile(
      await matrixBuffer([
        ["שם", "כיתה"],
        ["יוסי", "ג1"],
      ])
    );
    expect(result.filledCount).toBe(0);
  });
});
