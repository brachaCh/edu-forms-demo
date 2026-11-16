import { describe, expect, it, vi } from "vitest";
import {
  buildUpdatePatch,
  executeImport,
  formatImportOutcomeMessage,
  importWriteErrorMessage,
  resolveCreatedClassName,
  resolveEffectiveTeacherName,
  type ImportDeps,
} from "@/lib/student-excel-import-actions";
import type { ParsedImportRow } from "@/lib/student-excel-import";
import type { Student } from "@/lib/supabase/types";
import { PlanLimitError } from "@/lib/plan-limits";
import { CLASS_CURRICULUM_NOTE_MARKER } from "@/lib/special-ed-mode";

function makeRow(overrides: Partial<ParsedImportRow>): ParsedImportRow {
  return {
    rowNumber: 1,
    full_name: "תלמיד טסט",
    phone: null,
    email: null,
    father_email: null,
    mother_email: null,
    birth_date: null,
    id_number: null,
    gender: null,
    home_address: null,
    city: null,
    father_name: null,
    mother_name: null,
    father_mobile: null,
    mother_mobile: null,
    class_name: null,
    notes: null,
    teacher_name: null,
    characterization: null,
    functioning: null,
    frequency: null,
    integration_start_date: null,
    family_status: null,
    single_responsible_party: null,
    homeroom_teacher: null,
    eligibility_committee_date: null,
    education_support: null,
    additional_treatments: null,
    calendar_year: null,
    fieldWarnings: [],
    status: "ok",
    message: null,
    existingStudentId: null,
    ...overrides,
  };
}

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: "test-id",
    institution_id: null,
    category: "schools",
    full_name: "תלמיד טסט",
    phone: null,
    father_name: null,
    mother_name: null,
    status: "special-ed-class",
    class_name: null,
    teacher_name: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("resolveCreatedClassName", () => {
  it("pins special-ed creates to the class page even when the Excel cell differs", () => {
    expect(
      resolveCreatedClassName(makeRow({ class_name: "ג" }), {
        status: "special-ed-class",
        category: "schools",
        defaultClassName: "יוכי שלום",
        knownClassNames: ["יוכי שלום"],
      })
    ).toBe("יוכי שלום");
  });

  it("TZ-209: create uses exact Excel class name over the page default", () => {
    expect(
      resolveCreatedClassName(makeRow({ class_name: "כיתה ב" }), {
        status: "special-ed-class",
        category: "schools",
        defaultClassName: "כתה א2",
        knownClassNames: ["כיתה ב", "כתה א2"],
      })
    ).toBe("כיתה ב");
  });

  it("special-ed without a page class still uses the Excel / default empty «כיתה»", () => {
    expect(
      resolveCreatedClassName(makeRow({ class_name: "ד" }), {
        status: "special-ed-class",
        category: "schools",
      })
    ).toBe("ד");
    expect(
      resolveCreatedClassName(makeRow({ class_name: null }), {
        status: "special-ed-class",
        category: "schools",
      })
    ).toBe("כיתה");
  });
});

describe("importWriteErrorMessage", () => {
  it("keeps PlanLimitError Hebrew and does not turn 403 quota into «אין הרשאה»", () => {
    const violation = {
      kind: "classes" as const,
      limit: 1,
      current: 1,
    };
    expect(importWriteErrorMessage(new PlanLimitError(violation), "create")).toContain(
      "מכסת"
    );

    const api = new Error("הגעתם למכסת הכיתות/גנים בחבילה (1).");
    (api as Error & { status: number; code: string }).status = 403;
    (api as Error & { status: number; code: string }).code = "PLAN_LIMIT_EXCEEDED";
    expect(importWriteErrorMessage(api, "create")).toContain("מכסת");
  });

  it("maps English API codes to Hebrew", () => {
    const limit = new Error("PLAN_LIMIT_EXCEEDED");
    (limit as Error & { code: string }).code = "PLAN_LIMIT_EXCEEDED";
    expect(importWriteErrorMessage(limit, "create")).toBe(
      "הפעולה חורגת ממגבלות החבילה."
    );
    expect(
      importWriteErrorMessage(new Error("VALIDATION_ERROR"), "create")
    ).toContain("לא ניתן לשמור");
  });
});

describe("formatImportOutcomeMessage", () => {
  it("reports a Hebrew success count into the target class", () => {
    expect(
      formatImportOutcomeMessage(
        {
          created: 15,
          updated: 0,
          failed: 0,
          results: [],
        },
        { className: "יוכי שלום" }
      )
    ).toBe("יובאו 15 תלמידים לכיתה «יוכי שלום» בהצלחה.");
  });

  it("reports a Hebrew failure instead of a silent empty summary", () => {
    expect(
      formatImportOutcomeMessage({
        created: 0,
        updated: 0,
        failed: 15,
        results: [
          {
            rowNumber: 2,
            fullName: "תלמיד",
            outcome: "failed",
            error: "הגעתם למכסת הכיתות/גנים בחבילה (1).",
          },
        ],
      })
    ).toBe("הייבוא נכשל: הגעתם למכסת הכיתות/גנים בחבילה (1).");
  });
});

