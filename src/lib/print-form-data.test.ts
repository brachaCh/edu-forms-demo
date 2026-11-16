import { describe, expect, it } from "vitest";
import { getFormSchema } from "@/lib/form-schemas";
import { buildFormSnapshotHtml } from "@/lib/form-snapshot";
import { mergePrintFormDataWithStudent } from "./print-form-data";
import { buildPersonalScheduleFillData, buildPrintFixtureStudent } from "./print-fixtures";

describe("mergePrintFormDataWithStudent (TZ-103)", () => {
  it("fills blank name, class and date from the student card and fill timestamp", () => {
    const schema = getFormSchema("personal-schedule");
    expect(schema).toBeTruthy();
    const student = buildPrintFixtureStudent();
    const merged = mergePrintFormDataWithStudent(
      schema!,
      buildPersonalScheduleFillData(student.full_name),
      student,
      {
        created_at: "2026-09-15T00:00:00.000Z",
        updated_at: "2026-10-12T08:30:00.000Z",
      }
    );
    expect(merged.full_name).toBe("נועה דמו");
    expect(merged.class_name).toBe("ד׳2");
    expect(merged.filled_at).toBe("2026-10-12");

    const html = buildFormSnapshotHtml(schema!, merged, "נועה דמו");
    expect(html).toContain("נועה דמו");
    expect(html).toContain("ד׳2");
    expect(html).toContain("12/10/2026");
    expect(html).not.toMatch(/<th>שם התלמיד\/ה<\/th><td>—<\/td>/);
    expect(html).not.toMatch(/<th>כיתה<\/th><td>—<\/td>/);
    expect(html).not.toMatch(/<th>תאריך<\/th><td>—<\/td>/);
  });

  it("does not overwrite values the teacher already typed", () => {
    const schema = getFormSchema("personal-schedule");
    const student = buildPrintFixtureStudent();
    const merged = mergePrintFormDataWithStudent(
      schema!,
      { full_name: "שם ידני", class_name: "ה1", filled_at: "2026-01-02" },
      student,
      { created_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-10-12T00:00:00.000Z" }
    );
    expect(merged.full_name).toBe("שם ידני");
    expect(merged.class_name).toBe("ה1");
    expect(merged.filled_at).toBe("2026-01-02");
  });

  it("never copies student-card secrets onto a schedule, a normal form, or the waiver", () => {
    const schedule = getFormSchema("personal-schedule");
    const report = getFormSchema("functional-educational-report");
    const waiver = getFormSchema("waiver-confidentiality");
    expect(schedule && report && waiver).toBeTruthy();
    const student = {
      ...buildPrintFixtureStudent(),
      id_number: "000000018",
      notes: "CARD-NOTES-LEAK",
      father_name: "CARD-FATHER-LEAK",
      mother_name: "CARD-MOTHER-LEAK",
      father_mobile: "0500000000",
      birth_date: "2014-03-03",
      home_address: "רחוב דמו 1",
      phone: "03-0000000",
      email: "demo@example.com",
      family_status: "נשואים" as const,
    };
    const fill = {
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-10-12T08:30:00.000Z",
    };

    const scheduleMerged = mergePrintFormDataWithStudent(
      schedule!,
      { notes: "", id_number: "", full_name: "", class_name: "", filled_at: "" },
      student,
      fill
    );
    expect(scheduleMerged.full_name).toBe("נועה דמו");
    expect(scheduleMerged.class_name).toBe("ד׳2");
    expect(scheduleMerged.filled_at).toBe("2026-10-12");
    expect(scheduleMerged.notes).toBe("");
    expect(scheduleMerged.id_number).toBe("");
    expect(JSON.stringify(scheduleMerged)).not.toContain("CARD-NOTES-LEAK");
    expect(JSON.stringify(scheduleMerged)).not.toContain("000000018");

    const reportData = { notes: "", id_number: "", full_name: "" };
    const reportMerged = mergePrintFormDataWithStudent(
      report!,
      reportData,
      student,
      fill
    );
    expect(reportMerged).toEqual(reportData);

    const waiverData = {
      student_id_number: "",
      father_name: "",
      mother_name: "",
    };
    expect(
      mergePrintFormDataWithStudent(waiver!, waiverData, student, fill)
    ).toEqual(waiverData);
  });

  it("does not fill a signed or archived schedule", () => {
    const schema = getFormSchema("personal-schedule");
    const merged = mergePrintFormDataWithStudent(
      schema!,
      { full_name: "", class_name: "", filled_at: "" },
      buildPrintFixtureStudent(),
      {
        document_id: "sched-arch-1",
        created_at: "2026-09-15T00:00:00.000Z",
        updated_at: "2026-10-12T00:00:00.000Z",
      }
    );
    expect(merged.full_name).toBe("");
    expect(merged.class_name).toBe("");
    expect(merged.filled_at).toBe("");
  });
});
