import { describe, expect, it } from "vitest";
import {
  isProblemReportStatus,
  problemReportStatusLabel,
} from "./status-label";

describe("problem report status labels", () => {
  it("accepts only Tzavta statuses", () => {
    expect(isProblemReportStatus("open")).toBe(true);
    expect(isProblemReportStatus("in_progress")).toBe(true);
    expect(isProblemReportStatus("waiting")).toBe(true);
    expect(isProblemReportStatus("fixed")).toBe(true);
    expect(isProblemReportStatus("closed")).toBe(true);
    expect(isProblemReportStatus("resolved")).toBe(false);
    expect(isProblemReportStatus("done")).toBe(false);
  });

  it("uses the Hebrew labels", () => {
    expect(problemReportStatusLabel("open")).toBe("פתוח");
    expect(problemReportStatusLabel("in_progress")).toBe("בטיפול");
    expect(problemReportStatusLabel("waiting")).toBe("ממתין");
    expect(problemReportStatusLabel("fixed")).toBe("טופל");
    expect(problemReportStatusLabel("closed")).toBe("נסגר");
  });
});