describe("resolveEffectiveTeacherName", () => {
  it("member uses staff card name, not the page teacherName prop (sync + create)", () => {
    expect(
      resolveEffectiveTeacherName({
        isAdmin: false,
        propTeacherName: null,
        memberTeacherName: "שרה כהן",
      })
    ).toBe("שרה כהן");
    expect(
      resolveEffectiveTeacherName({
        isAdmin: false,
        propTeacherName: "מורה מהעמוד",
        memberTeacherName: "שרה כהן",
      })
    ).toBe("שרה כהן");
  });

  it("member with no staff card is null so sync does not send the page prop", () => {
    expect(
      resolveEffectiveTeacherName({
        isAdmin: false,
        propTeacherName: "מורה מהעמוד",
        memberTeacherName: null,
      })
    ).toBeNull();
  });

  it("admin uses the page/class teacherName prop (SpecialEdClassPageClient roster מחנכת)", () => {
    expect(
      resolveEffectiveTeacherName({
        isAdmin: true,
        propTeacherName: "רחל מחנכת",
        memberTeacherName: "כרטיס צוות של מנהלת",
      })
    ).toBe("רחל מחנכת");
    expect(
      resolveEffectiveTeacherName({
        isAdmin: true,
        propTeacherName: null,
        memberTeacherName: "כרטיס צוות",
      })
    ).toBeNull();
  });
});

