/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import type { Student } from "@/lib/supabase/types";
import { countPlanUsage } from "./plan-limits";
import { parseStudentImportFile } from "./student-excel-import";

const students: Student[] = [];
const saveStudent = vi.fn(async (payload: Partial<Student>) => {
  const created = {
    id: `id-${students.length + 1}`,
    institution_id: null,
    category: payload.category ?? "schools",
    full_name: payload.full_name ?? "",
    phone: null,
    father_name: null,
    mother_name: null,
    status: payload.status ?? "special-ed-class",
    class_name: payload.class_name ?? null,
    teacher_name: payload.teacher_name ?? null,
    notes: payload.notes ?? null,
    id_number: null,
    birth_date: null,
    gender: null,
    home_address: null,
    city: null,
    father_mobile: null,
    mother_mobile: null,
    email: null,
    integration_frequency: null,
    calendar_year: null,
    archived_at: null,
    created_at: "",
    updated_at: "",
  } as Student;
  students.push(created);
  return created;
});

vi.mock("@/lib/mock-store", () => ({
  getStudents: () => students,
  getUser: () => null,
  saveStudent: (payload: Partial<Student>) => saveStudent(payload),
  deleteStudent: async (id: string) => {
    const index = students.findIndex((s) => s.id === id);
    if (index >= 0) students.splice(index, 1);
  },
}));

import {
  addSpecialEdClass,
  archiveSpecialEdClass,
  canonicalSpecialEdClassName,
  fallbackSpecialEdClassWhenQuotaBlocks,
  deleteSpecialEdClassWithStudents,
  findClassCurriculumOwner,
  findClassCurriculumOwnerInList,
  forgetSpecialEdClassName,
  getKnownSpecialEdClassNames,
  listStudentsInSpecialEdClass,
  normalizeSpecialEdClassName,
  rememberSpecialEdClassName,
  resolveSpecialEdImportClassAssignment,
  removeEmptySpecialEdClass,
  specialEdClassMatchKey,
  studentMatchesSpecialEdClass,
  uniqueSpecialEdClassNames,
} from "./special-ed-classes";

const KNOWN_CLASSES_STORAGE_KEY = "matoah.special-ed-classes.schools";

function specialEdStudent(
  id: string,
  className: string,
  overrides: Partial<Student> = {}
): Student {
  return {
    id,
    institution_id: null,
    category: "schools",
    full_name: `תלמיד ${id}`,
    status: "special-ed-class",
    class_name: className,
    teacher_name: null,
    notes: null,
    archived_at: null,
    ...overrides,
  } as Student;
}

