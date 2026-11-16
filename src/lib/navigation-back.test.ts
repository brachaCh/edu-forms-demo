import { describe, expect, it } from "vitest";
import {
  ancestorHref,
  hrefPathOnly,
  hrefWithFrom,
  hrefWithSearch,
  isPublicEntryHref,
  isSafeInternalHref,
  isStaffRosterHref,
  isStudentFileHref,
  isStudentListHref,
  nestedNavFrom,
  parentHref,
  parseSafeFromParam,
  previousInAppHistory,
  readNavBackHref,
  recordInAppHistory,
  rememberNavBackHref,
  resolveBackHref,
  resolveDistinctHeaderBackHref,
  resolveHeaderBackHref,
  sameNavHref,
  sameNavLocation,
  sanitizeBackHrefForSession,
  storedListFromForPath,
  withPreservedSectorContext,
  clearNavSession,
} from "./navigation-back";

describe("parentHref", () => {
  it("returns fallback at root", () => {
    expect(parentHref("/")).toBe("/");
    expect(parentHref("")).toBe("/");
  });

  it("strips a single leaf segment", () => {
    expect(parentHref("/dashboard")).toBe("/");
    expect(parentHref("/personal-area")).toBe("/");
    expect(parentHref("/admin/texts")).toBe("/admin");
    expect(parentHref("/personal-area/students/new")).toBe(
      "/personal-area"
    );
    expect(parentHref("/dashboard/tutorials")).toBe("/");
  });

  it("strips paired key/value segments together", () => {
    expect(
      parentHref(
        "/dashboard/school/framework/elem/status/inclusion"
      )
    ).toBe("/dashboard/school/framework/elem");

    expect(
      parentHref(
        "/personal-area/sector/school/framework/elem/status/special-ed-class/mode/tlk/teacher/dana"
      )
    ).toBe(
      "/personal-area/sector/school/framework/elem/status/special-ed-class/mode/tlk"
    );

    expect(parentHref("/personal-area/sector/school")).toBe("/personal-area");
    expect(parentHref("/personal-area/sector-table/schools/regular")).toBe(
      "/personal-area/sector-home/schools"
    );
    expect(parentHref("/personal-area/sector-home/schools")).toBe(
      "/personal-area"
    );
    expect(parentHref("/personal-area/category/inclusion")).toBe(
      "/personal-area"
    );
    expect(
      parentHref("/personal-area/category/integration-teacher/teacher")
    ).toBe("/personal-area/category/integration-teacher");
  });

  it("handles portfolio fill/forms/view routes", () => {
    expect(
      parentHref("/personal-area/students/portfolio/abc/fill/form-1")
    ).toBe("/personal-area/students/portfolio/abc");

    expect(parentHref("/personal-area/students/fill/abc/form-1")).toBe(
      "/personal-area/students/portfolio/abc"
    );

    expect(
      parentHref("/personal-area/students/portfolio/abc/forms/folder")
    ).toBe("/personal-area/students/portfolio/abc");

    expect(parentHref("/personal-area/students/forms/abc/folder")).toBe(
      "/personal-area/students/portfolio/abc"
    );

    expect(
      parentHref("/personal-area/students/portfolio/abc/therapy")
    ).toBe("/personal-area/students/portfolio/abc");

    expect(parentHref("/personal-area/students/category/abc/therapy")).toBe(
      "/personal-area/students/portfolio/abc"
    );

    expect(parentHref("/personal-area/students/view/abc")).toBe(
      "/personal-area"
    );

    expect(parentHref("/personal-area/students/portfolio/abc")).toBe(
      "/personal-area/students/view/abc"
    );

    expect(parentHref("/personal-area/students/abc")).toBe(
      "/personal-area/students/view/abc"
    );

    expect(parentHref("/personal-area/students")).toBe("/personal-area");
  });

  it("strips special-ed class/[name] together (avoids /class 404)", () => {
    expect(
      parentHref(
        "/personal-area/sector/schools/framework/special/status/special-ed-class/class/%D7%9B%D7%99%D7%AA%D7%94/mode/student"
      )
    ).toBe(
      "/personal-area/sector/schools/framework/special/status/special-ed-class/class/%D7%9B%D7%99%D7%AA%D7%94"
    );

    expect(
      parentHref(
        "/personal-area/sector/schools/framework/special/status/special-ed-class/class/כיתה"
      )
    ).toBe(
      "/personal-area/sector/schools/framework/special/status/special-ed-class"
    );
  });
});

