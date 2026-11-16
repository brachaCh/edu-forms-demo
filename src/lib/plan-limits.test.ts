import { describe, expect, it, vi } from "vitest";
import type { Student } from "@/lib/supabase/types";
import {
  checkClassCreateAllowed,
  checkStudentWriteAllowed,
  countPlanUsage,
  formatClassQuotaMessage,
  planAllowsSpecialEdClasses,
  planLimitErrorMessage,
  resolvePlanLimits,
  SPECIAL_ED_STUDENTS_PER_CLASS,
} from "./plan-limits";

function student(
  id: string,
  overrides: Partial<Student> = {}
): Student {
  return {
    id,
    institution_id: "inst-1",
    category: "schools",
    full_name: `תלמיד ${id}`,
    phone: null,
    father_name: null,
    mother_name: null,
    status: "integration",
    class_name: null,
    teacher_name: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("plan-limits", () => {
  it("counts integration portfolios and combined portfolio files", () => {
    const usage = countPlanUsage([
      student("1", { status: "integration" }),
      student("2", { status: "integration" }),
      student("3", { status: "personal-basket" }),
    ]);
    expect(usage.integrationPortfolios).toBe(2);
    expect(usage.personalBaskets).toBe(1);
    expect(usage.portfolioFiles).toBe(3);
  });

  it("excludes archived students from plan usage", () => {
    const usage = countPlanUsage([
      student("1", { status: "integration" }),
      student("2", {
        status: "integration",
        archived_at: "2026-01-01T00:00:00.000Z",
      }),
      student("3", {
        status: "personal-basket",
        archived_at: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(usage.integrationPortfolios).toBe(1);
    expect(usage.personalBaskets).toBe(0);
  });

  it("blocks integration portfolios above plan limit", () => {
    const students = Array.from({ length: 60 }, (_, index) =>
      student(`s-${index}`, { status: "integration" })
    );
    const violation = checkStudentWriteAllowed({
      planId: "plan-1",
      students,
      student: { status: "integration", category: "schools", full_name: "חדש" },
    });
    expect(violation?.kind).toBe("integration_portfolios");
    expect(violation?.limit).toBe(60);
  });

  it("counts personal baskets toward the same portfolio quota", () => {
    const students = [
      ...Array.from({ length: 30 }, (_, index) =>
        student(`i-${index}`, { status: "integration" })
      ),
      ...Array.from({ length: 30 }, (_, index) =>
        student(`p-${index}`, { status: "personal-basket" })
      ),
    ];
    const violation = checkStudentWriteAllowed({
      planId: "plan-1",
      students,
      student: {
        status: "personal-basket",
        category: "schools",
        full_name: "חדש",
      },
    });
    expect(violation?.kind).toBe("integration_portfolios");
    expect(violation?.limit).toBe(60);
    expect(violation?.current).toBe(60);
  });

  it("blocks personal basket when plan does not include it", () => {
    const violation = checkStudentWriteAllowed({
      planId: "plan-3",
      students: [],
      student: {
        status: "personal-basket",
        category: "schools",
        full_name: "חדש",
      },
    });
    expect(violation?.kind).toBe("personal_baskets");
  });

  it("allows updating an existing integration student when the portfolio quota is already full", () => {
    const students = Array.from({ length: 60 }, (_, index) =>
      student(`s-${index}`, { status: "integration" })
    );
    const violation = checkStudentWriteAllowed({
      planId: "plan-1",
      students,
      existingStudentId: "s-0",
      student: {
        status: "integration",
        category: "schools",
        full_name: "שם שעודכן מהטופס",
      },
    });
    expect(violation).toBeNull();
  });

  it("allows updating an existing personal-basket student when the plan does not sell new baskets", () => {
    const existing = student("pb-1", { status: "personal-basket" });
    const violation = checkStudentWriteAllowed({
      planId: "plan-3",
      students: [existing],
      existingStudentId: "pb-1",
      student: {
        status: "personal-basket",
        category: "schools",
        full_name: "שם שעודכן מהטופס",
      },
    });
    expect(violation).toBeNull();
  });

  it("blocks students above special-ed class portfolio limit", () => {
    const students = Array.from({ length: 17 }, (_, index) =>
      student(`s-${index}`, { status: "special-ed-class", class_name: "א" })
    );
    const violation = checkStudentWriteAllowed({
      planId: "plan-3",
      students,
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "חדש",
      },
    });
    expect(violation?.kind).toBe("students");
    expect(violation?.limit).toBe(17);
  });

  it("derives class quota from student-only special-ed plans", () => {
    const limits = resolvePlanLimits("plan-3");
    expect(limits?.students).toBe(17);
    expect(limits?.classes).toBe(1);
  });

  it("derives student quota from class count in static plans", () => {
    const limits = resolvePlanLimits("plan-7");
    expect(limits?.classes).toBe(5);
    expect(limits?.students).toBe(5 * SPECIAL_ED_STUDENTS_PER_CLASS);
  });

  it("reads quotas encoded on a SUMIT plan id", () => {
    const limits = resolvePlanLimits("sumit:2286563778:c5");
    expect(limits?.classes).toBe(5);
    expect(limits?.students).toBe(5 * SPECIAL_ED_STUDENTS_PER_CLASS);
  });

  it("maps custom limits for regular education", () => {
    const limits = resolvePlanLimits(
      "plan-custom",
      { classes: 2, students: 4 },
      "regular"
    );
    expect(limits?.classes).toBe(2);
    expect(limits?.students).toBe(2 * SPECIAL_ED_STUDENTS_PER_CLASS);
    expect(limits?.integrationPortfolios).toBe(4);
    expect(limits?.personalBaskets).toBe(true);
  });

  it("maps custom limits for special education without portfolio quota", () => {
    const limits = resolvePlanLimits(
      "plan-custom",
      { classes: 2, students: 4 },
      "special"
    );
    expect(limits?.classes).toBe(2);
    expect(limits?.students).toBe(2 * SPECIAL_ED_STUDENTS_PER_CLASS);
    expect(limits?.integrationPortfolios).toBeUndefined();
    expect(limits?.personalBaskets).toBeUndefined();
  });

  it("blocks integration and personal-basket portfolios on custom regular plan", () => {
    const students = [
      ...Array.from({ length: 3 }, (_, index) =>
        student(`i-${index}`, { status: "integration" })
      ),
      student("pb-1", { status: "personal-basket" }),
    ];
    const violation = checkStudentWriteAllowed({
      planId: "plan-custom",
      educationFramework: "regular",
      planCustomClasses: 2,
      planCustomStudents: 4,
      students,
      student: { status: "integration", category: "schools", full_name: "חדש" },
    });
    expect(violation?.kind).toBe("integration_portfolios");
    expect(violation?.limit).toBe(4);
    expect(violation?.current).toBe(4);
  });

  it("blocks special-ed students above classes x 17 on custom plan", () => {
    const students = Array.from({ length: 34 }, (_, index) =>
      student(`s-${index}`, { status: "special-ed-class", class_name: "א" })
    );
    const violation = checkStudentWriteAllowed({
      planId: "plan-custom",
      educationFramework: "regular",
      planCustomClasses: 2,
      planCustomStudents: 4,
      students,
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "חדש",
      },
    });
    expect(violation?.kind).toBe("students");
    expect(violation?.limit).toBe(34);
  });

  it("blocks students above derived class quota", () => {
    const students = Array.from({ length: 85 }, (_, index) =>
      student(`s-${index}`, { status: "special-ed-class", class_name: "א" })
    );
    const violation = checkStudentWriteAllowed({
      planId: "plan-7",
      students,
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "חדש",
      },
    });
    expect(violation?.kind).toBe("students");
    expect(violation?.limit).toBe(85);
  });

  it("blocks the 18th special-ed student in the same class (students_per_class)", () => {
    const students = Array.from({ length: SPECIAL_ED_STUDENTS_PER_CLASS }, (_, index) =>
      student(`s-${index}`, { status: "special-ed-class", class_name: "א" })
    );
    const violation = checkStudentWriteAllowed({
      planId: "plan-7",
      students,
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "חדש",
      },
    });
    expect(violation?.kind).toBe("students_per_class");
    expect(violation?.limit).toBe(SPECIAL_ED_STUDENTS_PER_CLASS);
    expect(violation?.current).toBe(SPECIAL_ED_STUDENTS_PER_CLASS);
  });

  it("allows a new special-ed student in another class when one class is full", () => {
    const students = Array.from({ length: SPECIAL_ED_STUDENTS_PER_CLASS }, (_, index) =>
      student(`s-${index}`, { status: "special-ed-class", class_name: "א" })
    );
    const violation = checkStudentWriteAllowed({
      planId: "plan-7",
      students,
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "ב",
        full_name: "חדש",
      },
    });
    expect(violation).toBeNull();
  });

  it("allows the 17th special-ed student in a class", () => {
    const students = Array.from(
      { length: SPECIAL_ED_STUDENTS_PER_CLASS - 1 },
      (_, index) =>
        student(`s-${index}`, { status: "special-ed-class", class_name: "א" })
    );
    const violation = checkStudentWriteAllowed({
      planId: "plan-7",
      students,
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "חדש",
      },
    });
    expect(violation).toBeNull();
  });

  it("formats students_per_class error message", () => {
    expect(
      planLimitErrorMessage({
        kind: "students_per_class",
        limit: SPECIAL_ED_STUDENTS_PER_CLASS,
        current: SPECIAL_ED_STUDENTS_PER_CLASS,
      })
    ).toBe(
      `בכיתה קטנה מותרים עד ${SPECIAL_ED_STUDENTS_PER_CLASS} תלמידים (כרגע ${SPECIAL_ED_STUDENTS_PER_CLASS}).`
    );
  });

  it("does not treat regular integration-only packages as including special-ed classes", () => {
    expect(planAllowsSpecialEdClasses("plan-1")).toBe(false);
    expect(planAllowsSpecialEdClasses("plan-2")).toBe(false);
    expect(
      planAllowsSpecialEdClasses(
        "plan-custom",
        { classes: 0, students: 20 },
        "regular"
      )
    ).toBe(false);
  });

  it("treats packages with class quota or derived class quota as including special-ed classes", () => {
    expect(planAllowsSpecialEdClasses("plan-3")).toBe(true);
    expect(planAllowsSpecialEdClasses("plan-4")).toBe(true);
    expect(planAllowsSpecialEdClasses("plan-7")).toBe(true);
    expect(planAllowsSpecialEdClasses("plan-12")).toBe(true);
    expect(planAllowsSpecialEdClasses("sumit:2286563778:c5")).toBe(true);
    expect(
      planAllowsSpecialEdClasses(
        "plan-custom",
        { classes: 2, students: 4 },
        "regular"
      )
    ).toBe(true);
  });

  it("allows an unknown plan id and logs a warning instead of locking the school out", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(planAllowsSpecialEdClasses("plan-legacy-unknown")).toBe(true);
    expect(
      checkStudentWriteAllowed({
        planId: "plan-legacy-unknown",
        students: [],
        student: {
          status: "special-ed-class",
          category: "schools",
          class_name: "א",
          full_name: "חדש",
        },
      })
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("allows a missing plan id the same way as an unresolved plan", () => {
    expect(planAllowsSpecialEdClasses(null)).toBe(true);
    expect(planAllowsSpecialEdClasses(undefined)).toBe(true);
  });

  it("does not hide entitlement for a custom plan with no saved class count — existing writes stay allowed", () => {
    const existing = student("se-1", {
      status: "special-ed-class",
      class_name: "א",
    });
    expect(
      planAllowsSpecialEdClasses("plan-custom", { classes: null, students: 20 })
    ).toBe(false);
    const violation = checkStudentWriteAllowed({
      planId: "plan-custom",
      planCustomClasses: null,
      planCustomStudents: 20,
      students: [existing],
      existingStudentId: "se-1",
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "שם שעודכן",
      },
    });
    expect(violation).toBeNull();
  });

  it("blocks creating a special-ed student when the package has no class quota", () => {
    const violation = checkStudentWriteAllowed({
      planId: "plan-1",
      students: [],
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "חדש",
      },
    });
    expect(violation?.kind).toBe("classes");
    expect(violation?.limit).toBe(0);
  });

  it("denies moving an integration student into special-ed status on plan-1", () => {
    const existing = student("int-1", { status: "integration" });
    const violation = checkStudentWriteAllowed({
      planId: "plan-1",
      students: [existing],
      existingStudentId: "int-1",
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "הועבר לחנ״מ",
      },
    });
    expect(violation?.kind).toBe("classes");
    expect(violation?.limit).toBe(0);
  });

  it("allows updating an existing special-ed student when the package no longer includes classes", () => {
    const existing = student("se-1", {
      status: "special-ed-class",
      class_name: "א",
    });
    const violation = checkStudentWriteAllowed({
      planId: "plan-1",
      students: [existing],
      existingStudentId: "se-1",
      student: {
        status: "special-ed-class",
        category: "schools",
        class_name: "א",
        full_name: "שם שעודכן",
      },
    });
    expect(violation).toBeNull();
  });

  it("blocks creating a new special-ed class when the package has no class quota", () => {
    const violation = checkClassCreateAllowed({
      planId: "plan-1",
      students: [],
      className: "א",
    });
    expect(violation?.kind).toBe("classes");
    expect(violation?.limit).toBe(0);
  });

  it("does not block regular integration students on a package without special-ed classes", () => {
    const violation = checkStudentWriteAllowed({
      planId: "plan-1",
      students: [],
      student: {
        status: "integration",
        category: "schools",
        full_name: "חדש",
      },
    });
    expect(violation).toBeNull();
  });

  it("formats missing special-ed class entitlement message", () => {
    expect(
      planLimitErrorMessage({
        kind: "classes",
        limit: 0,
        current: 0,
      })
    ).toBe("החבילה שנבחרה אינה כוללת כיתות חינוך מיוחד.");
  });

  it("counts equivalent Hebrew class names as one special-ed class", () => {
    const usage = countPlanUsage([
      student("1", {
        status: "special-ed-class",
        class_name: "כיתה ד׳",
      }),
      student("2", { status: "special-ed-class", class_name: "ד" }),
      student("3", { status: "special-ed-class", class_name: "ד'" }),
      student("4", { status: "integration", class_name: "ה" }),
    ]);
    expect(usage.classes).toBe(1);
    expect(usage.students).toBe(3);
  });

  it("does not count the injected placeholder class name toward the quota", () => {
    expect(countPlanUsage([], "schools", ["כיתה"]).classes).toBe(0);
    expect(
      checkClassCreateAllowed({
        planId: "plan-3",
        students: [],
        className: "ד",
        knownClassNames: ["כיתה"],
      })
    ).toBeNull();
  });

  it("does not count a deleted/archived class leftover in knownClassNames", () => {
    const archived = student("archived-1", {
      status: "special-ed-class",
      class_name: "איידי",
      archived_at: "2026-10-20T00:00:00.000Z",
    });
    expect(countPlanUsage([archived], "schools", ["איידי"]).classes).toBe(0);
    expect(
      checkClassCreateAllowed({
        planId: "plan-3",
        students: [archived],
        className: "ד",
        knownClassNames: ["איידי"],
      })
    ).toBeNull();
  });

  it("counts an empty named class that still has a curriculum owner", () => {
    const owner = student("owner-1", {
      status: "special-ed-class",
      class_name: "איידי",
      teacher_name: "איידי",
      notes: "__matoah_class_curriculum__",
      full_name: 'תל"כ — איידי',
    });
    expect(countPlanUsage([owner], "schools", ["איידי"]).classes).toBe(1);
    const violation = checkClassCreateAllowed({
      planId: "plan-3",
      students: [owner],
      className: "ד",
      knownClassNames: ["איידי"],
    });
    expect(violation?.kind).toBe("classes");
    expect(violation?.limit).toBe(1);
  });

  it("treats an existing כיתה ד׳ as the same class as Excel ד", () => {
    const existing = student("owner", {
      status: "special-ed-class",
      class_name: "כיתה ד׳",
      teacher_name: "כיתה ד׳",
    });
    expect(
      checkClassCreateAllowed({
        planId: "plan-3",
        students: [existing],
        className: "ד",
        knownClassNames: ["כיתה ד׳"],
      })
    ).toBeNull();
    expect(
      checkStudentWriteAllowed({
        planId: "plan-3",
        students: [existing],
        student: {
          status: "special-ed-class",
          category: "schools",
          class_name: "ד",
          full_name: "חדש",
        },
        knownClassNames: ["כיתה ד׳"],
      })
    ).toBeNull();
  });

  it("still blocks a truly new class when the package already has its one class", () => {
    const existing = student("owner", {
      status: "special-ed-class",
      class_name: "א",
    });
    const violation = checkClassCreateAllowed({
      planId: "plan-3",
      students: [existing],
      className: "ד",
      knownClassNames: ["א"],
    });
    expect(violation?.kind).toBe("classes");
    expect(violation?.limit).toBe(1);
    expect(
      formatClassQuotaMessage(violation!, {
        existingClassNames: ["א"],
        requestedClassName: "ד",
      })
    ).toContain("הכיתות הקיימות: א");
  });

  it("blocks new special-ed class above plan limit", () => {
    const violation = checkClassCreateAllowed({
      planId: "plan-4",
      students: [
        student("owner", {
          status: "special-ed-class",
          class_name: "א",
          teacher_name: "א",
        }),
      ],
      className: "ב",
      knownClassNames: ["א"],
    });
    expect(violation?.kind).toBe("classes");
    expect(violation?.limit).toBe(1);
  });

  it("counts kindergarten gardens by class name", () => {
    const usage = countPlanUsage(
      [
        student("1", {
          category: "kindergartens",
          status: "integration",
          class_name: "גן א",
        }),
        student("2", {
          category: "kindergartens",
          status: "integration",
          class_name: "גן ב",
        }),
      ],
      "kindergartens"
    );
    expect(usage.classes).toBe(2);
  });
});