describe("special-ed-classes", () => {
  beforeEach(() => {
    students.length = 0;
    saveStudent.mockClear();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("normalizes empty class names to default", () => {
    expect(normalizeSpecialEdClassName("")).toBe("כיתה");
    expect(normalizeSpecialEdClassName("  א1  ")).toBe("א1");
  });

  it("matches Hebrew grade spellings for quota / import (ד vs ד׳ / כיתה ד)", () => {
    const expected = specialEdClassMatchKey("ד");
    expect(specialEdClassMatchKey("ד'")).toBe(expected);
    expect(specialEdClassMatchKey("ד׳")).toBe(expected);
    expect(specialEdClassMatchKey("ד״")).toBe(expected);
    expect(specialEdClassMatchKey("  ד  ")).toBe(expected);
    expect(specialEdClassMatchKey("כיתה ד")).toBe(expected);
    expect(specialEdClassMatchKey("כיתה ד׳")).toBe(expected);
    expect(specialEdClassMatchKey("כתה ד")).toBe(expected);
    expect(specialEdClassMatchKey("ה")).not.toBe(expected);
  });

  it("maps an Excel class name onto the existing display name", () => {
    expect(canonicalSpecialEdClassName("ד", ["כיתה ד׳"])).toBe("כיתה ד׳");
    expect(canonicalSpecialEdClassName("ד'", ["כיתה ד׳"])).toBe("כיתה ד׳");
    expect(canonicalSpecialEdClassName("ה", ["כיתה ד׳"])).toBe("ה");
  });

  it("assigns an unknown Excel class to the import target class", () => {
    expect(
      resolveSpecialEdImportClassAssignment({
        excelClassName: "ד",
        defaultClassName: "איידי",
        knownClassNames: ["איידי"],
      })
    ).toEqual({ className: "איידי", mappedFrom: "ד" });
  });

  it("ignores stale localStorage class names when deciding if Excel class exists", () => {
    expect(
      resolveSpecialEdImportClassAssignment({
        excelClassName: "ד",
        defaultClassName: "איידי",
        knownClassNames: ["ד", "איידי"],
        liveClassNames: ["איידי"],
      })
    ).toEqual({ className: "איידי", mappedFrom: "ד" });
  });

  it("keeps a matching Excel alias on the existing class (school-wide import)", () => {
    expect(
      resolveSpecialEdImportClassAssignment({
        excelClassName: "ד",
        defaultClassName: null,
        knownClassNames: ["כיתה ד׳", "איידי"],
      })
    ).toEqual({ className: "כיתה ד׳", mappedFrom: null });
  });

  it("TZ-209: multi-grade class page import keeps students on target class", () => {
    expect(
      resolveSpecialEdImportClassAssignment({
        excelClassName: "א",
        defaultClassName: "כתה א2",
        knownClassNames: ["כיתה א", "כתה א2"],
        liveClassNames: ["כיתה א", "כתה א2"],
      })
    ).toEqual({ className: "כתה א2", mappedFrom: "א" });
    expect(
      resolveSpecialEdImportClassAssignment({
        excelClassName: "ב",
        defaultClassName: "כתה א2",
        knownClassNames: ["כיתה ב", "כתה א2"],
        liveClassNames: ["כיתה ב", "כתה א2"],
      })
    ).toEqual({ className: "כתה א2", mappedFrom: "ב" });
  });

  it("TZ-209: exact Excel class name still moves to another class", () => {
    expect(
      resolveSpecialEdImportClassAssignment({
        excelClassName: "כיתה ב",
        defaultClassName: "כתה א2",
        knownClassNames: ["כיתה ב", "כתה א2"],
        liveClassNames: ["כיתה ב", "כתה א2"],
      })
    ).toEqual({ className: "כיתה ב", mappedFrom: null });
  });

  it("falls back to the single existing class when quota would block a new name", () => {
    expect(
      fallbackSpecialEdClassWhenQuotaBlocks({
        requestedClassName: "ד",
        knownClassNames: ["איידי"],
      })
    ).toBe("איידי");
    expect(
      fallbackSpecialEdClassWhenQuotaBlocks({
        requestedClassName: "ד",
        knownClassNames: ["א", "ב"],
      })
    ).toBeNull();
  });

  it("collapses equivalent spellings to the first display name", () => {
    expect(uniqueSpecialEdClassNames(["ד", "כיתה ד׳", "ד'", "ה"])).toEqual([
      "ד",
      "ה",
    ]);
  });

  it("does not inject the placeholder class when listing for quota", () => {
    expect(getKnownSpecialEdClassNames("schools")).toEqual(["כיתה"]);
    expect(
      getKnownSpecialEdClassNames("schools", { includePlaceholder: false })
    ).toEqual([]);
  });

  it("adds a class and lists it", async () => {
    const key = await addSpecialEdClass("כיתה ג׳", "schools");
    expect(key).toBe("כיתה ג׳");
    expect(getKnownSpecialEdClassNames("schools")).toContain("כיתה ג׳");
    expect(saveStudent).toHaveBeenCalled();
  });

  it("removes an empty class from the list", async () => {
    await addSpecialEdClass("בבברכי", "schools");
    expect(getKnownSpecialEdClassNames("schools")).toContain("בבברכי");
    const removed = await removeEmptySpecialEdClass("בבברכי", "schools");
    expect(removed).toBe(true);
    expect(getKnownSpecialEdClassNames("schools")).not.toContain("בבברכי");
  });

  it("prunes storage-only sample grade «ד» once a live class has students", async () => {
    window.localStorage.setItem(
      KNOWN_CLASSES_STORAGE_KEY,
      JSON.stringify(["ד"])
    );
    await addSpecialEdClass("כיתה א", "schools");
    students.push(specialEdStudent("live-a", "כיתה א"));

    expect(getKnownSpecialEdClassNames("schools", { includePlaceholder: false })).toEqual([
      "כיתה א",
    ]);
  });

  it("keeps an empty registered class in known names when another class has students", async () => {
    await addSpecialEdClass("כיתה א", "schools");
    await addSpecialEdClass("כיתה ב", "schools");
    students.push(specialEdStudent("live-a", "כיתה א"));

    const names = getKnownSpecialEdClassNames("schools", {
      includePlaceholder: false,
    });
    expect(names).toContain("כיתה א");
    expect(names).toContain("כיתה ב");
  });

  it("matches students across Hebrew class-name variants", () => {
    const student = {
      status: "special-ed-class",
      class_name: "ד",
      teacher_name: null,
      notes: null,
      full_name: "דנה",
    } as Student;
    expect(studentMatchesSpecialEdClass(student, "כיתה ד׳")).toBe(true);
    expect(studentMatchesSpecialEdClass(student, "ד'")).toBe(true);
    expect(studentMatchesSpecialEdClass(student, "ה")).toBe(false);
  });

  it("matches students to class including default empty", () => {
    const student = {
      status: "special-ed-class",
      class_name: null,
      teacher_name: null,
      notes: null,
      full_name: "דנה",
    } as Student;
    expect(studentMatchesSpecialEdClass(student, "כיתה")).toBe(true);
    expect(studentMatchesSpecialEdClass(student, "א1")).toBe(false);
  });

  it("finds a class curriculum owner in a provided list", () => {
    const owner = {
      status: "special-ed-class",
      class_name: "א1",
      teacher_name: "א1",
      notes: "__matoah_class_curriculum__",
      full_name: 'תל"כ — א1',
      category: "schools",
    } as Student;
    const roster = {
      status: "special-ed-class",
      class_name: "א1",
      teacher_name: "רחל",
      notes: null,
      full_name: "נועה",
      category: "schools",
    } as Student;
    expect(findClassCurriculumOwnerInList([owner, roster], "א1", "schools")).toBe(
      owner
    );
    expect(
      findClassCurriculumOwnerInList([roster], "א1", "schools")
    ).toBeUndefined();
  });

  it("excludes archived students from getKnownSpecialEdClassNames", async () => {
    await addSpecialEdClass("כיתה א", "schools");
    students.push({
      id: "archived-student",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד בארכיון",
      status: "special-ed-class",
      class_name: "כיתה ב",
      teacher_name: null,
      notes: null,
      archived_at: "2026-01-01T00:00:00.000Z",
    } as Student);
    const names = getKnownSpecialEdClassNames("schools");
    expect(names).toContain("כיתה א");
    expect(names).not.toContain("כיתה ב");
  });

  it("unifies list/remember/delete/add by match key so aliases cannot split quota", async () => {
    window.localStorage.setItem(
      KNOWN_CLASSES_STORAGE_KEY,
      JSON.stringify(["ד", "כיתה ד׳", "כתה ד"])
    );

    expect(getKnownSpecialEdClassNames("schools")).toEqual(["ד"]);
    expect(
      getKnownSpecialEdClassNames("schools", { includePlaceholder: false })
    ).toEqual(["ד"]);

    rememberSpecialEdClassName("כיתה ד׳", "schools");
    expect(getKnownSpecialEdClassNames("schools")).toEqual(["ד"]);

    const added = await addSpecialEdClass("כיתה ד׳", "schools");
    expect(added).toBe("ד");
    expect(saveStudent).toHaveBeenCalledTimes(1);
    expect(getKnownSpecialEdClassNames("schools")).toEqual(["ד"]);

    students.push(specialEdStudent("alias-student-1", "ד"));
    students.push(specialEdStudent("alias-student-2", "כיתה ד׳"));

    expect(listStudentsInSpecialEdClass("ד", "schools")).toHaveLength(2);
    expect(listStudentsInSpecialEdClass("כיתה ד׳", "schools")).toHaveLength(2);

    const mockDelete = vi.fn(async (id: string) => {
      const index = students.findIndex((s) => s.id === id);
      if (index >= 0) students.splice(index, 1);
    });

    const result = await deleteSpecialEdClassWithStudents("כיתה ד׳", "schools", {
      deleteStudent: mockDelete,
    });

    expect(result.ok).toBe(true);
    expect(listStudentsInSpecialEdClass("ד", "schools")).toHaveLength(0);
    expect(
      getKnownSpecialEdClassNames("schools", { includePlaceholder: false })
    ).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(KNOWN_CLASSES_STORAGE_KEY) ?? "[]")).toEqual(
      []
    );
    expect(
      countPlanUsage(
        students,
        "schools",
        getKnownSpecialEdClassNames("schools")
      ).classes
    ).toBe(0);

    forgetSpecialEdClassName("ד", "schools");
    window.localStorage.setItem(
      KNOWN_CLASSES_STORAGE_KEY,
      JSON.stringify(["כיתה ד׳", "ד"])
    );
    forgetSpecialEdClassName("ד", "schools");
    expect(
      getKnownSpecialEdClassNames("schools", { includePlaceholder: false })
    ).toEqual([]);
  });
});

