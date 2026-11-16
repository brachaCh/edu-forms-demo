import { describe, expect, it } from "vitest";
import { teacherInviteStudentsHref } from "./teacher-invite-redirect";

describe("teacherInviteStudentsHref", () => {
  it("sends invited teachers to the institution hub", () => {
    expect(teacherInviteStudentsHref("רחל כהן")).toBe("/personal-area");
  });

  it("uses sector table when category is set (default framework)", () => {
    // Without institution settings, uses global DEFAULT_EDUCATION_FRAMEWORK (special)
    expect(teacherInviteStudentsHref("רחל כהן", "schools")).toBe(
      "/personal-area/sector-table/schools/special"
    );
  });

  // TZ-27: Tests for institution-specific framework routing
  it("uses institution's regular framework when set", () => {
    expect(
      teacherInviteStudentsHref("רחל כהן", "schools", {
        institution_type: "schools",
        education_framework: "regular",
      })
    ).toBe("/personal-area/sector-table/schools/regular");
  });

  it("uses institution's special framework when set", () => {
    expect(
      teacherInviteStudentsHref("רחל כהן", "schools", {
        institution_type: "schools",
        education_framework: "special",
      })
    ).toBe("/personal-area/sector-table/schools/special");
  });

  it("prefers institution_type over staff card category", () => {
    // Staff card says kindergartens, but institution is schools
    expect(
      teacherInviteStudentsHref("רחל כהן", "kindergartens", {
        institution_type: "schools",
        education_framework: "regular",
      })
    ).toBe("/personal-area/sector-table/schools/regular");
  });

  it("falls back to staff card category when institution_type is null", () => {
    expect(
      teacherInviteStudentsHref("רחל כהן", "schools", {
        institution_type: null,
        education_framework: "regular",
      })
    ).toBe("/personal-area/sector-table/schools/regular");
  });

  it("falls back to default framework when institution framework is null", () => {
    expect(
      teacherInviteStudentsHref("רחל כהן", "schools", {
        institution_type: "schools",
        education_framework: null,
      })
    ).toBe("/personal-area/sector-table/schools/special");
  });

  it("returns personal-area when no valid sector available", () => {
    expect(
      teacherInviteStudentsHref("רחל כהן", null, {
        institution_type: null,
        education_framework: "regular",
      })
    ).toBe("/personal-area");
  });
});
