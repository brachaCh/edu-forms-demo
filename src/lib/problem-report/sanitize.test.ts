import { describe, expect, it } from "vitest";
import {
  isForbiddenReportPath,
  normalizeReportPath,
  redactPagePath,
  sanitizeBrowser,
  sanitizePagePath,
} from "./sanitize";

describe("sanitizePagePath", () => {
  it("keeps a relative path and drops query or hash", () => {
    expect(sanitizePagePath("/personal-area/students")).toBe(
      "/personal-area/students"
    );
    expect(sanitizePagePath("/personal-area?name=נועה")).toBe("/personal-area");
    expect(sanitizePagePath("/personal-area#top")).toBe("/personal-area");
  });

  it("rejects absolute URLs and empty values", () => {
    expect(sanitizePagePath("https://evil.example/x")).toBeNull();
    expect(sanitizePagePath("//evil.example")).toBeNull();
    expect(sanitizePagePath("")).toBeNull();
  });
});

describe("isForbiddenReportPath", () => {
  it("rejects public /fill, /sign, and /view paths", () => {
    expect(isForbiddenReportPath("/fill/secret-token")).toBe(true);
    expect(isForbiddenReportPath("/sign/parent-token")).toBe(true);
    expect(isForbiddenReportPath("/view/view-token")).toBe(true);
    expect(isForbiddenReportPath("/fill/a/b")).toBe(true);
    expect(isForbiddenReportPath("/FILL/token")).toBe(true);
    expect(isForbiddenReportPath("/sign")).toBe(true);
    expect(isForbiddenReportPath("/view")).toBe(true);
  });

  it("allows in-app student fill pages", () => {
    expect(
      isForbiddenReportPath(
        "/personal-area/students/fill/550e8400-e29b-41d4-a716-446655440000/parent-questionnaire"
      )
    ).toBe(false);
    expect(isForbiddenReportPath("/personal-area")).toBe(false);
    expect(isForbiddenReportPath("/dashboard")).toBe(false);
  });
});

describe("redactPagePath", () => {
  it("redacts student ids after /students", () => {
    expect(
      redactPagePath(
        "/personal-area/students/550e8400-e29b-41d4-a716-446655440000"
      )
    ).toBe("/personal-area/students/:id");
    expect(
      redactPagePath(
        "/personal-area/students/view/550e8400-e29b-41d4-a716-446655440000"
      )
    ).toBe("/personal-area/students/view/:id");
    expect(
      redactPagePath(
        "/personal-area/students/fill/550e8400-e29b-41d4-a716-446655440000/parent-questionnaire"
      )
    ).toBe("/personal-area/students/fill/:id/parent-questionnaire");
  });

  it("redacts a non-uuid student segment so names never stay in the path", () => {
    expect(redactPagePath("/personal-area/students/נועה-כהן")).toBe(
      "/personal-area/students/:id"
    );
  });

  it("leaves static student list and new-student routes", () => {
    expect(redactPagePath("/personal-area/students")).toBe(
      "/personal-area/students"
    );
    expect(redactPagePath("/personal-area/students/new")).toBe(
      "/personal-area/students/new"
    );
  });

  it("redacts uuid and mixed tokens anywhere", () => {
    expect(
      redactPagePath("/print/550e8400-e29b-41d4-a716-446655440000")
    ).toBe("/print/:id");
    expect(redactPagePath("/personal-area/abc12token99xyz")).toBe(
      "/personal-area/:id"
    );
  });

  it("decodes %2F and %2f before splitting so the id is redacted", () => {
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      redactPagePath(`/personal-area/students%2F${studentId}`)
    ).toBe("/personal-area/students/:id");
    expect(
      redactPagePath(`/personal-area/students%2f${studentId}`)
    ).toBe("/personal-area/students/:id");
    expect(
      redactPagePath(`/personal-area%2Fstudents%2F${studentId}`)
    ).toBe("/personal-area/students/:id");
    expect(
      redactPagePath(`/personal-area%2fstudents%2f${studentId}`)
    ).toBe("/personal-area/students/:id");
  });

  it("does not leak an id through double-encoded %252F", () => {
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    for (const encoded of [
      `/personal-area/students%252F${studentId}`,
      `/personal-area%252Fstudents%252F${studentId}`,
    ]) {
      const redacted = redactPagePath(encoded);
      expect(redacted).not.toContain(studentId);
      expect(redacted).not.toMatch(/550e8400/i);
    }
  });

  it("strips encoded ? / # / ; so names and ids do not remain", () => {
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    const noa = encodeURIComponent("נועה");
    expect(
      redactPagePath(`/personal-area%3Fname=${noa}`)
    ).toBe("/personal-area");
    expect(redactPagePath(`/personal-area%3Fname=${noa}`)).not.toContain("נועה");
    expect(
      redactPagePath(`/personal-area/students%3F${studentId}`)
    ).toBe("/personal-area/students");
    expect(
      redactPagePath(`/personal-area/students%23${studentId}`)
    ).toBe("/personal-area/students");
    expect(
      redactPagePath(`/personal-area/students%3Fid=${studentId}`)
    ).toBe("/personal-area/students");
    expect(
      redactPagePath(`/personal-area/students%253F${studentId}`)
    ).toBe("/personal-area/students");
    expect(
      redactPagePath(`/personal-area/students;${studentId}`)
    ).toBe("/personal-area/students");
    for (const encoded of [
      `/personal-area/students%3F${studentId}`,
      `/personal-area/students%23${studentId}`,
      `/personal-area/students%253F${studentId}`,
      `/personal-area/students;${studentId}`,
    ]) {
      expect(redactPagePath(encoded)).not.toContain(studentId);
    }
  });

  it("replaces UUIDs and long ids inside a segment", () => {
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    expect(redactPagePath(`/notes/קובץ-${studentId}-עותק`)).toBe(
      "/notes/קובץ-:id-עותק"
    );
    expect(redactPagePath("/notes/מס-20261020")).toBe("/notes/מס-:id");
  });
});

describe("normalizeReportPath", () => {
  it("resolves .. and . before /fill and /sign are judged", () => {
    expect(normalizeReportPath("/x/../fill/t")).toBe("/fill/t");
    expect(isForbiddenReportPath(normalizeReportPath("/x/../fill/t")!)).toBe(
      true
    );
    expect(normalizeReportPath("/x/./sign/t")).toBe("/x/sign/t");
    expect(normalizeReportPath("/personal-area/../fill/t")).toBe("/fill/t");
  });

  it("returns null for a literal % that cannot be decoded", () => {
    expect(normalizeReportPath("/personal-area/students/folder/x/50%")).toBeNull();
  });
});

describe("sanitizeBrowser", () => {
  it("truncates and strips control characters", () => {
    expect(sanitizeBrowser("Mozilla/5.0\nChrome")).toBe("Mozilla/5.0 Chrome");
    expect(sanitizeBrowser("")).toBeNull();
  });
});
