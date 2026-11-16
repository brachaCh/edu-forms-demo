import { describe, expect, it } from "vitest";
import {
  buildStaffMeetingParentEmail,
  buildStaffMeetingParentEmailHtmlFromText,
  buildStaffMeetingPrintHtml,
  formatStaffMeetingDateForEmail,
  getStaffMeetingRow,
  listStaffMeetingRows,
  staffMeetingRowHasContent,
} from "./staff-meeting-parent-email";
import { tableCellKey, tableRowCountKey } from "./form-table-grids";

describe("listStaffMeetingRows", () => {
  it("returns only filled rows", () => {
    const data: Record<string, string> = {
      [tableRowCountKey("staff-meetings")]: "3",
      [tableCellKey("staff-meetings", 0, "date")]: "2026-03-01",
      [tableCellKey("staff-meetings", 0, "participants")]: "מחנכת, יועצת",
      [tableCellKey("staff-meetings", 0, "summary")]: "סיכום א",
      [tableCellKey("staff-meetings", 1, "date")]: "",
      [tableCellKey("staff-meetings", 1, "participants")]: "",
      [tableCellKey("staff-meetings", 1, "summary")]: "",
      [tableCellKey("staff-meetings", 2, "date")]: "2026-04-10",
      [tableCellKey("staff-meetings", 2, "participants")]: "מורים",
      [tableCellKey("staff-meetings", 2, "summary")]: "סיכום ב",
    };
    const rows = listStaffMeetingRows(data);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.summary).toBe("סיכום א");
    expect(rows[1]?.rowIndex).toBe(2);
  });
});

describe("getStaffMeetingRow", () => {
  it("reads a single row and detects empty content", () => {
    const data: Record<string, string> = {
      [tableCellKey("staff-meetings", 0, "date")]: "2026-05-01",
      [tableCellKey("staff-meetings", 0, "participants")]: "צוות",
      [tableCellKey("staff-meetings", 0, "summary")]: "המלצה",
    };
    const row = getStaffMeetingRow(data, 0);
    expect(staffMeetingRowHasContent(row)).toBe(true);
    expect(staffMeetingRowHasContent(getStaffMeetingRow(data, 1))).toBe(false);
  });
});

describe("formatStaffMeetingDateForEmail", () => {
  it("formats ISO dates in he-IL", () => {
    const label = formatStaffMeetingDateForEmail("2026-03-15");
    expect(label).toMatch(/2026|15|3|03/);
  });

  it("keeps free-text dates", () => {
    expect(formatStaffMeetingDateForEmail("יום ראשון שעבר")).toBe(
      "יום ראשון שעבר"
    );
  });
});

describe("buildStaffMeetingParentEmail", () => {
  it("fills the template with real meeting data and summary", () => {
    const { subject, text, html } = buildStaffMeetingParentEmail({
      studentName: "נועה כהן",
      meeting: {
        rowIndex: 0,
        date: "2026-03-15",
        participants: "מחנכת, יועצת, מורים מקצועיים",
        summary: "הוחלט על תמיכה נוספת בקריאה.",
      },
    });

    expect(subject).toBe("עדכון מישיבת צוות בנוגע לנועה כהן");
    expect(text).toContain("להורים היקרים של נועה כהן");
    expect(text).toContain("בהשתתפות מחנכת, יועצת, מורים מקצועיים");
    expect(text).toContain(
      "מטרת המפגש הייתה לבחון את התקדמותו/ה ולגבש תוכנית עבודה מיטבית עבורו/ה."
    );
    expect(text).toContain("הוחלט על תמיכה נוספת בקריאה.");
    expect(text.indexOf("הוחלט על תמיכה")).toBeGreaterThan(
      text.indexOf("מטרת המפגש")
    );
    expect(text).toContain("ההנהלה וצוות בית הספר");
    expect(html).toContain("direction:rtl");
    expect(html).toContain("text-align:right");
    expect(html).toContain('dir="rtl"');
  });
});

describe("buildStaffMeetingParentEmailHtmlFromText", () => {
  it("wraps edited plain text in rtl html", () => {
    const html = buildStaffMeetingParentEmailHtmlFromText(
      "עדכון לדוגמה",
      "שורה ראשונה\n\nשורה שנייה"
    );
    expect(html).toContain("עדכון לדוגמה");
    expect(html).toContain("שורה ראשונה");
    expect(html).toContain("שורה שנייה");
    expect(html).toContain('dir="rtl"');
  });
});

describe("buildStaffMeetingPrintHtml", () => {
  it("includes one meeting fields for print", () => {
    const html = buildStaffMeetingPrintHtml({
      studentName: "נועה כהן",
      meeting: {
        rowIndex: 0,
        date: "2026-03-15",
        participants: "מחנכת",
        summary: "המלצות להמשך",
      },
    });
    expect(html).toContain("סיכום ישיבת צוות");
    expect(html).toContain("נועה כהן");
    expect(html).toContain("מחנכת");
    expect(html).toContain("המלצות להמשך");
    expect(html).toContain("@media print");
  });
});