describe("ancestorHref", () => {
  it("climbs multiple levels", () => {
    const path =
      "/dashboard/school/framework/elem/status/inclusion/frequency/high";
    expect(ancestorHref(path, 1)).toBe(
      "/dashboard/school/framework/elem/status/inclusion"
    );
    expect(ancestorHref(path, 2)).toBe("/dashboard/school/framework/elem");
    expect(ancestorHref(path, 3)).toBe("/dashboard/school");
    expect(ancestorHref(path, 4)).toBe("/dashboard");
    expect(ancestorHref(path, 5)).toBe("/");
  });
});

describe("resolveBackHref", () => {
  it("returns from origin for tutorials instead of dashboard sector picker", () => {
    expect(
      resolveBackHref({
        pathname: "/dashboard/tutorials",
        levels: 1,
        from: "/",
      })
    ).toBe("/");

    expect(
      resolveBackHref({
        pathname: "/dashboard/tutorials",
        levels: 1,
        from: "/personal-area",
      })
    ).toBe("/personal-area");

    expect(
      resolveBackHref({
        pathname: "/dashboard/tutorials",
        levels: 1,
        from: "/dashboard",
      })
    ).toBe("/dashboard");

    expect(
      resolveBackHref({
        pathname: "/dashboard/tutorials",
        levels: 1,
      })
    ).toBe("/");
  });

  it("climbs architecture first inside portfolio (does not skip to from)", () => {
    expect(
      resolveBackHref({
        pathname: "/personal-area/students/portfolio/abc/fill/x",
        levels: 1,
        from: "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א/mode/student",
      })
    ).toBe("/personal-area/students/portfolio/abc");

    expect(
      resolveBackHref({
        pathname: "/personal-area/students/fill/abc/x",
        levels: 1,
        from: "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א/mode/student",
      })
    ).toBe("/personal-area/students/portfolio/abc");

    expect(
      resolveBackHref({
        pathname: "/personal-area/students/portfolio/abc/forms/folder",
        levels: 1,
        from: "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א/mode/student",
      })
    ).toBe("/personal-area/students/portfolio/abc");

    expect(
      resolveBackHref({
        pathname: "/personal-area/students/forms/abc/folder",
        levels: 1,
        from: "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א/mode/student",
      })
    ).toBe("/personal-area/students/portfolio/abc");
  });

  it("returns to the same-student folder that opened the fill page", () => {
    const folder =
      "/personal-area/students/category/abc/therapy";
    expect(
      resolveBackHref({
        pathname: "/personal-area/students/fill/abc/accommodations",
        levels: 1,
        from: folder,
      })
    ).toBe(folder);

    expect(
      resolveBackHref({
        pathname:
          "/personal-area/students/fill/abc/waiver-confidentiality",
        levels: 1,
        from: "/personal-area/students/category/abc/general-info",
      })
    ).toBe("/personal-area/students/category/abc/general-info");
  });

  it("returns from תל\"כ to the curriculum page instead of the student portfolio", () => {
    const tlk =
      "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א/mode/curriculum";
    expect(
      resolveBackHref({
        pathname: "/personal-area/students/fill/abc/weekly-schedule",
        levels: 1,
        from: tlk,
      })
    ).toBe(tlk);

    expect(
      resolveBackHref({
        pathname: "/personal-area/students/portfolio/abc/custom/schedules",
        levels: 1,
        from: tlk,
      })
    ).toBe(tlk);

    expect(
      resolveBackHref({
        pathname: "/personal-area/students/portfolio/abc/forms/folder",
        levels: 1,
        from: tlk,
      })
    ).toBe(tlk);
  });

  it("uses from when leaving student card would land on personal-area", () => {
    const list =
      "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א/mode/student";
    expect(
      resolveBackHref({
        pathname: "/personal-area/students/view/abc",
        levels: 1,
        from: list,
      })
    ).toBe(list);
  });

  it("ignores unsafe from values", () => {
    expect(
      resolveBackHref({
        pathname: "/dashboard/school",
        levels: 1,
        from: "https://evil.example",
      })
    ).toBe("/dashboard");

    expect(
      resolveBackHref({
        pathname: "/dashboard/school",
        levels: 1,
        from: "//evil.example",
      })
    ).toBe("/dashboard");
  });

  it("climbs special-ed hierarchy by architecture", () => {
    expect(
      resolveBackHref({
        pathname:
          "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א/mode/student",
        levels: 1,
      })
    ).toBe(
      "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א"
    );

    expect(
      resolveBackHref({
        pathname:
          "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א",
        levels: 1,
      })
    ).toBe(
      "/personal-area/sector/schools/framework/special/status/special-ed-class"
    );
  });

  it("climbs rewritten class-mode paths without leaving a dangling class-mode", () => {
    expect(
      parentHref(
        "/personal-area/category/special-ed-class/class-mode/curriculum"
      )
    ).toBe("/personal-area/category/special-ed-class/class");

    expect(
      resolveBackHref({
        pathname:
          "/personal-area/category/special-ed-class/class-mode/curriculum",
        levels: 1,
        search: "name=איידי",
      })
    ).toBe(
      "/personal-area/category/special-ed-class/class?name=%D7%90%D7%99%D7%99%D7%93%D7%99"
    );

    expect(
      resolveBackHref({
        pathname: "/personal-area/category/special-ed-class/class-mode/student",
        levels: 1,
        search: "name=%D7%90&sector=schools&framework=special",
      })
    ).toBe(
      "/personal-area/category/special-ed-class/class?name=%D7%90&sector=schools&framework=special"
    );

    expect(
      resolveBackHref({
        pathname: "/personal-area/category/special-ed-class/mode/student",
        levels: 1,
        search: "name=%D7%9B%D7%99%D7%AA%D7%94",
      })
    ).toBe(
      "/personal-area/category/special-ed-class/class?name=%D7%9B%D7%99%D7%AA%D7%94"
    );
  });
});