describe("buildUpdatePatch", () => {
  it("excludes status from patch", () => {
    const row = makeRow({
      full_name: "דוד כהן",
      phone: "0501111111",
      email: "test@example.com",
    });

    const patch = buildUpdatePatch(row, { canAssignTeachers: false });

    expect(patch).not.toHaveProperty("status");
    expect(patch.phone).toBe("0501111111");
    expect(patch.email).toBe("test@example.com");
  });

  it("TZ-206: fills full_name on re-import when existing lacks last name", () => {
    const row = makeRow({
      full_name: "נועה לוי",
      phone: "0501111111",
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      { full_name: "נועה", notes: null, class_name: null, characterization: null, id_number: null }
    );

    expect(patch.full_name).toBe("נועה לוי");
  });

  it("TZ-206: does not overwrite full_name when both names are complete", () => {
    const row = makeRow({
      full_name: "שם אחר לגמרי",
      phone: "0501111111",
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      {
        full_name: "דוד כהן",
        notes: null,
        class_name: null,
        characterization: null,
        id_number: null,
      }
    );

    expect(patch).not.toHaveProperty("full_name");
  });

  it("includes teacher_name only when canAssignTeachers", () => {
    const row = makeRow({
      teacher_name: "שרה כהן",
      phone: "0501111111",
    });

    const patchNonOwner = buildUpdatePatch(row, { canAssignTeachers: false });
    expect(patchNonOwner).not.toHaveProperty("teacher_name");
    expect(patchNonOwner.phone).toBe("0501111111");

    const patchOwner = buildUpdatePatch(row, { canAssignTeachers: true });
    expect(patchOwner.teacher_name).toBe("שרה כהן");
  });

  it("institution admin (canAssignTeachers=false) omits teacher_name on update", () => {
    const row = makeRow({
      teacher_name: "מורה מהאקסל",
      phone: "0501111111",
    });

    const patch = buildUpdatePatch(row, { canAssignTeachers: false });
    expect(patch).not.toHaveProperty("teacher_name");
  });

  it("normalizes class_name", () => {
    const row = makeRow({
      class_name: "  כיתה א  ",
    });

    const patch = buildUpdatePatch(row, { canAssignTeachers: false });
    expect(patch.class_name).toBe("כיתה א");
  });

  it("uses defaultClassName when row class_name is empty", () => {
    const row = makeRow({
      class_name: null,
    });

    const patch = buildUpdatePatch(row, {
      canAssignTeachers: false,
      defaultClassName: "כיתה ברירת מחדל",
    });
    expect(patch.class_name).toBe("כיתה ברירת מחדל");
  });

  it("does not overwrite existing class_name when Excel class cell is empty", () => {
    const row = makeRow({
      class_name: null,
      phone: "0501111111",
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false, defaultClassName: "כיתה מהדיאלוג" },
      { class_name: "כיתה קיימת", notes: null }
    );
    expect(patch).not.toHaveProperty("class_name");
    expect(patch.phone).toBe("0501111111");
  });

  it("TZ-209: re-import does not move student when Excel grade matches another class", () => {
    const row = makeRow({
      class_name: "כתה א2",
      id_number: "123456789",
      phone: "0509999999",
    });

    const sameClass = buildUpdatePatch(
      row,
      {
        canAssignTeachers: false,
        defaultClassName: "כתה א2",
        status: "special-ed-class",
        knownClassNames: ["כיתה א", "כתה א2"],
      },
      {
        class_name: "כתה א2",
        notes: null,
        id_number: "123456789",
      }
    );
    expect(sameClass).not.toHaveProperty("class_name");
    expect(sameClass.phone).toBe("0509999999");

    const wrongClass = buildUpdatePatch(
      makeRow({
        class_name: "א",
        id_number: "123456789",
      }),
      {
        canAssignTeachers: false,
        defaultClassName: "כתה א2",
        status: "special-ed-class",
        knownClassNames: ["כיתה א", "כתה א2"],
      },
      { class_name: "כתה א2", notes: null, id_number: "123456789" }
    );
    expect(wrongClass).not.toHaveProperty("class_name");
  });

  it("TZ-209: update moves student when Excel has exact live class name", () => {
    const patch = buildUpdatePatch(
      makeRow({
        class_name: "כיתה ב",
        id_number: "123456789",
      }),
      {
        canAssignTeachers: false,
        defaultClassName: "כתה א2",
        status: "special-ed-class",
        knownClassNames: ["כיתה ב", "כתה א2"],
      },
      { class_name: "כתה א2", notes: null, id_number: "123456789" }
    );
    expect(patch.class_name).toBe("כיתה ב");
  });

  it("empty Excel cells are omitted so they never overwrite existing values", () => {
    const row = makeRow({
      phone: null,
      email: null,
      id_number: "123456789",
      notes: null,
      characterization: null,
      functioning: null,
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      { class_name: "א1", notes: "הערות קיימות" }
    );
    expect(patch).not.toHaveProperty("phone");
    expect(patch).not.toHaveProperty("email");
    expect(patch).not.toHaveProperty("notes");
    expect(patch.id_number).toBe("123456789");
  });

  it("TZ-141: writes integration_start_date and does not overwrite when the cell is empty", () => {
    const withDate = buildUpdatePatch(
      makeRow({ integration_start_date: "2023-09-02" }),
      { canAssignTeachers: false }
    );
    expect(withDate.integration_start_date).toBe("2023-09-02");

    const empty = buildUpdatePatch(
      makeRow({ integration_start_date: null, phone: "0501111111" }),
      { canAssignTeachers: false }
    );
    expect(empty).not.toHaveProperty("integration_start_date");
    expect(empty.phone).toBe("0501111111");
  });

  it("TZ-141: writes optional card fields and omits empty cells so they never overwrite", () => {
    const withValues = buildUpdatePatch(
      makeRow({
        family_status: "גרושים",
        single_responsible_party: false,
        homeroom_teacher: "רחל",
        eligibility_committee_date: "2024-03-01",
        education_support: "מירי",
        additional_treatments: "ריפוי בעיסוק",
        calendar_year: 5787,
      }),
      { canAssignTeachers: false }
    );
    expect(withValues.family_status).toBe("גרושים");
    expect(withValues.single_responsible_party).toBe(false);
    expect(withValues.homeroom_teacher).toBe("רחל");
    expect(withValues.eligibility_committee_date).toBe("2024-03-01");
    expect(withValues.education_support).toBe("מירי");
    expect(withValues.additional_treatments).toBe("ריפוי בעיסוק");
    expect(withValues.calendar_year).toBe(5787);

    const empty = buildUpdatePatch(
      makeRow({ phone: "0501111111" }),
      { canAssignTeachers: false }
    );
    expect(empty).not.toHaveProperty("family_status");
    expect(empty).not.toHaveProperty("single_responsible_party");
    expect(empty).not.toHaveProperty("homeroom_teacher");
    expect(empty).not.toHaveProperty("eligibility_committee_date");
    expect(empty).not.toHaveProperty("education_support");
    expect(empty).not.toHaveProperty("additional_treatments");
    expect(empty).not.toHaveProperty("calendar_year");
  });

  it("writes characterization to the dedicated field, not notes", () => {
    const row = makeRow({
      characterization: "לקויות למידה",
      functioning: "מצליח בקריאה",
      notes: "הערה מהאקסל",
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      { class_name: "א1", notes: "הערות מקוריות בכרטיס" }
    );
    expect(patch.characterization).toBe("לקויות למידה");
    expect(patch.notes).toBe(
      "הערות מקוריות בכרטיס\nתפקוד: מצליח בקריאה\nהערה מהאקסל"
    );
  });

  it("moves a leftover אפיון notes line into the characterization field on re-upload", () => {
    const existingNotes = "אפיון: לקויות למידה\nהערות מקוריות";
    const row = makeRow({
      characterization: "לקויות למידה",
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      { class_name: "א1", notes: existingNotes, characterization: "לקויות למידה" }
    );
    expect(patch.characterization).toBe("לקויות למידה");
    expect(patch.notes).toBe("הערות מקוריות");
  });

  it("keeps teacher-written אפיון notes that do not match the file or the card", () => {
    const existingNotes = "אפיון: משהו שהמורה כתבה\nהערות מקוריות";
    const row = makeRow({
      characterization: "לקויות למידה",
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      { class_name: "א1", notes: existingNotes, characterization: "לקויות למידה" }
    );
    expect(patch.characterization).toBe("לקויות למידה");
    // Nothing to strip and no new notes from the file — leave the card notes as-is.
    expect(patch).not.toHaveProperty("notes");
  });

  it("strips a leftover matching אפיון line and keeps a teacher-written one", () => {
    const existingNotes = "אפיון: לקויות למידה\nאפיון: משהו שהמורה כתבה\nהערות מקוריות";
    const row = makeRow({
      characterization: "לקויות למידה",
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      { class_name: "א1", notes: existingNotes, characterization: "לקויות למידה" }
    );
    expect(patch.characterization).toBe("לקויות למידה");
    expect(patch.notes).toBe("אפיון: משהו שהמורה כתבה\nהערות מקוריות");
  });

  it("does not overwrite an existing ת.ז. with a different one", () => {
    const row = makeRow({
      id_number: "222222222",
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      { class_name: "א1", notes: null, id_number: "111111111" }
    );
    expect(patch).not.toHaveProperty("id_number");
  });

  it("does not wipe characterization or notes when those Excel cells are empty", () => {
    const row = makeRow({
      phone: "0501111111",
      characterization: null,
      notes: null,
      functioning: null,
    });

    const patch = buildUpdatePatch(
      row,
      { canAssignTeachers: false },
      { class_name: "א1", notes: "הערות קיימות" }
    );
    expect(patch.phone).toBe("0501111111");
    expect(patch).not.toHaveProperty("characterization");
    expect(patch).not.toHaveProperty("notes");
  });
});

describe("executeImport", () => {
  it("calls updateStudent for update rows (not saveStudent)", async () => {
    const updateStudent = vi.fn().mockResolvedValue(makeStudent());
    const saveStudent = vi.fn().mockResolvedValue(makeStudent());

    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent,
      updateStudent,
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({
        status: "update",
        existingStudentId: "existing-id",
        phone: "0501111111",
      }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
    });

    expect(updateStudent).toHaveBeenCalledTimes(1);
    expect(saveStudent).not.toHaveBeenCalled();
    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
  });

  it("member with mixed ok+update rows does not call saveStudent for ok rows", async () => {
    const updateStudent = vi.fn().mockResolvedValue(makeStudent());
    const saveStudent = vi.fn().mockResolvedValue(makeStudent());

    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent,
      updateStudent,
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({
        rowNumber: 2,
        status: "ok",
        full_name: "תלמיד חדש",
      }),
      makeRow({
        rowNumber: 3,
        status: "update",
        existingStudentId: "existing-id",
        full_name: "תלמיד קיים",
        phone: "0501111111",
      }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
      allowCreates: false,
    });

    expect(saveStudent).not.toHaveBeenCalled();
    expect(updateStudent).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("calls saveStudent for new rows", async () => {
    const updateStudent = vi.fn().mockResolvedValue(makeStudent());
    const saveStudent = vi.fn().mockResolvedValue(makeStudent());

    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent,
      updateStudent,
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({
        status: "ok",
        full_name: "תלמיד חדש",
      }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
    });

    expect(saveStudent).toHaveBeenCalledTimes(1);
    expect(updateStudent).not.toHaveBeenCalled();
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it("TZ-141: saveStudent receives integration_start_date from the Excel row", async () => {
    const saveStudent = vi.fn().mockResolvedValue(makeStudent());
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent,
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    await executeImport(
      [
        makeRow({
          status: "ok",
          full_name: "יוסי כהן",
          integration_start_date: "2023-09-02",
        }),
      ],
      deps,
      { status: "integration", category: "schools" }
    );

    expect(saveStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: "יוסי כהן",
        integration_start_date: "2023-09-02",
      })
    );
  });

  it("TZ-141: saveStudent receives optional card fields from the Excel row", async () => {
    const saveStudent = vi.fn().mockResolvedValue(makeStudent());
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent,
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    await executeImport(
      [
        makeRow({
          status: "ok",
          full_name: "יוסי כהן",
          family_status: "נשואים",
          single_responsible_party: true,
          homeroom_teacher: "רחל",
          additional_treatments: "קלינאות",
        }),
      ],
      deps,
      { status: "integration", category: "schools" }
    );

    expect(saveStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: "יוסי כהן",
        family_status: "נשואים",
        single_responsible_party: true,
        homeroom_teacher: "רחל",
        additional_treatments: "קלינאות",
      })
    );
  });

  it("tracks changed classes for sync", async () => {
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockResolvedValue(makeStudent()),
      updateStudent: vi.fn().mockResolvedValue(makeStudent()),
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({ status: "ok", class_name: "כיתה א" }),
      makeRow({ status: "ok", class_name: "כיתה ב" }),
      makeRow({ status: "update", existingStudentId: "id", class_name: "כיתה א" }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
    });

    expect(result.classesChanged.size).toBe(2);
    expect(result.classesChanged.has("כיתה א")).toBe(true);
    expect(result.classesChanged.has("כיתה ב")).toBe(true);
  });

  it("skips error, duplicate_in_file, and over_capacity rows", async () => {
    const saveStudent = vi.fn().mockResolvedValue(makeStudent());

    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent,
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({ status: "error" }),
      makeRow({ status: "duplicate_in_file" }),
      makeRow({ status: "over_capacity" }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
    });

    expect(saveStudent).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(3);
  });

  it("handles 403 errors gracefully for creation", async () => {
    const error403 = new Error("Forbidden");
    (error403 as Error & { status: number }).status = 403;
    
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockRejectedValue(error403),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [makeRow({ status: "ok" })];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
    });

    expect(result.failed).toBe(1);
    expect(result.results[0].error).toBe("אין הרשאה ליצור תלמיד זה");
  });

  it("handles 403 errors gracefully for update", async () => {
    const error403 = new Error("Forbidden");
    (error403 as Error & { status: number }).status = 403;
    
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn(),
      updateStudent: vi.fn().mockRejectedValue(error403),
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [makeRow({ status: "update", existingStudentId: "id-1" })];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
    });

    expect(result.failed).toBe(1);
    expect(result.results[0].error).toBe("אין הרשאה לעדכן תלמיד זה");
  });

  it("member create omits teacher_name (TZ-32, ignores row and staff card)", async () => {
    const savedStudentData: Array<Partial<Student> & { category: string; full_name: string }> = [];
    
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        savedStudentData.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [makeRow({ 
      status: "ok", 
      full_name: "תלמיד חדש",
      teacher_name: "מורה אחרת מהאקסל",
    })];

    await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
      teacherName: "שרה כהן",
      canAssignTeachers: false,
    });

    expect(savedStudentData).toHaveLength(1);
    expect(savedStudentData[0].teacher_name).toBeNull();
  });

  it("institution admin create omits teacher_name even when row and prop have names", async () => {
    const savedStudentData: Array<Partial<Student> & { category: string; full_name: string }> = [];
    
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        savedStudentData.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [makeRow({ 
      status: "ok", 
      full_name: "תלמיד חדש",
      teacher_name: "מורה מהאקסל",
    })];

    await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
      teacherName: "שרה כהן",
      canAssignTeachers: false,
    });

    expect(savedStudentData).toHaveLength(1);
    expect(savedStudentData[0].teacher_name).toBeNull();
  });

  it("owner's created student gets row teacher_name if present", async () => {
    const savedStudentData: Array<Partial<Student> & { category: string; full_name: string }> = [];
    
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        savedStudentData.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [makeRow({ 
      status: "ok", 
      full_name: "תלמיד חדש",
      teacher_name: "מורה מהאקסל",
    })];

    await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
      teacherName: "שרה כהן",
      canAssignTeachers: true,
    });

    expect(savedStudentData).toHaveLength(1);
    expect(savedStudentData[0].teacher_name).toBe("מורה מהאקסל");
  });

  it("owner's created student falls back to prop when row has no teacher_name", async () => {
    const savedStudentData: Array<Partial<Student> & { category: string; full_name: string }> = [];
    
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        savedStudentData.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [makeRow({ 
      status: "ok", 
      full_name: "תלמיד חדש",
      teacher_name: null,
    })];

    await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
      teacherName: "שרה כהן",
      canAssignTeachers: true,
    });

    expect(savedStudentData).toHaveLength(1);
    expect(savedStudentData[0].teacher_name).toBe("שרה כהן");
  });

  it("update with class change resyncs old class too", async () => {
    const existingStudent = makeStudent({
      id: "existing-id",
      class_name: "כיתה ישנה",
      full_name: "תלמיד קיים",
    });
    
    const deps: ImportDeps = {
      getStudents: () => [existingStudent],
      getUser: () => null,
      saveStudent: vi.fn(),
      updateStudent: vi.fn().mockResolvedValue(makeStudent({
        ...existingStudent,
        class_name: "כיתה חדשה",
      })),
      getKnownSpecialEdClassNames: () => ["כיתה ישנה", "כיתה חדשה"],
    };

    const rows = [
      makeRow({
        status: "update",
        existingStudentId: "existing-id",
        class_name: "כיתה חדשה",
      }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
    });

    expect(result.updated).toBe(1);
    expect(result.classesChanged.size).toBe(2);
    expect(result.classesChanged.has("כיתה ישנה")).toBe(true);
    expect(result.classesChanged.has("כיתה חדשה")).toBe(true);
  });

  it("institution admin does NOT send teacher_name in update patch", async () => {
    // TZ-32: institution admin can manage students but cannot assign teachers
    const existingStudent = makeStudent({
      id: "existing-id",
      full_name: "תלמיד קיים",
      teacher_name: "מורה ישנה",
    });
    
    const updateStudentMock = vi.fn().mockResolvedValue(existingStudent);
    
    const deps: ImportDeps = {
      getStudents: () => [existingStudent],
      getUser: () => null,
      saveStudent: vi.fn(),
      updateStudent: updateStudentMock,
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({
        status: "update",
        existingStudentId: "existing-id",
        teacher_name: "מורה חדשה",
        phone: "0501234567",
      }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
      canAssignTeachers: false,
    });

    expect(result.updated).toBe(1);
    expect(updateStudentMock).toHaveBeenCalledTimes(1);
    const patch = updateStudentMock.mock.calls[0][1];
    expect(patch).not.toHaveProperty("teacher_name");
    expect(patch.phone).toBe("0501234567");
  });

  it("owner sends teacher_name in update patch", async () => {
    const existingStudent = makeStudent({
      id: "existing-id",
      full_name: "תלמיד קיים",
      teacher_name: "מורה ישנה",
    });
    
    const updateStudentMock = vi.fn().mockResolvedValue(makeStudent({
      ...existingStudent,
      teacher_name: "מורה חדשה",
    }));
    
    const deps: ImportDeps = {
      getStudents: () => [existingStudent],
      getUser: () => null,
      saveStudent: vi.fn(),
      updateStudent: updateStudentMock,
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({
        status: "update",
        existingStudentId: "existing-id",
        teacher_name: "מורה חדשה",
      }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
      canAssignTeachers: true,
    });

    expect(result.updated).toBe(1);
    expect(updateStudentMock).toHaveBeenCalledTimes(1);
    const patch = updateStudentMock.mock.calls[0][1];
    expect(patch.teacher_name).toBe("מורה חדשה");
  });

  it("update writes Excel אפיון onto characterization and leaves notes alone", async () => {
    const existingStudent = makeStudent({
      id: "existing-id",
      notes: "הערות מקוריות",
    });
    const updateStudentMock = vi.fn().mockResolvedValue(existingStudent);

    const deps: ImportDeps = {
      getStudents: () => [existingStudent],
      getUser: () => null,
      saveStudent: vi.fn(),
      updateStudent: updateStudentMock,
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({
        status: "update",
        existingStudentId: "existing-id",
        characterization: "לקויות למידה",
      }),
    ];

    await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
    });

    expect(updateStudentMock).toHaveBeenCalledTimes(1);
    const patch = updateStudentMock.mock.calls[0][1];
    expect(patch.characterization).toBe("לקויות למידה");
    expect(patch).not.toHaveProperty("notes");
  });

  it("create writes characterization on the student, not into notes", async () => {
    const saved: Array<Partial<Student>> = [];
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        saved.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    await executeImport(
      [
        makeRow({
          status: "ok",
          full_name: "יוסי כהן",
          characterization: "לקות למידה",
          notes: "הערה אמיתית",
        }),
      ],
      deps,
      { status: "personal-basket", category: "schools" }
    );

    expect(saved).toHaveLength(1);
    expect(saved[0].characterization).toBe("לקות למידה");
    expect(saved[0].notes).toBe("הערה אמיתית");
    expect(saved[0].integration_frequency).toBeNull();
  });

  it("personal-basket create with an empty class cell does not invent כיתה", async () => {
    const saved: Array<Partial<Student>> = [];
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        saved.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    await executeImport(
      [
        makeRow({ status: "ok", class_name: null, full_name: "בלי כיתה" }),
        makeRow({
          rowNumber: 2,
          status: "ok",
          class_name: "   ",
          full_name: "כיתה רווח",
        }),
      ],
      deps,
      { status: "personal-basket", category: "schools" }
    );

    expect(saved).toHaveLength(2);
    expect(saved[0].class_name).toBeNull();
    expect(saved[1].class_name).toBeNull();
    expect(saved.every((row) => row.class_name !== "כיתה")).toBe(true);
  });

  it("special-ed create still defaults an empty class to כיתה", async () => {
    const saved: Array<Partial<Student>> = [];
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        saved.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    await executeImport(
      [makeRow({ status: "ok", class_name: null })],
      deps,
      { status: "special-ed-class", category: "schools" }
    );

    expect(saved[0].class_name).toBe("כיתה");
  });

  it("regular personal-basket import does not default a missing frequency cell to high", async () => {
    const saved: Array<Partial<Student>> = [];
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        saved.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    await executeImport(
      [makeRow({ status: "ok", frequency: null })],
      deps,
      { status: "personal-basket", category: "schools" }
    );

    expect(saved).toHaveLength(1);
    expect(saved[0].integration_frequency).toBeNull();
  });

  it("בחרו שכיחות dialog passes high only when the Excel frequency cell is empty", async () => {
    const saved: Array<Partial<Student>> = [];
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        saved.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    await executeImport(
      [
        makeRow({ status: "ok", frequency: null, full_name: "תלמיד בלי שכיחות" }),
        makeRow({
          rowNumber: 2,
          status: "ok",
          frequency: "low",
          full_name: "תלמיד עם שכיחות",
        }),
      ],
      deps,
      {
        status: "personal-basket",
        category: "schools",
        defaultFrequency: "high",
      }
    );

    expect(saved).toHaveLength(2);
    expect(saved[0].integration_frequency).toBe("high");
    expect(saved[1].integration_frequency).toBe("low");
  });

  it("personal-basket create uses Excel frequency when present", async () => {
    const saved: Array<Partial<Student>> = [];
    const deps: ImportDeps = {
      getStudents: () => [],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        saved.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => [],
    };

    await executeImport(
      [makeRow({ status: "ok", frequency: "low" })],
      deps,
      { status: "personal-basket", category: "schools" }
    );

    expect(saved[0].integration_frequency).toBe("low");
  });

  it("same name with a different ת.ז. creates a new student and leaves the existing id_number unchanged", async () => {
    const existingStudent = makeStudent({
      id: "existing-id",
      full_name: "יוסי כהן",
      status: "personal-basket",
      id_number: "111111111",
    });
    const saved: Array<Partial<Student>> = [];
    const updateStudent = vi.fn();
    const deps: ImportDeps = {
      getStudents: () => [existingStudent],
      getUser: () => null,
      saveStudent: vi.fn().mockImplementation((data) => {
        saved.push(data);
        return Promise.resolve(makeStudent({ ...data, id: "new-id" }));
      }),
      updateStudent,
      getKnownSpecialEdClassNames: () => [],
    };

    const result = await executeImport(
      [
        makeRow({
          status: "ok",
          full_name: "יוסי כהן",
          id_number: "222222222",
        }),
      ],
      deps,
      { status: "personal-basket", category: "schools" }
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(updateStudent).not.toHaveBeenCalled();
    expect(saved[0].id_number).toBe("222222222");
    expect(existingStudent.id_number).toBe("111111111");
  });

  it("member does NOT send teacher_name in update patch", async () => {
    // TZ-28: Members cannot reassign students to other teachers
    const existingStudent = makeStudent({
      id: "existing-id",
      full_name: "תלמיד קיים",
      teacher_name: "מורה ישנה",
    });
    
    const updateStudentMock = vi.fn().mockResolvedValue(existingStudent);
    
    const deps: ImportDeps = {
      getStudents: () => [existingStudent],
      getUser: () => null,
      saveStudent: vi.fn(),
      updateStudent: updateStudentMock,
      getKnownSpecialEdClassNames: () => [],
    };

    const rows = [
      makeRow({
        status: "update",
        existingStudentId: "existing-id",
        teacher_name: "מורה אחרת מהאקסל", // Member trying to change teacher
        phone: "0501234567", // Some other update
      }),
    ];

    const result = await executeImport(rows, deps, {
      status: "special-ed-class",
      category: "schools",
      teacherName: "שרה כהן",
      canAssignTeachers: false,
    });

    expect(result.updated).toBe(1);
    expect(updateStudentMock).toHaveBeenCalledTimes(1);
    const patch = updateStudentMock.mock.calls[0][1];
    // Member's patch should NOT include teacher_name
    expect(patch).not.toHaveProperty("teacher_name");
    // But other fields should be present
    expect(patch.phone).toBe("0501234567");
  });
});

