import { describe, expect, it } from "vitest";
import {
  fillPageUrlFromParam,
  fillStudentsListBackLabelPath,
  isStudentFillHref,
  resolveFillFolderBackHref,
  resolveFillStudentsListBackHref,
} from "./student-fill-back";
import { studentPortfolioFillHref } from "./form-schemas";
import { studentPortfolioHref } from "./student-portfolio";
import type { Student } from "./supabase/types";

function student(partial: Partial<Student>): Student {
  return {
    id: "2c04593e-a58f-4fd1-b9d9-26be1f4eaf94",
    institution_id: "inst",
    category: "schools",
    full_name: "תלמיד בדיקה",
    phone: null,
    father_name: null,
    mother_name: null,
    status: "personal-basket",
    class_name: null,
    teacher_name: null,
    notes: null,
    integration_frequency: "high",
    ...partial,
  } as Student;
}

const studentId = "2c04593e-a58f-4fd1-b9d9-26be1f4eaf94";

describe("resolveFillFolderBackHref", () => {
  it("falls back to the student portfolio (folders) when from is missing", () => {
    expect(resolveFillFolderBackHref({ studentId })).toBe(
      studentPortfolioHref(studentId)
    );
  });

  it("honors a same-student folder from= (TZ-72 / TZ-38)", () => {
    const folder = `/personal-area/students/folder/${studentId}/אינפורמציה כללית`;
    expect(
      resolveFillFolderBackHref({
        from: `/personal-area/students/folder/${studentId}/${encodeURIComponent("אינפורמציה כללית")}`,
        studentId,
      })
    ).toBe(folder);
  });

  it("does not use the next fill form as back-to-folders", () => {
    const nextForm = `/personal-area/students/fill/${studentId}/student-team-details?from=${encodeURIComponent(`/personal-area/students/folder/${studentId}`)}`;
    expect(
      resolveFillFolderBackHref({
        from: nextForm,
        studentId,
        currentHref: `/personal-area/students/fill/${studentId}/personal-basket-card`,
      })
    ).toBe(studentPortfolioHref(studentId));
  });

  it("does not no-op on a same-page from=", () => {
    const current = `/personal-area/students/fill/${studentId}/personal-basket-card`;
    expect(
      resolveFillFolderBackHref({
        from: current,
        studentId,
        currentHref: current,
      })
    ).toBe(studentPortfolioHref(studentId));
  });

  it("ignores a student-list from= for the folders link", () => {
    expect(
      resolveFillFolderBackHref({
        from: "/personal-area/category/personal-basket/frequency/high",
        studentId,
      })
    ).toBe(studentPortfolioHref(studentId));
  });
});

describe("resolveFillStudentsListBackHref / labels", () => {
  it("returns the personal-basket students list, not a staff roster", () => {
    const href = resolveFillStudentsListBackHref({
      from: `/personal-area/students/folder/${studentId}/x`,
      stored: "/personal-area/category/integration-teacher",
      student: student({ status: "personal-basket" }),
    });
    expect(href).toContain("personal-basket");
    expect(href).not.toContain("integration-teacher");
  });

  it("uses the students-list label on student fill pages (TZ-69 / TZ-72)", () => {
    expect(
      fillStudentsListBackLabelPath({
        href: "/personal-area/category/personal-basket/frequency/high",
        student: student({ status: "personal-basket" }),
      })
    ).toBe("personalArea.backToStudentsList");
  });

  it("keeps the staff-list label on staff fill pages", () => {
    expect(
      fillStudentsListBackLabelPath({
        href: "/personal-area/category/integration-teacher",
        student: student({ status: "integration-teacher" }),
      })
    ).toBe("status.backToStaffList");
  });

  it("preserves a filtered students-list from= on autosave URL rewrite", () => {
    const list = "/personal-area/category/personal-basket/frequency/high";
    const folder = studentPortfolioHref(studentId);
    const from = fillPageUrlFromParam({
      originalFrom: list,
      folderBackHref: folder,
    });
    expect(from).toBe(list);
    const href = studentPortfolioFillHref(studentId, "personal-basket-card", from, {
      fillId: "fill-1",
    });
    expect(href).toContain(`from=${encodeURIComponent(list)}`);
    expect(href).not.toContain(`from=${encodeURIComponent(folder)}`);
    expect(
      resolveFillStudentsListBackHref({
        from,
        student: student({ status: "personal-basket" }),
      })
    ).toBe(list);
  });

  it("classifies fill hrefs", () => {
    expect(
      isStudentFillHref(`/personal-area/students/fill/${studentId}/personal-basket-card`)
    ).toBe(true);
    expect(
      isStudentFillHref(`/personal-area/students/folder/${studentId}/x`)
    ).toBe(false);
  });
});
