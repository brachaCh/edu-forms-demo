import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cellDisplayValue,
  findLinkedStudentByName,
  formatStaffScheduleSyncMessage,
  normalizePersonName,
  scheduleSyncedByKey,
  splitStudentNames,
  syncStaffScheduleToLinkedStudents,
  targetScheduleFormId,
  mergeEmptyScheduleCells,
  personalBasketScheduleBase,
  isPersonalScheduleCellKey,
  isPersonalScheduleMergeKey,
} from "./staff-schedule-sync";
import { scheduleSubCellKey } from "./form-table-grids";
import type { Student } from "./supabase/types";

const fills = new Map<string, { id: string; data: Record<string, string>; status: string }>();

vi.mock("./mock-store", () => ({
  getStudents: vi.fn(() => []),
  loadStudentFormFill: vi.fn(async (studentId: string, formId: string) => {
    const key = `${studentId}:${formId}`;
    const row = fills.get(key);
    if (!row) return null;
    return {
      id: row.id,
      student_id: studentId,
      form_id: formId,
      data: { ...row.data },
      status: row.status,
      document_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
  }),
  saveStudentFormFill: vi.fn(
    async (input: {
      studentId: string;
      formId: string;
      data: Record<string, string>;
      status?: string;
    }) => {
      const key = `${input.studentId}:${input.formId}`;
      const existing = fills.get(key);
      const saved = {
        id: existing?.id ?? `fill-${input.studentId}`,
        data: { ...input.data },
        status: input.status ?? "draft",
      };
      fills.set(key, saved);
      return {
        id: saved.id,
        student_id: input.studentId,
        form_id: input.formId,
        data: saved.data,
        status: saved.status,
        document_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };
    }
  ),
}));

import {
  getStudents,
  loadStudentFormFill,
  saveStudentFormFill,
} from "./mock-store";

const mockedStudents = vi.mocked(getStudents);

function student(partial: Partial<Student> & Pick<Student, "id" | "full_name" | "status">): Student {
  return {
    id: partial.id,
    full_name: partial.full_name,
    status: partial.status,
    category: partial.category ?? "schools",
    teacher_name: partial.teacher_name ?? "מורה דמו",
    class_name: null,
    phone: null,
    email: null,
    notes: null,
    id_number: null,
    birth_date: null,
    gender: null,
    home_address: null,
    city: null,
    father_name: null,
    mother_name: null,
    father_mobile: null,
    mother_mobile: null,
    role: null,
    characterization: null,
    family_status: null,
    integration_start_date: null,
    eligibility_committee_date: null,
    homeroom_teacher: null,
    education_support: null,
    additional_treatments: null,
    integration_frequency: null,
    calendar_year: null,
    institution_id: null,
    archived_at: null,
    user_profile_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("staff-schedule-sync", () => {
  beforeEach(() => {
    fills.clear();
    vi.clearAllMocks();
  });

  it("normalizes names and matches linked students", () => {
    expect(normalizePersonName("  אביטל   גדסי ")).toBe("אביטל גדסי");
    const linked = [
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "integration",
      }),
    ];
    expect(findLinkedStudentByName(linked, "אביטל  גדסי")?.id).toBe("s1");
    expect(targetScheduleFormId("integration")).toBe("schedule");
    expect(targetScheduleFormId("personal-basket")).toBe("personal-schedule");
    expect(cellDisplayValue("מורה דמו", "חשבון")).toBe("מורה דמו\nחשבון");
  });

  it("merges empty personal-schedule cells from a shiluv schedule", () => {
    const merged = mergeEmptyScheduleCells(
      { sched_sun_p3_in_class: "" },
      [{ sched_sun_p3: "מורה דמו\nחשבון", extra: "ignore" }]
    );
    expect(merged.sched_sun_p3).toBe("מורה דמו\nחשבון");
    expect(merged.extra).toBeUndefined();
    expect(merged.sched_sun_p3_in_class).toBe("");
  });

  it("does not overwrite filled personal-schedule cells", () => {
    const target = { sched_sun_p3: "קיים", sched_sun_p3_other: "1" };
    const merged = mergeEmptyScheduleCells(target, [
      { sched_sun_p3: "חדש", sched_sun_p3_other: "should-not-win" },
    ]);
    expect(merged).toBe(target);
    expect(merged.sched_sun_p3).toBe("קיים");
    expect(merged.sched_sun_p3_other).toBe("1");
  });

  it("does not refill a cell the teacher already set to empty", () => {
    const target = { sched_sun_p3: "" };
    const merged = mergeEmptyScheduleCells(target, [
      { sched_sun_p3: "מורה דמו\nחשבון" },
    ]);
    expect(merged).toBe(target);
    expect(merged.sched_sun_p3).toBe("");
  });

  it("TZ-75: _synced_by is only for main sched_[day]_pN cells", () => {
    expect(isPersonalScheduleCellKey("sched_sun_p3")).toBe(true);
    expect(isPersonalScheduleCellKey("sched_sun_p3_synced_by")).toBe(false);
    expect(isPersonalScheduleCellKey("sched_sun_p3_in_class")).toBe(false);
    expect(isPersonalScheduleCellKey("sched_sun_p3_other")).toBe(false);
    expect(isPersonalScheduleCellKey("sched_sun_p3_staff")).toBe(false);
    expect(isPersonalScheduleCellKey("sched_sun_p3_student")).toBe(false);
    expect(isPersonalScheduleCellKey("sched_sun_p3_subject")).toBe(false);
  });

  it("TZ-75: shared merge never copies in-class/other marks", () => {
    expect(isPersonalScheduleMergeKey("sched_sun_p3")).toBe(true);
    expect(isPersonalScheduleMergeKey("sched_sun_p3_synced_by")).toBe(true);
    expect(isPersonalScheduleMergeKey("sched_sun_p3_in_class")).toBe(false);
    expect(isPersonalScheduleMergeKey("sched_sun_p3_other")).toBe(false);
    const merged = mergeEmptyScheduleCells(
      {},
      [
        {
          sched_sun_p3: "מורה דמו\nחשבון",
          sched_sun_p3_in_class: "1",
          sched_sun_p3_other: "1",
        },
      ]
    );
    expect(merged.sched_sun_p3).toBe("מורה דמו\nחשבון");
    expect(merged.sched_sun_p3_in_class).toBeUndefined();
    expect(merged.sched_sun_p3_other).toBeUndefined();
  });

  it("TZ-75: existing schedule-detailed fill including empty cells is the base", () => {
    const base = personalBasketScheduleBase({
      personal: null,
      detailed: {
        form_id: "schedule-detailed",
        data: { sched_sun_p3: "", sched_sun_p3_in_class: "1" },
      },
      simple: {
        form_id: "schedule",
        data: { sched_sun_p3: "מורה דמו\nחשבון", sched_sun_p3_in_class: "1" },
      },
    });
    expect(base.sched_sun_p3).toBe("");
    expect(base.sched_sun_p3_in_class).toBe("1");
  });

  it("splits multiple student names from a single cell", () => {
    expect(splitStudentNames("")).toEqual([]);
    expect(splitStudentNames("  ")).toEqual([]);
    expect(splitStudentNames("אביטל גדסי")).toEqual(["אביטל גדסי"]);
    expect(splitStudentNames("אביטל גדסי, דוד כהן")).toEqual(["אביטל גדסי", "דוד כהן"]);
    expect(splitStudentNames("אביטל גדסי,דוד כהן")).toEqual(["אביטל גדסי", "דוד כהן"]);
    expect(splitStudentNames("אביטל גדסי\nדוד כהן")).toEqual(["אביטל גדסי", "דוד כהן"]);
    expect(splitStudentNames("אביטל גדסי, דוד כהן, שרה לוי")).toEqual([
      "אביטל גדסי",
      "דוד כהן",
      "שרה לוי",
    ]);
    // Arabic comma support
    expect(splitStudentNames("אביטל גדסי، דוד כהן")).toEqual(["אביטל גדסי", "דוד כהן"]);
  });

  it("keeps names with vav-starting last names whole (regression)", () => {
    // These names previously broke due to incorrect ו separator matching
    expect(splitStudentNames("אסתר וייס")).toEqual(["אסתר וייס"]);
    expect(splitStudentNames("רחל ורד")).toEqual(["רחל ורד"]);
    expect(splitStudentNames("שרה ויצמן")).toEqual(["שרה ויצמן"]);
    expect(splitStudentNames("מרים וולף")).toEqual(["מרים וולף"]);
    expect(splitStudentNames("חנה וקנין")).toEqual(["חנה וקנין"]);

    // Multiple names with vav-starting last names
    expect(splitStudentNames("אסתר וייס, רחל ורד")).toEqual(["אסתר וייס", "רחל ורד"]);
    expect(splitStudentNames("אסתר וייס\nרחל ורד")).toEqual(["אסתר וייס", "רחל ורד"]);
  });

  it("writes teacher name into linked student schedule on first sync", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "integration",
        teacher_name: "מורה דמו",
      }),
    ]);

    const data: Record<string, string> = {
      [scheduleSubCellKey("sun", 3, "student")]: "אביטל גדסי",
      [scheduleSubCellKey("sun", 3, "subject")]: "חשבון",
    };

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data,
    });

    expect(result.updatedStudentIds).toEqual(["s1"]);
    expect(result.conflicts).toEqual([]);
    expect(saveStudentFormFill).toHaveBeenCalled();

    const fill = await loadStudentFormFill("s1", "schedule");
    expect(fill?.data["sched_sun_p3"]).toBe("מורה דמו\nחשבון");
    expect(fill?.data[scheduleSyncedByKey("sun", 3)]).toBe("מורה דמו");
  });

  it("blocks overwrite when another teacher already synced the slot", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "personal-basket",
        teacher_name: "מורה ב",
      }),
    ]);
    fills.set("s1:personal-schedule", {
      id: "f1",
      status: "draft",
      data: {
        sched_sun_p3: "מורה א\nקריאה",
        [scheduleSyncedByKey("sun", 3)]: "מורה א",
      },
    });

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה ב",
      data: {
        [scheduleSubCellKey("sun", 3, "student")]: "אביטל גדסי",
        [scheduleSubCellKey("sun", 3, "subject")]: "חשבון",
      },
    });

    expect(result.updatedStudentIds).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.filledByTeacher).toBe("מורה א");
    expect(formatStaffScheduleSyncMessage(result)).toContain("מורה א");

    const fill = await loadStudentFormFill("s1", "personal-schedule");
    expect(fill?.data["sched_sun_p3"]).toBe("מורה א\nקריאה");
  });

  it("blocks overwrite when cell has content without synced_by meta", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "integration",
        teacher_name: "מורה ב",
      }),
    ]);
    fills.set("s1:schedule", {
      id: "f1",
      status: "draft",
      data: {
        sched_sun_p3: "מורה א\nקריאה",
      },
    });

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה ב",
      data: {
        [scheduleSubCellKey("sun", 3, "student")]: "אביטל גדסי",
        [scheduleSubCellKey("sun", 3, "subject")]: "חשבון",
      },
    });

    expect(result.updatedStudentIds).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.filledByTeacher).toBe("מורה א");

    const fill = await loadStudentFormFill("s1", "schedule");
    expect(fill?.data["sched_sun_p3"]).toBe("מורה א\nקריאה");
    expect(fill?.data[scheduleSyncedByKey("sun", 3)]).toBeUndefined();
  });

  it("allows same teacher to update a cell that already has their name without meta", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "integration",
        teacher_name: "מורה דמו",
      }),
    ]);
    fills.set("s1:schedule", {
      id: "f1",
      status: "draft",
      data: {
        sched_sun_p3: "מורה דמו\nקריאה",
      },
    });

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data: {
        [scheduleSubCellKey("sun", 3, "student")]: "אביטל גדסי",
        [scheduleSubCellKey("sun", 3, "subject")]: "חשבון",
      },
    });

    expect(result.conflicts).toEqual([]);
    expect(result.updatedStudentIds).toEqual(["s1"]);
    const fill = await loadStudentFormFill("s1", "schedule");
    expect(fill?.data["sched_sun_p3"]).toBe("מורה דמו\nחשבון");
    expect(fill?.data[scheduleSyncedByKey("sun", 3)]).toBe("מורה דמו");
  });

  it("allows the same teacher to update their synced slot", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "integration",
        teacher_name: "מורה דמו",
      }),
    ]);
    fills.set("s1:schedule", {
      id: "f1",
      status: "draft",
      data: {
        sched_sun_p3: "מורה דמו\nקריאה",
        [scheduleSyncedByKey("sun", 3)]: "מורה דמו",
      },
    });

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data: {
        [scheduleSubCellKey("sun", 3, "student")]: "אביטל גדסי",
        [scheduleSubCellKey("sun", 3, "subject")]: "חשבון",
      },
    });

    expect(result.conflicts).toEqual([]);
    expect(result.updatedStudentIds).toEqual(["s1"]);
    const fill = await loadStudentFormFill("s1", "schedule");
    expect(fill?.data["sched_sun_p3"]).toBe("מורה דמו\nחשבון");
  });

  it("TZ-75: leftover shiluv schedule cells count as existing personal-basket content", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "personal-basket",
        teacher_name: "מורה ב",
      }),
    ]);
    fills.set("s1:schedule", {
      id: "f1",
      status: "draft",
      data: {
        sched_sun_p3: "מורה א\nקריאה",
      },
    });

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה ב",
      data: {
        [scheduleSubCellKey("sun", 3, "student")]: "אביטל גדסי",
        [scheduleSubCellKey("sun", 3, "subject")]: "חשבון",
      },
    });

    expect(result.updatedStudentIds).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.filledByTeacher).toBe("מורה א");
  });

  it("TZ-75: does not refill a cleared schedule-detailed cell from leftover shiluv", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "personal-basket",
        teacher_name: "מורה דמו",
      }),
    ]);
    fills.set("s1:schedule-detailed", {
      id: "detailed",
      status: "draft",
      data: {
        sched_sun_p3: "",
        [scheduleSyncedByKey("sun", 3)]: "",
      },
    });
    fills.set("s1:schedule", {
      id: "shiluv",
      status: "draft",
      data: {
        sched_sun_p3: "מורה א\nקריאה",
        [scheduleSyncedByKey("sun", 3)]: "מורה א",
      },
    });

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data: {
        [scheduleSubCellKey("mon", 2, "student")]: "אביטל גדסי",
        [scheduleSubCellKey("mon", 2, "subject")]: "חשבון",
      },
    });

    expect(result.conflicts).toEqual([]);
    expect(result.updatedStudentIds).toEqual(["s1"]);
    const fill = await loadStudentFormFill("s1", "personal-schedule");
    expect(fill?.data["sched_sun_p3"] ?? "").toBe("");
    expect(fill?.data[scheduleSyncedByKey("sun", 3)] ?? "").toBe("");
    expect(fill?.data["sched_mon_p2"]).toBe("מורה דמו\nחשבון");
  });

  it("TZ-75: staff-sync does not copy in-class/other from shiluv schedule", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "personal-basket",
        teacher_name: "מורה דמו",
      }),
    ]);
    fills.set("s1:schedule", {
      id: "shiluv",
      status: "draft",
      data: {
        sched_sun_p3: "מורה א\nקריאה",
        sched_sun_p3_in_class: "1",
        sched_sun_p3_other: "1",
      },
    });

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data: {
        [scheduleSubCellKey("mon", 2, "student")]: "אביטל גדסי",
        [scheduleSubCellKey("mon", 2, "subject")]: "חשבון",
      },
    });

    expect(result.updatedStudentIds).toEqual(["s1"]);
    const fill = await loadStudentFormFill("s1", "personal-schedule");
    expect(fill?.data["sched_sun_p3"]).toBe("מורה א\nקריאה");
    expect(fill?.data.sched_sun_p3_in_class).toBeUndefined();
    expect(fill?.data.sched_sun_p3_other).toBeUndefined();
  });

  it("TZ-75: does not refill a cleared personal-schedule cell from leftover shiluv", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "personal-basket",
        teacher_name: "מורה דמו",
      }),
    ]);
    fills.set("s1:personal-schedule", {
      id: "personal",
      status: "draft",
      data: {
        sched_sun_p3: "",
        [scheduleSyncedByKey("sun", 3)]: "",
      },
    });
    fills.set("s1:schedule", {
      id: "shiluv",
      status: "draft",
      data: {
        sched_sun_p3: "מורה א\nקריאה",
        [scheduleSyncedByKey("sun", 3)]: "מורה א",
      },
    });

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data: {
        [scheduleSubCellKey("mon", 2, "student")]: "אביטל גדסי",
        [scheduleSubCellKey("mon", 2, "subject")]: "חשבון",
      },
    });

    expect(result.conflicts).toEqual([]);
    expect(result.updatedStudentIds).toEqual(["s1"]);
    const fill = await loadStudentFormFill("s1", "personal-schedule");
    expect(fill?.data["sched_sun_p3"] ?? "").toBe("");
    expect(fill?.data[scheduleSyncedByKey("sun", 3)] ?? "").toBe("");
    expect(fill?.data["sched_mon_p2"]).toBe("מורה דמו\nחשבון");
  });

  it("reports unmatched student names", async () => {
    mockedStudents.mockReturnValue([]);
    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data: {
        [scheduleSubCellKey("sun", 2, "student")]: "דוד כהן",
        [scheduleSubCellKey("sun", 2, "subject")]: "קריאה",
      },
    });
    expect(result.unmatchedNames).toEqual(["דוד כהן"]);
    expect(result.updatedStudentIds).toEqual([]);
  });

  it("syncs multiple students from a single cell", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "integration",
        teacher_name: "מורה דמו",
      }),
      student({
        id: "s2",
        full_name: "דוד כהן",
        status: "integration",
        teacher_name: "מורה דמו",
      }),
    ]);

    const data: Record<string, string> = {
      [scheduleSubCellKey("sun", 3, "student")]: "אביטל גדסי, דוד כהן",
      [scheduleSubCellKey("sun", 3, "subject")]: "חשבון",
    };

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data,
    });

    expect(result.updatedStudentIds.sort()).toEqual(["s1", "s2"]);
    expect(result.conflicts).toEqual([]);

    const fill1 = await loadStudentFormFill("s1", "schedule");
    expect(fill1?.data["sched_sun_p3"]).toBe("מורה דמו\nחשבון");
    expect(fill1?.data[scheduleSyncedByKey("sun", 3)]).toBe("מורה דמו");

    const fill2 = await loadStudentFormFill("s2", "schedule");
    expect(fill2?.data["sched_sun_p3"]).toBe("מורה דמו\nחשבון");
    expect(fill2?.data[scheduleSyncedByKey("sun", 3)]).toBe("מורה דמו");
  });

  it("syncs multiple students with newline separator", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "personal-basket",
        teacher_name: "מורה דמו",
      }),
      student({
        id: "s2",
        full_name: "שרה לוי",
        status: "personal-basket",
        teacher_name: "מורה דמו",
      }),
    ]);

    const data: Record<string, string> = {
      [scheduleSubCellKey("mon", 2, "student")]: "אביטל גדסי\nשרה לוי",
      [scheduleSubCellKey("mon", 2, "subject")]: "קריאה",
    };

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data,
    });

    expect(result.updatedStudentIds.sort()).toEqual(["s1", "s2"]);

    const fill1 = await loadStudentFormFill("s1", "personal-schedule");
    expect(fill1?.data["sched_mon_p2"]).toBe("מורה דמו\nקריאה");

    const fill2 = await loadStudentFormFill("s2", "personal-schedule");
    expect(fill2?.data["sched_mon_p2"]).toBe("מורה דמו\nקריאה");
  });

  it("reports partial unmatched names when some students are found and some are not", async () => {
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אביטל גדסי",
        status: "integration",
        teacher_name: "מורה דמו",
      }),
    ]);

    const data: Record<string, string> = {
      [scheduleSubCellKey("sun", 3, "student")]: "אביטל גדסי, דוד כהן",
      [scheduleSubCellKey("sun", 3, "subject")]: "חשבון",
    };

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data,
    });

    expect(result.updatedStudentIds).toEqual(["s1"]);
    expect(result.unmatchedNames).toEqual(["דוד כהן"]);
    expect(result.conflicts).toEqual([]);
  });

  it("syncs student with vav-starting last name correctly (regression)", async () => {
    // Ensures names like "אסתר וייס" are not incorrectly split on the ו
    mockedStudents.mockReturnValue([
      student({
        id: "s1",
        full_name: "אסתר וייס",
        status: "integration",
        teacher_name: "מורה דמו",
      }),
      student({
        id: "s2",
        full_name: "רחל ורד",
        status: "integration",
        teacher_name: "מורה דמו",
      }),
    ]);

    const data: Record<string, string> = {
      [scheduleSubCellKey("sun", 1, "student")]: "אסתר וייס",
      [scheduleSubCellKey("sun", 1, "subject")]: "חשבון",
      [scheduleSubCellKey("mon", 2, "student")]: "אסתר וייס, רחל ורד",
      [scheduleSubCellKey("mon", 2, "subject")]: "קריאה",
    };

    const result = await syncStaffScheduleToLinkedStudents({
      staffName: "מורה דמו",
      data,
    });

    // Both students should sync without errors
    expect(result.updatedStudentIds.sort()).toEqual(["s1", "s2"]);
    expect(result.unmatchedNames).toEqual([]);
    expect(result.conflicts).toEqual([]);

    // Verify individual cell was synced correctly
    const fill1 = await loadStudentFormFill("s1", "schedule");
    expect(fill1?.data["sched_sun_p1"]).toBe("מורה דמו\nחשבון");
    expect(fill1?.data[scheduleSyncedByKey("sun", 1)]).toBe("מורה דמו");
    expect(fill1?.data["sched_mon_p2"]).toBe("מורה דמו\nקריאה");

    // Verify multi-student cell synced both students
    const fill2 = await loadStudentFormFill("s2", "schedule");
    expect(fill2?.data["sched_mon_p2"]).toBe("מורה דמו\nקריאה");
    expect(fill2?.data[scheduleSyncedByKey("mon", 2)]).toBe("מורה דמו");
  });
});