describe("nestedNavFrom", () => {
  it("keeps תל\"כ as from when opening fill from forms", () => {
    const tlk =
      "/personal-area/sector/schools/framework/special/status/special-ed-class/class/א/mode/curriculum";
    const forms =
      "/personal-area/students/forms/abc/%D7%AA%D7%9C%22%D7%9B";
    expect(nestedNavFrom(forms, tlk)).toBe(tlk);
  });

  it("keeps rewritten curriculum ?name= in from", () => {
    const tlk =
      "/personal-area/category/special-ed-class/class/mode/curriculum?name=איידי";
    const forms = "/personal-area/students/forms/abc/folder";
    expect(nestedNavFrom(forms, tlk)).toBe(tlk);
  });

  it("uses forms pathname when outer back is the student portfolio", () => {
    const portfolio = "/personal-area/students/portfolio/abc";
    const forms = "/personal-area/students/forms/abc/folder";
    expect(nestedNavFrom(forms, portfolio)).toBe(forms);
  });
});

describe("hrefWithSearch", () => {
  it("preserves class name query on rewritten curriculum paths", () => {
    expect(
      hrefWithSearch(
        "/personal-area/category/special-ed-class/class/mode/curriculum",
        "name=איידי"
      )
    ).toBe(
      "/personal-area/category/special-ed-class/class/mode/curriculum?name=איידי"
    );
    expect(
      hrefWithSearch(
        "/personal-area/category/special-ed-class/class/mode/curriculum",
        ""
      )
    ).toBe("/personal-area/category/special-ed-class/class/mode/curriculum");
  });
});

describe("isSafeInternalHref", () => {
  it("allows only same-origin relative paths", () => {
    expect(isSafeInternalHref("/a/b")).toBe(true);
    expect(isSafeInternalHref("/a?x=1")).toBe(true);
    expect(isSafeInternalHref("https://x")).toBe(false);
    expect(isSafeInternalHref("//x")).toBe(false);
    expect(isSafeInternalHref("a/b")).toBe(false);
  });

  it("rejects backslash and control-character open redirects", () => {
    expect(isSafeInternalHref("/\\evil.com")).toBe(false);
    expect(isSafeInternalHref("/%5Cevil.com")).toBe(false);
    expect(isSafeInternalHref("/\t/evil.com")).toBe(false);
    expect(isSafeInternalHref("/\n/evil.com")).toBe(false);
    expect(isSafeInternalHref("/\r/evil.com")).toBe(false);
  });
});