describe("TZ-209 multi-grade class re-import", () => {
  it("updates by ת.ז. without changing class when Excel holds a grade letter", async () => {
    const existing = makeStudent({
      id: "stu-1",
      full_name: "יעל כהן",
      class_name: "כתה א2",
      id_number: "123456789",
      status: "special-ed-class",
    });
    const students = [existing];
    const updateStudent = vi.fn().mockImplementation((_id, patch) => {
      Object.assign(existing, patch);
      return Promise.resolve(existing);
    });

    const deps: ImportDeps = {
      getStudents: () => students,
      getUser: () => ({ plan_id: "plan-3", institution_type: "schools" }),
      saveStudent: vi.fn(),
      updateStudent,
      getKnownSpecialEdClassNames: () => ["כיתה א", "כתה א2"],
    };

    const result = await executeImport(
      [
        makeRow({
          status: "update",
          existingStudentId: "stu-1",
          full_name: "יעל כהן",
          class_name: "כתה א2",
          classMappedFrom: "א",
          id_number: "123456789",
          phone: "0501111111",
        }),
      ],
      deps,
      {
        status: "special-ed-class",
        category: "schools",
        defaultClassName: "כתה א2",
      }
    );

    expect(result.updated).toBe(1);
    expect(existing.class_name).toBe("כתה א2");
    expect(updateStudent.mock.calls[0][1]).not.toHaveProperty("class_name");
    expect(updateStudent.mock.calls[0][1].phone).toBe("0501111111");
  });
});

