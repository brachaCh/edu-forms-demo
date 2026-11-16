import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractClassStudentRows,
  buildClassStudentListDataFromRoster,
  importStudentsFromClassCurriculum,
  syncClassStudentListFromRoster,
  CLASS_STUDENTS_TABLE_ID,
} from "@/lib/class-curriculum-import";
import { tableCellKey, tableRowCountKey } from "@/lib/form-table-grids";
import * as mockStore from "@/lib/mock-store";
import type { Student } from "@/lib/supabase/types";

vi.mock("@/lib/mock-store", async () => {
  const actual = await vi.importActual<typeof mockStore>("@/lib/mock-store");
  return {
    ...actual,
    getStudents: vi.fn(() => []),
    saveStudent: vi.fn((s) => Promise.resolve({ ...s, id: s.id ?? "new-id" })),
    loadStudentFormFill: vi.fn(() => Promise.resolve(null)),
    saveStudentFormFill: vi.fn(() => Promise.resolve()),
  };
});

describe("extractClassStudentRows", () => {
  it("reads named rows and skips blanks/duplicates", () => {
    const data: Record<string, string> = {
      [tableRowCountKey(CLASS_STUDENTS_TABLE_ID)]: "4",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "name")]: "יוסי כהן",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "characterization")]:
        "לקויות למידה",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "functioning")]: "מתקדם",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 1, "name")]: "",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 2, "name")]: "נועה לוי",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 2, "characterization")]: "",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 2, "functioning")]: "",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 3, "name")]: "יוסי כהן",
    };

    expect(extractClassStudentRows(data)).toEqual([
      {
        full_name: "יוסי כהן",
        characterization: "לקויות למידה",
        functioning: "מתקדם",
        id_number: null,
      },
      {
        full_name: "נועה לוי",
        characterization: "",
        functioning: "",
        id_number: null,
      },
    ]);
  });

  it("reads ת.ז. when the table cell is present", () => {
    const data: Record<string, string> = {
      [tableRowCountKey(CLASS_STUDENTS_TABLE_ID)]: "1",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "name")]: "יוסי כהן",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "id_number")]: "123456789",
    };
    expect(extractClassStudentRows(data)).toEqual([
      {
        full_name: "יוסי כהן",
        characterization: "",
        functioning: "",
        id_number: "123456789",
      },
    ]);
  });
});

describe("buildClassStudentListDataFromRoster", () => {
  it("fills names from roster and keeps prior characterization", () => {
    const existing: Record<string, string> = {
      [tableRowCountKey(CLASS_STUDENTS_TABLE_ID)]: "1",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "name")]: "יוסי כהן",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "characterization")]:
        "לקויות למידה",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "functioning")]: "מתקדם",
      school_year: "תשפ״ו",
    };

    const students = [
      {
        id: "1",
        full_name: "יוסי כהן",
        notes: null,
      },
      {
        id: "2",
        full_name: "דנה לוי",
        notes: "אפיון: ADHD\nתפקוד: משתפר",
      },
      {
        id: "3",
        full_name: "רון דוד",
        characterization: "מוגבלות שכלית",
        notes: null,
      },
    ] as Student[];

    const data = buildClassStudentListDataFromRoster({
      className: "כיתה א",
      students,
      existingData: existing,
    });

    expect(data.class_name).toBe("כיתה א");
    expect(data.school_year).toBe("תשפ״ו");
    expect(extractClassStudentRows(data)).toEqual([
      {
        full_name: "יוסי כהן",
        characterization: "לקויות למידה",
        functioning: "מתקדם",
        id_number: null,
      },
      {
        full_name: "דנה לוי",
        characterization: "ADHD",
        functioning: "משתפר",
        id_number: null,
      },
      {
        full_name: "רון דוד",
        characterization: "מוגבלות שכלית",
        functioning: "",
        id_number: null,
      },
    ]);
  });

  it("keeps form-only names when the class roster is empty", () => {
    const existing: Record<string, string> = {
      [tableRowCountKey(CLASS_STUDENTS_TABLE_ID)]: "2",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "name")]: "אליהו",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "characterization")]: "אפיון",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 1, "name")]: "נועה",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 1, "functioning")]: "תפקוד",
    };

    const data = buildClassStudentListDataFromRoster({
      className: "כיתה",
      students: [],
      existingData: existing,
    });

    expect(extractClassStudentRows(data)).toEqual([
      {
        full_name: "אליהו",
        characterization: "אפיון",
        functioning: "",
        id_number: null,
      },
      {
        full_name: "נועה",
        characterization: "",
        functioning: "תפקוד",
        id_number: null,
      },
    ]);
  });

  it("appends form-only names after roster students", () => {
    const existing: Record<string, string> = {
      [tableRowCountKey(CLASS_STUDENTS_TABLE_ID)]: "2",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 0, "name")]: "יוסי",
      [tableCellKey(CLASS_STUDENTS_TABLE_ID, 1, "name")]: "רק בטופס",
    };

    const data = buildClassStudentListDataFromRoster({
      className: "כיתה",
      students: [{ id: "1", full_name: "יוסי", notes: null } as Student],
      existingData: existing,
    });

    expect(extractClassStudentRows(data).map((row) => row.full_name)).toEqual([
      "יוסי",
      "רק בטופס",
    ]);
  });
});

