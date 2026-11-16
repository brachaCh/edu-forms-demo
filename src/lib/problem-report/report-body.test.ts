import { describe, expect, it } from "vitest";
import { PROBLEM_REPORT_DESCRIPTION_MAX } from "./constants";
import { buildTzavtaReportDescription } from "./report-body";

describe("buildTzavtaReportDescription", () => {
  it("includes name, email, institution and user description for Tzavta", () => {
    const text = buildTzavtaReportDescription("הכפתור לא מגיב", {
      reporterEmail: "teacher@school.il",
      reporterName: "שרה כהן",
      institutionName: "בית ספר לדוגמה",
      institutionCode: "bs-123",
    });
    expect(text).toContain("שם: שרה כהן");
    expect(text).toContain("מייל: teacher@school.il");
    expect(text).toContain("מוסד: בית ספר לדוגמה (bs-123)");
    expect(text).toContain("תיאור:");
    expect(text).toContain("הכפתור לא מגיב");
  });

  it("keeps a long user description within Tzavta DB budget", () => {
    const longDescription = "א".repeat(PROBLEM_REPORT_DESCRIPTION_MAX);
    const text = buildTzavtaReportDescription(longDescription, {
      reporterEmail: "teacher@school.il",
      reporterName: "שרה כהן",
      institutionName: "בית ספר לדוגמה",
      institutionCode: "bs-123",
    });
    expect(text.length).toBeLessThanOrEqual(3800);
    expect(text).toContain("תיאור:");
    expect(text).toContain("א");
    expect(text).toContain("…(המשך בפרטי הדיווח)");
    expect(text).not.toContain("שם:");
    const wrapped =
      "דיווח מפרוטוקל · bug-2610210847-21\n\n" + text;
    expect(wrapped.length).toBeLessThanOrEqual(4000);
  });
});
