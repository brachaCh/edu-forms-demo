import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAiFillFieldDescriptors } from "@/lib/form-ai-fill";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { buildFormSnapshotHtml } from "@/lib/form-snapshot";
import {
  HOLISTIC_RUBRIC_HREF,
  HOLISTIC_RUBRIC_PUBLIC_FILE,
  HOLISTIC_STUDENT_CENTER_KEY,
  leftoverHolisticStudentProfile,
} from "@/lib/holistic-rubric";

describe("holistic rubric download (TZ-76)", () => {
  it("uses an ASCII public path that exists as a valid docx", () => {
    expect(HOLISTIC_RUBRIC_HREF).toBe("/portfolio-templates/machon-talmid.docx");
    expect(HOLISTIC_RUBRIC_HREF).not.toMatch(/[^\x00-\x7F]/);

    const filePath = resolve(process.cwd(), HOLISTIC_RUBRIC_PUBLIC_FILE);
    expect(existsSync(filePath)).toBe(true);
    const header = readFileSync(filePath).subarray(0, 4);
    expect(header.toString("binary")).toBe("PK\u0003\u0004");
  });
});

describe("holistic student center title (TZ-77)", () => {
  it("keeps student_profile on tachi-prep as a non-input field", () => {
    const schema = getFormSchema("tachi-prep");
    expect(schema).toBeTruthy();
    const field = listFormFields(schema!).find(
      (item) => item.key === HOLISTIC_STUDENT_CENTER_KEY
    );
    expect(field).toBeTruthy();
    expect(field?.label).toBe("התלמיד");
    expect(field?.type).toBe("static");
  });

  it("does not send student_profile to AI fill", () => {
    const schema = getFormSchema("tachi-prep")!;
    const keys = buildAiFillFieldDescriptors(schema, {}).map((item) => item.key);
    expect(keys).not.toContain(HOLISTIC_STUDENT_CENTER_KEY);
    expect(keys).toContain("strengths");
    expect(keys).toContain("areas_to_strengthen");
  });

  it("prints התלמיד as a centre title and shows leftover draft text read-only", () => {
    const schema = getFormSchema("tachi-prep")!;
    const empty = buildFormSnapshotHtml(
      schema,
      { full_name: "יוכבד דה לאון", strengths: "קריאה שוטפת" },
      "יוכבד דה לאון"
    );
    expect(empty).toContain(
      'holistic-cell holistic-center holistic-title-only'
    );
    expect(empty).toContain("התלמיד");
    expect(empty).toContain("קריאה שוטפת");
    expect(empty).not.toContain("תיאור כולל של התלמיד/ה במרכז הפרופיל ההוליסטי");

    const leftover = "טקסט ישן מהטיוטה";
    const withLegacy = buildFormSnapshotHtml(
      schema,
      { student_profile: leftover, areas_to_strengthen: "חשבון" },
      "יוכבד דה לאון"
    );
    expect(withLegacy).toContain(leftover);
    expect(withLegacy).not.toContain(
      'holistic-cell holistic-center holistic-title-only'
    );
    expect(withLegacy).toContain("חשבון");
  });

  it("reads leftover draft text without dropping empty values", () => {
    expect(leftoverHolisticStudentProfile({ student_profile: "  כן  " })).toBe(
      "כן"
    );
    expect(leftoverHolisticStudentProfile({ student_profile: "   " })).toBe("");
    expect(leftoverHolisticStudentProfile({})).toBe("");
  });
});