describe("TZ-84 special-ed import save into the existing class", () => {
  function classOwner(className: string): Student {
    return makeStudent({
      id: `owner-${className}`,
      full_name: `תל"כ — ${className}`,
      class_name: className,
      teacher_name: className,
      notes: CLASS_CURRICULUM_NOTE_MARKER,
    });
  }

  it("saves preview-valid rows into the class page when Excel says «ג» and quota is 1", async () => {
    const students: Student[] = [classOwner("יוכי שלום")];
    const saved: Array<Partial<Student>> = [];
    const deps: ImportDeps = {
      getStudents: () => students,
      getUser: () => ({
        plan_id: "plan-3",
        institution_type: "schools",
      }),
      saveStudent: vi.fn().mockImplementation((data) => {
        const created = makeStudent({
          ...data,
          id: `new-${saved.length + 1}`,
        });
        saved.push(data);
        students.push(created);
        return Promise.resolve(created);
      }),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => ["כיתה", "יוכי שלום"],
    };

    const result = await executeImport(
      [
        makeRow({
          status: "ok",
          full_name: "תלמיד א",
          class_name: "ג",
        }),
        makeRow({
          rowNumber: 2,
          status: "ok",
          full_name: "תלמיד ב",
          class_name: "ג",
        }),
      ],
      deps,
      {
        status: "special-ed-class",
        category: "schools",
        defaultClassName: "יוכי שלום",
      }
    );

    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
    expect(saved).toHaveLength(2);
    expect(saved.every((row) => row.class_name === "יוכי שלום")).toBe(true);
  });

  it("rejects a true second class on a 1-class package with a Hebrew quota error", async () => {
    const saveStudent = vi.fn();
    const deps: ImportDeps = {
      getStudents: () => [classOwner("יוכי שלום")],
      getUser: () => ({
        plan_id: "plan-3",
        institution_type: "schools",
      }),
      saveStudent,
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => ["יוכי שלום"],
    };

    const result = await executeImport(
      [makeRow({ status: "ok", full_name: "תלמיד", class_name: "ג" })],
      deps,
      {
        status: "special-ed-class",
        category: "schools",
      }
    );

    expect(saveStudent).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("מכסת הכיתות");
  });

  it("surfaces a thrown PlanLimitError in Hebrew instead of swallowing it", async () => {
    const deps: ImportDeps = {
      getStudents: () => [classOwner("יוכי שלום")],
      getUser: () => ({
        plan_id: "plan-3",
        institution_type: "schools",
      }),
      saveStudent: vi.fn().mockRejectedValue(
        new PlanLimitError({ kind: "classes", limit: 1, current: 1 })
      ),
      updateStudent: vi.fn(),
      getKnownSpecialEdClassNames: () => ["יוכי שלום"],
    };

    const result = await executeImport(
      [
        makeRow({
          status: "ok",
          full_name: "תלמיד",
          class_name: "יוכי שלום",
        }),
      ],
      deps,
      {
        status: "special-ed-class",
        category: "schools",
        defaultClassName: "יוכי שלום",
      }
    );

    expect(result.created).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("מכסת");
    expect(
      formatImportOutcomeMessage(result, { className: "יוכי שלום" })
    ).toMatch(/^הייבוא נכשל:/);
  });
});
