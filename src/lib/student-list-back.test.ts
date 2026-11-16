import { describe, expect, it } from "vitest";
import {
  resolveStudentsListBackHref,
  studentListHrefFromStudent,
  studentsListBackLabelPath,
} from "./student-list-back";
import type { Student } from "./supabase/types";

function student(partial: Partial<Student>): Student {
  return {
    id: "abc",
    institution_id: "inst",
    category: "schools",
    full_name: "תלמיד בדיקה",
    phone: null,
    father_name: null,
    mother_name: null,
    status: "integration",
    class_name: null,
    teacher_name: null,
    notes: null,
    ...partial,
  } as Student;
}

describe("studentListHrefFromStudent", () => {
  it("returns the special-ed class student list, preserving the class", () => {
    const href = studentListHrefFromStudent(
      student({
        status: "special-ed-class",
        class_name: "איידי",
      })
    );
    expect(href).toContain("special-ed-class");
    expect(href).toContain("mode/student");
    expect(href).toContain("name=");
    expect(href).toContain(encodeURIComponent("איידי"));
  });

  it("returns the personal-basket frequency list", () => {
    expect(
      studentListHrefFromStudent(
        student({ status: "personal-basket", integration_frequency: "low" })
      )
    ).toContain("/frequency/low");
  });

  it("returns the integration status list", () => {
    expect(studentListHrefFromStudent(student({ status: "integration" }))).toBe(
      "/personal-area/sector/schools/framework/special/status/integration"
    );
  });
});

describe("resolveStudentsListBackHref", () => {
  const classList =
    "/personal-area/category/special-ed-class/mode/student?name=איידי";
  const staffRoster = "/personal-area/category/integration-teacher";

  it("prefers the list the user came from, including class query", () => {
    expect(
      resolveStudentsListBackHref({
        from: classList,
        stored: staffRoster,
        student: student({ status: "special-ed-class", class_name: "איידי" }),
      })
    ).toBe(classList);
  });

  it("does not use a staff roster when viewing a regular student (TZ-21)", () => {
    expect(
      resolveStudentsListBackHref({
        from: staffRoster,
        stored: staffRoster,
        student: student({ status: "integration" }),
      })
    ).toBe(
      "/personal-area/sector/schools/framework/special/status/integration"
    );
  });

  it("skips a student-file from and uses the stored list", () => {
    expect(
      resolveStudentsListBackHref({
        from: "/personal-area/students/view/abc",
        stored: classList,
        student: student({ status: "special-ed-class", class_name: "איידי" }),
      })
    ).toBe(classList);
  });

  it("does not offer a students-list back on a staff card without a list from", () => {
    expect(
      resolveStudentsListBackHref({
        student: student({ status: "integration-teacher" }),
      })
    ).toBeNull();
  });

  it("does not use a stored class A list when viewing a class B student", () => {
    const classA =
      "/personal-area/category/special-ed-class/mode/student?name=כיתהא";
    const classBStudent = student({
      status: "special-ed-class",
      class_name: "כיתהב",
    });
    expect(
      resolveStudentsListBackHref({
        stored: classA,
        student: classBStudent,
      })
    ).toBe(studentListHrefFromStudent(classBStudent));
    expect(studentListHrefFromStudent(classBStudent)).toContain(
      encodeURIComponent("כיתהב")
    );
  });

  it("honors an explicit from list even if it is a different class", () => {
    const classA =
      "/personal-area/category/special-ed-class/mode/student?name=כיתהא";
    expect(
      resolveStudentsListBackHref({
        from: classA,
        student: student({ status: "special-ed-class", class_name: "כיתהב" }),
      })
    ).toBe(classA);
  });

  it("does not treat /integration-teacher/teacher without a name as a student list (TZ-69)", () => {
    const namelessTeacher =
      "/personal-area/category/integration-teacher/teacher";
    const specialEd = student({
      status: "special-ed-class",
      class_name: "איידי",
    });
    expect(
      resolveStudentsListBackHref({
        from: namelessTeacher,
        stored: namelessTeacher,
        student: specialEd,
      })
    ).toBe(studentListHrefFromStudent(specialEd));
  });

  it("keeps a staff roster only for a staff card that came from it", () => {
    expect(
      resolveStudentsListBackHref({
        from: staffRoster,
        student: student({ status: "integration-teacher" }),
      })
    ).toBe(staffRoster);
  });
});

describe("studentsListBackLabelPath", () => {
  const staffRoster = "/personal-area/category/integration-teacher";

  it("uses the students-list label on student pages", () => {
    expect(
      studentsListBackLabelPath({
        href: "/personal-area/category/special-ed-class/mode/student?name=א",
        student: student({ status: "special-ed-class" }),
      })
    ).toBe("personalArea.backToStudentsList");
  });

  it("uses the staff-list label on staff cards and staff roster hrefs (TZ-69)", () => {
    expect(
      studentsListBackLabelPath({
        href: staffRoster,
        student: student({ status: "integration-teacher" }),
      })
    ).toBe("status.backToStaffList");
    expect(studentsListBackLabelPath({ href: staffRoster })).toBe(
      "status.backToStaffList"
    );
  });
});
