import { describe, expect, it } from "vitest";
import {
  categorySpecialEdClassModeHref,
  categoryTeacherHref,
  sectorSpecialEdModeHref,
  sectorSpecialEdModeTeacherHref,
  sectorTeacherHref,
  teacherNameFromSearchParam,
  withTeacherNameQuery,
} from "./personal-sector";

describe("teacher hrefs", () => {
  it("puts the teacher name in a query param, not the path", () => {
    expect(
      sectorTeacherHref("schools", "integration-teacher", "אסתר")
    ).toBe(
      "/personal-area/category/integration-teacher/teacher?name=%D7%90%D7%A1%D7%AA%D7%A8&sector=schools&framework=special"
    );

    expect(categoryTeacherHref("integration-teacher", "אסתר")).toBe(
      "/personal-area/category/integration-teacher/teacher?name=%D7%90%D7%A1%D7%AA%D7%A8"
    );

    expect(
      sectorSpecialEdModeTeacherHref("schools", "student", "דנה")
    ).toMatch(/\?name=/);
    expect(
      sectorSpecialEdModeTeacherHref("schools", "student", "דנה")
    ).not.toMatch(/\/teacher\/[^?]/);
  });

  it("opens תיק תלמיד כיתה on /mode, not the 404 class-mode alias", () => {
    expect(categorySpecialEdClassModeHref("student", "כיתה")).toBe(
      "/personal-area/category/special-ed-class/mode/student?name=%D7%9B%D7%99%D7%AA%D7%94"
    );
    expect(
      sectorSpecialEdModeHref("schools", "student", "special", "personal-area", "כיתה")
    ).toBe(
      "/personal-area/sector/schools/framework/special/status/special-ed-class/mode/student?name=%D7%9B%D7%99%D7%AA%D7%94"
    );
  });

  it("decodes search param names safely", () => {
    expect(teacherNameFromSearchParam("אסתר")).toBe("אסתר");
    expect(teacherNameFromSearchParam("אסתרי")).toBe("אסתרי");
    expect(
      teacherNameFromSearchParam("%D7%90%D7%A1%D7%AA%D7%A8")
    ).toBe("אסתר");
    expect(teacherNameFromSearchParam(undefined)).toBe("");
    expect(teacherNameFromSearchParam(null)).toBe("");
    expect(withTeacherNameQuery("/x/teacher", "  ")).toBe("/x/teacher");
  });
});