describe("parseSafeFromParam", () => {
  it("accepts decoded and encoded internal paths", () => {
    expect(parseSafeFromParam("/personal-area/students")).toBe(
      "/personal-area/students"
    );
    expect(
      parseSafeFromParam(encodeURIComponent("/personal-area/students"))
    ).toBe("/personal-area/students");
  });

  it("rejects unsafe values without throwing", () => {
    expect(parseSafeFromParam("https://evil.example")).toBeNull();
    expect(parseSafeFromParam("%E0%A4%A")).toBeNull();
  });

  it("rejects encoded backslash from= end to end", () => {
    const from = new URLSearchParams("from=%2F%5Cevil.com").get("from");
    expect(from).toBe("/\\evil.com");
    expect(parseSafeFromParam(from)).toBeNull();
    expect(parseSafeFromParam("%2F%5Cevil.com")).toBeNull();
    expect(
      resolveBackHref({
        pathname: "/dashboard/school",
        levels: 1,
        from,
      })
    ).toBe("/dashboard");
    expect(
      resolveHeaderBackHref({
        pathname: "/personal-area/students/view/abc",
        from,
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");
  });
});

describe("hrefWithFrom", () => {
  it("appends from query", () => {
    expect(hrefWithFrom("/a/b", "/list")).toBe(
      `/a/b?from=${encodeURIComponent("/list")}`
    );
  });
});

describe("public entry and list hrefs", () => {
  it("treats / and /dashboard as the public category picker", () => {
    expect(isPublicEntryHref("/")).toBe(true);
    expect(isPublicEntryHref("/dashboard")).toBe(true);
    expect(isPublicEntryHref("/dashboard/schools")).toBe(false);
    expect(isPublicEntryHref("/personal-area")).toBe(false);
    expect(hrefPathOnly("/dashboard/?x=1")).toBe("/dashboard");
  });

  it("classifies student lists vs staff roster vs student file", () => {
    expect(
      isStudentListHref(
        "/personal-area/sector/schools/framework/special/status/integration/class/א/mode/student"
      )
    ).toBe(true);
    expect(
      isStudentListHref(
        "/personal-area/category/special-ed-class/mode/student?name=איידי"
      )
    ).toBe(true);
    expect(isStudentListHref("/personal-area/archive")).toBe(true);
    expect(
      isStaffRosterHref("/personal-area/category/integration-teacher")
    ).toBe(true);
    expect(
      isStudentListHref("/personal-area/category/integration-teacher")
    ).toBe(false);
    expect(
      isStaffRosterHref("/personal-area/category/integration-teacher/teacher")
    ).toBe(true);
    expect(
      isStudentListHref("/personal-area/category/integration-teacher/teacher")
    ).toBe(false);
    expect(
      isStaffRosterHref(
        "/personal-area/category/integration-teacher/teacher?name=דנה"
      )
    ).toBe(false);
    expect(
      isStudentListHref(
        "/personal-area/category/integration-teacher/teacher?name=דנה"
      )
    ).toBe(true);
    expect(isStudentFileHref("/personal-area/students/view/abc")).toBe(true);
    expect(isStudentFileHref("/personal-area/students/new")).toBe(false);
  });
});

describe("sanitizeBackHrefForSession", () => {
  it("never sends a logged-in user to / or /dashboard", () => {
    expect(sanitizeBackHrefForSession("/", true)).toBe("/personal-area");
    expect(sanitizeBackHrefForSession("/dashboard", true)).toBe(
      "/personal-area"
    );
    expect(sanitizeBackHrefForSession("/login", true)).toBe("/personal-area");
    expect(sanitizeBackHrefForSession("/dashboard/schools", true)).toBe(
      "/dashboard/schools"
    );
  });

  it("uses the institution profile as the logged-in home when provided (TZ-96)", () => {
    const profileHref = "/personal-area/sector-table/schools/special";
    expect(sanitizeBackHrefForSession("/", true, profileHref)).toBe(profileHref);
    expect(sanitizeBackHrefForSession("/dashboard", true, profileHref)).toBe(
      profileHref
    );
    expect(
      resolveHeaderBackHref({
        pathname: "/dashboard",
        treatAsLoggedIn: true,
        loggedInHomeHref: profileHref,
      })
    ).toBe(profileHref);
    expect(
      resolveHeaderBackHref({
        pathname: "/dashboard/tutorials",
        from: "/",
        treatAsLoggedIn: true,
        loggedInHomeHref: profileHref,
      })
    ).toBe(profileHref);
  });

  it("keeps public entry pages for guests", () => {
    expect(sanitizeBackHrefForSession("/", false)).toBe("/");
    expect(sanitizeBackHrefForSession("/dashboard", false)).toBe("/dashboard");
  });
});

describe("resolveHeaderBackHref", () => {
  const studentList =
    "/personal-area/category/special-ed-class/mode/student?name=א";
  const staffRoster = "/personal-area/category/integration-teacher";

  it("keeps TZ-21: student card returns to the student list from=", () => {
    expect(
      resolveHeaderBackHref({
        pathname: "/personal-area/students/view/abc",
        from: studentList,
        treatAsLoggedIn: true,
      })
    ).toBe(studentList);
  });

  it("uses the previous in-app page instead of climbing to /dashboard", () => {
    expect(
      resolveHeaderBackHref({
        pathname: "/dashboard/schools",
        historyPrevious: "/personal-area/sector-table/schools/special",
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area/sector-table/schools/special");
  });

  it("sends header Back on /dashboard to /personal-area for logged-in users", () => {
    expect(
      resolveHeaderBackHref({
        pathname: "/dashboard",
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");

    expect(
      resolveHeaderBackHref({
        pathname: "/dashboard",
        historyPrevious: "/dashboard/schools",
        from: "/dashboard/schools",
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");
  });

  it("does not land a logged-in user on the public category picker", () => {
    expect(
      resolveHeaderBackHref({
        pathname: "/personal-area",
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");

    expect(
      resolveHeaderBackHref({
        pathname: "/dashboard",
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");

    expect(
      resolveHeaderBackHref({
        pathname: "/admin",
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");

    expect(
      resolveHeaderBackHref({
        pathname: "/dashboard/tutorials",
        from: "/",
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");
  });

  it("keeps guest back from tutorials to the landing page", () => {
    expect(
      resolveHeaderBackHref({
        pathname: "/dashboard/tutorials",
        from: "/",
        treatAsLoggedIn: false,
      })
    ).toBe("/");
  });

  it("skips a stale stored staff roster when leaving a student file", () => {
    expect(
      storedListFromForPath(
        "/personal-area/students/view/abc",
        staffRoster
      )
    ).toBeNull();

    expect(
      resolveHeaderBackHref({
        pathname: "/personal-area/students/view/abc",
        storedFrom: staffRoster,
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");
  });

  it("uses a stored student list when architecture would lose list context", () => {
    expect(
      resolveHeaderBackHref({
        pathname: "/personal-area/students/view/abc",
        storedFrom: studentList,
        treatAsLoggedIn: true,
      })
    ).toBe(studentList);
  });

  it("sanitizes a history entry that is the public category picker", () => {
    expect(
      resolveHeaderBackHref({
        pathname: "/personal-area/setup",
        historyPrevious: "/dashboard",
        treatAsLoggedIn: true,
      })
    ).toBe("/personal-area");
  });

  it("returns the staff roster from «תלמידים המקושרים למורה», not the same /teacher path", () => {
    const teacherPage = "/personal-area/category/integration-teacher/teacher";
    const search = "?name=%D7%93%D7%A0%D7%94&sector=schools&framework=special";
    const profileHref = "/personal-area/sector-table/schools/special";

    expect(
      resolveHeaderBackHref({
        pathname: teacherPage,
        search,
        treatAsLoggedIn: true,
        loggedInHomeHref: profileHref,
      })
    ).toBe(
      "/personal-area/category/integration-teacher?sector=schools&framework=special"
    );

    expect(
      resolveDistinctHeaderBackHref({
        pathname: teacherPage,
        search,
        currentHref: `${teacherPage}${search}`,
        treatAsLoggedIn: true,
        loggedInHomeHref: profileHref,
      })
    ).toBe(
      "/personal-area/category/integration-teacher?sector=schools&framework=special"
    );
  });

  it("falls back to the institution profile when no history and architecture would stay put", () => {
    const profileHref = "/personal-area/sector-table/schools/special";
    expect(
      resolveDistinctHeaderBackHref({
        pathname: "/personal-area",
        treatAsLoggedIn: true,
        loggedInHomeHref: profileHref,
      })
    ).toBe(profileHref);

    expect(
      resolveDistinctHeaderBackHref({
        pathname: "/admin",
        treatAsLoggedIn: true,
        loggedInHomeHref: profileHref,
      })
    ).toBe(profileHref);
  });

  it("never returns the current teacher-students location as the back target", () => {
    const teacherPage = "/personal-area/category/integration-teacher/teacher";
    const current = `${teacherPage}?name=דנה`;
    const target = resolveDistinctHeaderBackHref({
      pathname: teacherPage,
      search: "?name=דנה",
      currentHref: current,
      from: current,
      historyPrevious: current,
      storedFrom: current,
      treatAsLoggedIn: true,
      loggedInHomeHref: "/personal-area/sector-table/schools/special",
    });
    expect(sameNavLocation(target, current)).toBe(false);
    expect(target).toBe("/personal-area/category/integration-teacher");
  });
});

describe("sameNavLocation", () => {
  it("treats /teacher?name= as a different screen from /teacher", () => {
    const path = "/personal-area/category/integration-teacher/teacher";
    expect(sameNavHref(`${path}?name=דנה`, path)).toBe(true);
    expect(sameNavLocation(`${path}?name=דנה`, path)).toBe(false);
    expect(sameNavLocation(`${path}?name=דנה`, `${path}?name=רחל`)).toBe(
      false
    );
    expect(sameNavLocation(`${path}?name=דנה`, `${path}?name=דנה&sector=schools`)).toBe(
      true
    );
  });
});

describe("withPreservedSectorContext", () => {
  it("keeps sector/framework when leaving a teacher-students page", () => {
    expect(
      withPreservedSectorContext(
        "/personal-area/category/integration-teacher/teacher",
        "/personal-area/category/integration-teacher",
        "?name=דנה&sector=schools&framework=special"
      )
    ).toBe(
      "/personal-area/category/integration-teacher?sector=schools&framework=special"
    );
  });
});

describe("in-app history for teacher names", () => {
  it("keeps the previous teacher-students page when only ?name= changes", () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    const previousWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window: { sessionStorage: typeof sessionStorage } }).window =
      { sessionStorage };

    try {
      const roster = "/personal-area/category/integration-teacher";
      const teacherA =
        "/personal-area/category/integration-teacher/teacher?name=דנה";
      const teacherB =
        "/personal-area/category/integration-teacher/teacher?name=רחל";
      recordInAppHistory(roster);
      recordInAppHistory(teacherA);
      expect(previousInAppHistory(teacherA)).toBe(roster);
      recordInAppHistory(teacherB);
      expect(previousInAppHistory(teacherB)).toBe(teacherA);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previousWindow;
      }
    }
  });
});

describe("clearNavSession", () => {
  it("clears the stored list and the in-app history stack", () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    const previousWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window: { sessionStorage: typeof sessionStorage } }).window =
      { sessionStorage };

    try {
      rememberNavBackHref("/personal-area/category/integration");
      recordInAppHistory("/personal-area/category/integration");
      expect(readNavBackHref()).toBe("/personal-area/category/integration");
      expect(
        previousInAppHistory("/personal-area/students/view/abc")
      ).toBe("/personal-area/category/integration");

      clearNavSession();

      expect(readNavBackHref()).toBeNull();
      expect(
        previousInAppHistory("/personal-area/students/view/abc")
      ).toBeNull();
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previousWindow;
      }
    }
  });
});
