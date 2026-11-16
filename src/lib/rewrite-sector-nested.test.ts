import { describe, expect, it } from "vitest";
import { encodeFolderParam } from "./hebrew-quotes";
import {
  rewrittenBrokenClassModeDestination,
  rewrittenClassModeAliasDestination,
  rewrittenClassNameDestination,
  rewrittenLegacyPfolderCategoryDestination,
  rewrittenPortfolioCategoryDestination,
  rewrittenPortfolioCustomFolderDestination,
  rewrittenPortfolioFillDestination,
  rewrittenPortfolioFormsDestination,
  rewrittenSectorFrameworkDestination,
  rewrittenSectorHomeDestination,
  rewrittenSectorNestedDestination,
  rewrittenStudentsCategoryAliasDestination,
} from "./rewrite-sector-nested";

describe("rewrittenSectorHomeDestination", () => {
  it("rewrites sector home to the alias route", () => {
    expect(
      rewrittenSectorHomeDestination("/personal-area/sector/schools")
    ).toEqual({
      pathname: "/personal-area/sector-home/schools",
      search: "",
    });
  });
});

describe("rewrittenSectorFrameworkDestination", () => {
  it("rewrites sector framework to the alias route", () => {
    expect(
      rewrittenSectorFrameworkDestination(
        "/personal-area/sector/schools/framework/regular"
      )
    ).toEqual({
      pathname: "/personal-area/sector-table/schools/regular",
      search: "",
    });
  });
});

describe("rewrittenSectorNestedDestination", () => {
  it("rewrites the deep teacher URL to the working category route", () => {
    expect(
      rewrittenSectorNestedDestination(
        "/personal-area/sector/schools/framework/special/status/integration-teacher/teacher",
        "?name=%D7%90%D7%A8%D7%95%D7%9F"
      )
    ).toEqual({
      pathname: "/personal-area/category/integration-teacher/teacher",
      search: "?name=%D7%90%D7%A8%D7%95%D7%9F&sector=schools&framework=special",
    });
  });

  it("rewrites the status page itself to the working category route", () => {
    expect(
      rewrittenSectorNestedDestination(
        "/personal-area/sector/schools/framework/special/status/integration-teacher"
      )
    ).toEqual({
      pathname: "/personal-area/category/integration-teacher",
      search: "?sector=schools&framework=special",
    });
  });

  it("rewrites the portfolio forms URL to the alias route", () => {
    expect(
      rewrittenPortfolioFormsDestination(
        "/personal-area/students/portfolio/demo-student-1/forms/%D7%98%D7%95%D7%A4%D7%A1%20%D7%95%D7%99%D7%AA%D7%95%D7%A8%20%D7%A1%D7%95%D7%93%D7%99%D7%95%D7%AA",
        "?from=%2Fpersonal-area%2Fstudents%2Fview%2Fdemo-student-1"
      )
    ).toEqual({
      pathname:
        "/personal-area/students/forms/demo-student-1/%D7%98%D7%95%D7%A4%D7%A1%20%D7%95%D7%99%D7%AA%D7%95%D7%A8%20%D7%A1%D7%95%D7%93%D7%99%D7%95%D7%AA",
      search: "?from=%2Fpersonal-area%2Fstudents%2Fview%2Fdemo-student-1",
    });
  });

  it("rewrites the portfolio custom folder URL to the alias route", () => {
    expect(
      rewrittenPortfolioCustomFolderDestination(
        "/personal-area/students/portfolio/demo-student-1/custom/%D7%95%D7%99%D7%AA%D7%95%D7%A8%20%D7%A1%D7%95%D7%93%D7%99%D7%95%D7%AA",
        "?from=%2Fpersonal-area%2Fstudents%2Fview%2Fdemo-student-1"
      )
    ).toEqual({
      pathname:
        "/personal-area/students/folder/demo-student-1/%D7%95%D7%99%D7%AA%D7%95%D7%A8%20%D7%A1%D7%95%D7%93%D7%99%D7%95%D7%AA",
      search: "?from=%2Fpersonal-area%2Fstudents%2Fview%2Fdemo-student-1",
    });
  });

  it("rewrites the portfolio fill URL to the alias route", () => {
    expect(
      rewrittenPortfolioFillDestination(
        "/personal-area/students/portfolio/demo-student-1/fill/schedule",
        "?from=%2Fpersonal-area%2Fstudents%2Fforms%2Fdemo-student-1%2F%D7%98%D7%95%D7%A4%D7%A1"
      )
    ).toEqual({
      pathname: "/personal-area/students/fill/demo-student-1/schedule",
      search:
        "?from=%2Fpersonal-area%2Fstudents%2Fforms%2Fdemo-student-1%2F%D7%98%D7%95%D7%A4%D7%A1",
    });
  });

  it("rewrites the portfolio category URL to the stable folder route", () => {
    expect(
      rewrittenPortfolioCategoryDestination(
        "/personal-area/students/portfolio/demo-student-1/therapy"
      )
    ).toEqual({
      pathname: `/personal-area/students/folder/demo-student-1/${encodeFolderParam('תח"י')}`,
      search: "",
    });
  });

  it("rewrites the students/category alias to the folder route", () => {
    expect(
      rewrittenStudentsCategoryAliasDestination(
        "/personal-area/students/category/demo-student-1/general-info"
      )
    ).toEqual({
      pathname: `/personal-area/students/folder/demo-student-1/${encodeFolderParam("אינפורמציה כללית")}`,
      search: "",
    });
  });

  it("redirects the legacy pfolder alias URL to folder", () => {
    expect(
      rewrittenLegacyPfolderCategoryDestination(
        "/personal-area/students/pfolder/demo-student-1/therapy"
      )
    ).toEqual({
      pathname: `/personal-area/students/folder/demo-student-1/${encodeFolderParam('תח"י')}`,
      search: "",
    });
  });
});