describe("importStudentsFromClassCurriculum", () => {
  const baseStudent = (
    id: string,
    full_name: string,
    class_name: string,
    id_number?: string | null
  ): Student => ({
    id,
    institution_id: null,
    category: "schools",
    full_name,
    phone: null,
    father_name: null,
    mother_name: null,
    status: "special-ed-class",
    class_name,
    teacher_name: null,
    notes: null,
    id_number: id_number ?? null,
    created_at: "",
    updated_at: "",
  });

  beforeEach(() => {
    vi.mocked(mockStore.saveStudent).mockClear();
  });

  it("TZ-209: does not create a duplicate when the name already exists in another class", async () => {
    vi.mocked(mockStore.getStudents).mockReturnValue([
      baseStudent("in-d2", "יעל כהן", "ד2"),
      baseStudent("in-d2b", "רועי לוי", "ד2"),
    ]);

    const result = await importStudentsFromClassCurriculum({
      category: "schools",
      className: "ג2",
      teacherName: "ג2",
      rows: [
        {
          full_name: "יעל כהן",
          characterization: "",
          functioning: "",
          class_name: "ג2",
          duplicate: false,
        },
        {
          full_name: "רועי לוי",
          characterization: "",
          functioning: "",
          class_name: "ג2",
          duplicate: false,
        },
        {
          full_name: "תלמיד חדש",
          characterization: "",
          functioning: "",
          class_name: "ג2",
          duplicate: false,
        },
      ],
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(2);
    expect(mockStore.saveStudent).toHaveBeenCalledTimes(1);
    expect(mockStore.saveStudent).toHaveBeenCalledWith(
      expect.objectContaining({ id_number: null })
    );
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("יעל כהן");
    expect(result.warnings[0]).toContain("ד2");
  });

  it("matches by ת.ז. before name when id_number is provided", async () => {
    vi.mocked(mockStore.getStudents).mockReturnValue([
      baseStudent("by-id", "שם שונה בכרטיס", "ד2", "123456789"),
    ]);

    const result = await importStudentsFromClassCurriculum({
      category: "schools",
      className: "ג2",
      rows: [
        {
          full_name: "יעל כהן",
          id_number: "123456789",
          characterization: "",
          functioning: "",
          class_name: "ג2",
          duplicate: false,
        },
      ],
    });

    expect(result.created).toBe(0);
    expect(result.warnings[0]).toContain("ד2");
    expect(mockStore.saveStudent).not.toHaveBeenCalled();
  });

  it("persists ת.ז. from roster rows on create", async () => {
  vi.mocked(mockStore.getStudents).mockReturnValue([]);

    await importStudentsFromClassCurriculum({
      category: "schools",
      className: "ג2",
      rows: [
        {
          full_name: "תלמיד חדש",
          id_number: "987654321",
          characterization: "",
          functioning: "",
          class_name: "ג2",
          duplicate: false,
        },
      ],
    });

    expect(mockStore.saveStudent).toHaveBeenCalledWith(
      expect.objectContaining({ id_number: "987654321" })
    );
  });
});

describe("syncClassStudentListFromRoster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates class curriculum owner and syncs form when class has students", async () => {
    const students: Student[] = [
      {
        id: "s1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד א",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "כיתה א",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    vi.mocked(mockStore.getStudents).mockReturnValue(students);

    const data = await syncClassStudentListFromRoster({
      category: "schools",
      className: "כיתה א",
      teacherName: "מורה",
    });

    expect(mockStore.saveStudentFormFill).toHaveBeenCalled();
    expect(data.class_name).toBe("כיתה א");
    expect(extractClassStudentRows(data)).toHaveLength(1);
    expect(extractClassStudentRows(data)[0].full_name).toBe("תלמיד א");
  });

  it("syncs empty form when no students in class", async () => {
    vi.mocked(mockStore.getStudents).mockReturnValue([]);

    const data = await syncClassStudentListFromRoster({
      category: "schools",
      className: "כיתה ריקה",
    });

    expect(mockStore.saveStudentFormFill).toHaveBeenCalled();
    expect(extractClassStudentRows(data)).toHaveLength(0);
  });

  it("preserves teacherName in sync", async () => {
    vi.mocked(mockStore.getStudents).mockReturnValue([]);

    const data = await syncClassStudentListFromRoster({
      category: "schools",
      className: "כיתה",
      teacherName: "שרה כהן",
    });

    expect(data.teacher_name).toBe("שרה כהן");
  });
});