describe("deleteSpecialEdClassWithStudents", () => {
  beforeEach(() => {
    students.length = 0;
    saveStudent.mockClear();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("deletes all students and owner on full success", async () => {
    await addSpecialEdClass("כיתה ג", "schools");
    students.push({
      id: "student-1",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד 1",
      status: "special-ed-class",
      class_name: "כיתה ג",
      teacher_name: null,
      notes: null,
      archived_at: null,
    } as Student);
    students.push({
      id: "student-2",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד 2",
      status: "special-ed-class",
      class_name: "כיתה ג",
      teacher_name: null,
      notes: null,
      archived_at: null,
    } as Student);

    expect(listStudentsInSpecialEdClass("כיתה ג", "schools")).toHaveLength(2);
    expect(findClassCurriculumOwner("כיתה ג", "schools")).toBeDefined();

    const mockDelete = vi.fn(async (id: string) => {
      const index = students.findIndex((s) => s.id === id);
      if (index >= 0) students.splice(index, 1);
    });

    const result = await deleteSpecialEdClassWithStudents("כיתה ג", "schools", {
      deleteStudent: mockDelete,
    });

    expect(result.ok).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(3);
    expect(listStudentsInSpecialEdClass("כיתה ג", "schools")).toHaveLength(0);
    expect(findClassCurriculumOwner("כיתה ג", "schools")).toBeUndefined();
    expect(getKnownSpecialEdClassNames("schools")).not.toContain("כיתה ג");
  });

  it("does NOT delete owner or forget class on partial failure", async () => {
    await addSpecialEdClass("כיתה ד", "schools");
    students.push({
      id: "student-ok",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד שנמחק",
      status: "special-ed-class",
      class_name: "כיתה ד",
      teacher_name: null,
      notes: null,
      archived_at: null,
    } as Student);
    students.push({
      id: "student-fail",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד שנכשל",
      status: "special-ed-class",
      class_name: "כיתה ד",
      teacher_name: null,
      notes: null,
      archived_at: null,
    } as Student);

    const mockDelete = vi.fn(async (id: string) => {
      if (id === "student-fail") throw new Error("delete failed");
      const index = students.findIndex((s) => s.id === id);
      if (index >= 0) students.splice(index, 1);
    });

    const result = await deleteSpecialEdClassWithStudents("כיתה ד", "schools", {
      deleteStudent: mockDelete,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures).toContain("תלמיד שנכשל");
    }
    expect(findClassCurriculumOwner("כיתה ד", "schools")).toBeDefined();
    expect(getKnownSpecialEdClassNames("schools")).toContain("כיתה ד");
  });
});

describe("archiveSpecialEdClass", () => {
  beforeEach(() => {
    students.length = 0;
    saveStudent.mockClear();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("archives all students and deletes owner on full success", async () => {
    await addSpecialEdClass("כיתה ה", "schools");
    students.push({
      id: "student-archive-1",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד לארכיון",
      status: "special-ed-class",
      class_name: "כיתה ה",
      teacher_name: null,
      notes: null,
      archived_at: null,
    } as Student);

    const mockDelete = vi.fn(async (id: string) => {
      const index = students.findIndex((s) => s.id === id);
      if (index >= 0) students.splice(index, 1);
    });
    const mockArchive = vi.fn(async (student: Student) => {
      student.archived_at = new Date().toISOString();
      return { ok: true };
    });

    const result = await archiveSpecialEdClass("כיתה ה", "schools", {
      deleteStudent: mockDelete,
      archiveStudentFile: mockArchive,
    });

    expect(result.ok).toBe(true);
    expect(mockArchive).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(findClassCurriculumOwner("כיתה ה", "schools")).toBeUndefined();
    expect(getKnownSpecialEdClassNames("schools")).not.toContain("כיתה ה");
  });

  it("does NOT delete owner or forget class on partial archive failure", async () => {
    await addSpecialEdClass("כיתה ו", "schools");
    students.push({
      id: "student-archive-ok",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד שעבר",
      status: "special-ed-class",
      class_name: "כיתה ו",
      teacher_name: null,
      notes: null,
      archived_at: null,
    } as Student);
    students.push({
      id: "student-archive-fail",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד שנכשל",
      status: "special-ed-class",
      class_name: "כיתה ו",
      teacher_name: null,
      notes: null,
      archived_at: null,
    } as Student);

    const mockDelete = vi.fn(async (id: string) => {
      const index = students.findIndex((s) => s.id === id);
      if (index >= 0) students.splice(index, 1);
    });
    const mockArchive = vi.fn(async (student: Student) => {
      if (student.id === "student-archive-fail") return { ok: false };
      student.archived_at = new Date().toISOString();
      return { ok: true };
    });

    const result = await archiveSpecialEdClass("כיתה ו", "schools", {
      deleteStudent: mockDelete,
      archiveStudentFile: mockArchive,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures).toContain("תלמיד שנכשל");
    }
    expect(mockDelete).not.toHaveBeenCalled();
    expect(findClassCurriculumOwner("כיתה ו", "schools")).toBeDefined();
    expect(getKnownSpecialEdClassNames("schools")).toContain("כיתה ו");
  });

  it("archived class does not reappear in getKnownSpecialEdClassNames after full archive", async () => {
    await addSpecialEdClass("כיתה ז", "schools");
    students.push({
      id: "student-full-archive",
      institution_id: null,
      category: "schools",
      full_name: "תלמיד מלא",
      status: "special-ed-class",
      class_name: "כיתה ז",
      teacher_name: null,
      notes: null,
      archived_at: null,
    } as Student);

    expect(getKnownSpecialEdClassNames("schools")).toContain("כיתה ז");

    const mockDelete = vi.fn(async (id: string) => {
      const index = students.findIndex((s) => s.id === id);
      if (index >= 0) students.splice(index, 1);
    });
    const mockArchive = vi.fn(async (student: Student) => {
      student.archived_at = new Date().toISOString();
      return { ok: true };
    });

    const result = await archiveSpecialEdClass("כיתה ז", "schools", {
      deleteStudent: mockDelete,
      archiveStudentFile: mockArchive,
    });

    expect(result.ok).toBe(true);
    expect(getKnownSpecialEdClassNames("schools")).not.toContain("כיתה ז");
  });
});

async function importWorkbookBuffer(
  rows: Record<string, unknown>[]
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("תלמידים");
  const headers = Object.keys(rows[0] ?? {});
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((header) => row[header] ?? ""));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("parseStudentImportFile with getKnownSpecialEdClassNames", () => {
  beforeEach(() => {
    students.length = 0;
    saveStudent.mockClear();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("keeps Excel class ב when א has live students and ב is an empty registered class", async () => {
    await addSpecialEdClass("כיתה א", "schools");
    await addSpecialEdClass("כיתה ב", "schools");
    students.push(specialEdStudent("roster-a", "כיתה א"));

    const data = await importWorkbookBuffer([
      { "שם מלא": "תלמיד חדש ב", כיתה: "כיתה ב" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: students,
      knownClassNames: getKnownSpecialEdClassNames("schools", {
        includePlaceholder: false,
      }),
      defaultClassName: "כיתה א",
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("כיתה ב");
    expect(result.rows[0].classMappedFrom).toBeNull();
  });
});