describe("rewrittenClassNameDestination", () => {
  it("moves a Hebrew class segment to the name query", () => {
    expect(
      rewrittenClassNameDestination(
        "/personal-area/category/special-ed-class/class/איידי/"
      )
    ).toEqual({
      pathname: "/personal-area/category/special-ed-class/class",
      search: "?name=%D7%90%D7%99%D7%99%D7%93%D7%99",
    });
  });

  it("keeps mode after stripping the class segment", () => {
    expect(
      rewrittenClassNameDestination(
        "/personal-area/category/special-ed-class/class/איידי/mode/curriculum"
      )
    ).toEqual({
      pathname: "/personal-area/category/special-ed-class/mode/curriculum",
      search: "?name=%D7%90%D7%99%D7%99%D7%93%D7%99",
    });
  });

  it("does not rewrite the query-style class page", () => {
    expect(
      rewrittenClassNameDestination(
        "/personal-area/category/special-ed-class/class",
        "?name=איידי"
      )
    ).toBeNull();
  });
});

describe("rewrittenBrokenClassModeDestination", () => {
  it("moves /class/mode/X to /mode/X", () => {
    expect(
      rewrittenBrokenClassModeDestination(
        "/personal-area/category/special-ed-class/class/mode/curriculum",
        "?name=%D7%90%D7%99%D7%99%D7%93%D7%99"
      )
    ).toEqual({
      pathname: "/personal-area/category/special-ed-class/mode/curriculum",
      search: "?name=%D7%90%D7%99%D7%99%D7%93%D7%99",
    });
  });
});

describe("rewrittenClassModeAliasDestination", () => {
  it("moves /class-mode/student to the working /mode/student route", () => {
    expect(
      rewrittenClassModeAliasDestination(
        "/personal-area/category/special-ed-class/class-mode/student",
        "?name=%D7%9B%D7%99%D7%AA%D7%94"
      )
    ).toEqual({
      pathname: "/personal-area/category/special-ed-class/mode/student",
      search: "?name=%D7%9B%D7%99%D7%AA%D7%94",
    });
  });

  it("moves a dangling /class-mode index to /class", () => {
    expect(
      rewrittenClassModeAliasDestination(
        "/personal-area/category/special-ed-class/class-mode",
        "?name=%D7%9B%D7%99%D7%AA%D7%94"
      )
    ).toEqual({
      pathname: "/personal-area/category/special-ed-class/class",
      search: "?name=%D7%9B%D7%99%D7%AA%D7%94",
    });
  });
});
