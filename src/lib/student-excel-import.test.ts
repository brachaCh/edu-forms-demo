import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  countImportPreview,
  formatIdNumberForSave,
  idNumberMatchKey,
  importExcelErrorStatusTextPath,
  normalizeIdNumber,
  parseFrequency,
  parseImportBirthDate,
  parseImportDate,
  parseStudentImportFile,
  stripCharacterizationNoteLines,
} from "@/lib/student-excel-import";
import { getTextByPath } from "@/lib/get-text-by-path";
import { DEFAULT_SITE_TEXTS } from "@/lib/site-text";
import type { Student } from "@/lib/supabase/types";

async function workbookBuffer(
  rows: Record<string, unknown>[]
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("תלמידים");
  if (rows.length === 0) {
    return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  }
  const headers = Object.keys(rows[0] ?? {});
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((header) => row[header] ?? ""));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const emptyExisting: Student[] = [];

describe("parseImportDate / parseImportBirthDate", () => {
  it("parses dmy and iso strings", () => {
    expect(parseImportDate("14/05/2010")).toBe("2010-05-14");
    expect(parseImportBirthDate("14/05/2010")).toBe("2010-05-14");
    expect(parseImportDate("2010-05-14")).toBe("2010-05-14");
    expect(parseImportDate("14.5.2010")).toBe("2010-05-14");
    expect(parseImportDate("14-05-2010")).toBe("2010-05-14");
  });

  it("parses excel serial dates and Date objects", () => {
    // 14/05/2010 ≈ serial 40312
    expect(parseImportDate(40312)).toBe("2010-05-14");
    expect(parseImportBirthDate(40312)).toBe("2010-05-14");
    expect(parseImportDate(new Date(2010, 4, 14))).toBe("2010-05-14");
  });

  it("returns null for empty or unusable values so the column stays optional", () => {
    expect(parseImportDate(null)).toBeNull();
    expect(parseImportDate("")).toBeNull();
    expect(parseImportDate("לא תאריך")).toBeNull();
    expect(parseImportDate(12)).toBeNull();
  });

  it("rejects invalid calendar dates that have impossible day/month combinations", () => {
    expect(parseImportDate("2023-02-31")).toBeNull();
    expect(parseImportDate("31/02/2023")).toBeNull();
    expect(parseImportDate("2023-13-40")).toBeNull();
    expect(parseImportDate("40/13/2023")).toBeNull();
    expect(parseImportDate("2023-04-31")).toBeNull();
    expect(parseImportDate("31.04.2023")).toBeNull();
  });
});

describe("normalizeIdNumber", () => {
  it("strips punctuation and pads to 9 digits", () => {
    expect(normalizeIdNumber("123-456-789")).toBe("123456789");
    expect(normalizeIdNumber(" 12345678 ")).toBe("012345678");
    expect(normalizeIdNumber(12345678)).toBe("012345678");
    expect(normalizeIdNumber("")).toBeNull();
    expect(normalizeIdNumber(null)).toBeNull();
  });
});

describe("formatIdNumberForSave", () => {
  it("pads all-digit IDs to 9 and keeps passports/foreign IDs as typed", () => {
    expect(formatIdNumberForSave("12345678")).toBe("012345678");
    expect(formatIdNumberForSave(" 123456789 ")).toBe("123456789");
    expect(formatIdNumberForSave(12345678)).toBe("012345678");
    expect(formatIdNumberForSave("123-456-789")).toBe("123-456-789");
    expect(formatIdNumberForSave("AB1234567")).toBe("AB1234567");
    expect(formatIdNumberForSave(" P12345678 ")).toBe("P12345678");
    expect(formatIdNumberForSave("")).toBeNull();
    expect(formatIdNumberForSave(null)).toBeNull();
  });
});

describe("idNumberMatchKey", () => {
  it("normalizes numeric IDs and keeps letter IDs for matching", () => {
    expect(idNumberMatchKey("123-456-789")).toBe("123456789");
    expect(idNumberMatchKey("12345678")).toBe("012345678");
    expect(idNumberMatchKey("AB1234567")).toBe("AB1234567");
    expect(idNumberMatchKey("ab1234567")).toBe("AB1234567");
  });

  it("strips spaces and dashes from alphanumeric IDs before uppercasing", () => {
    expect(idNumberMatchKey("AB 123")).toBe("AB123");
    expect(idNumberMatchKey("AB-123")).toBe("AB123");
    expect(idNumberMatchKey("ab 123")).toBe("AB123");
    expect(formatIdNumberForSave("AB 123")).toBe("AB 123");
    expect(formatIdNumberForSave("AB-123")).toBe("AB-123");
  });
});

describe("importExcelErrorStatusTextPath", () => {
  it("uses the dedicated ת.ז. conflict label and keeps חסר שם for missing name", () => {
    expect(importExcelErrorStatusTextPath("id_number_other_status")).toBe(
      "personalArea.importExcelIdNumberOtherStatus"
    );
    expect(importExcelErrorStatusTextPath("missing_name")).toBe(
      "personalArea.importExcelMissingName"
    );
    expect(
      getTextByPath(
        DEFAULT_SITE_TEXTS,
        importExcelErrorStatusTextPath("id_number_other_status")
      )
    ).toBe("ת.ז. כבר קיימת אצל תלמיד בסטטוס/קטגוריה אחרת — לא עודכן");
    expect(
      getTextByPath(
        DEFAULT_SITE_TEXTS,
        importExcelErrorStatusTextPath("missing_name")
      )
    ).toBe("חסר שם");
  });
});

describe("stripCharacterizationNoteLines", () => {
  it("removes אפיון lines only when X matches the file or the card, after trim", () => {
    expect(
      stripCharacterizationNoteLines(
        "אפיון: לקויות למידה\nהערה של המורה\nאפיון: ADHD",
        ["לקויות למידה"]
      )
    ).toBe("הערה של המורה\nאפיון: ADHD");

    expect(
      stripCharacterizationNoteLines("אפיון:  לקויות למידה  \nkeep", [
        "לקויות למידה",
      ])
    ).toBe("keep");

    expect(
      stripCharacterizationNoteLines("אפיון: ישן\nkeep", [null, "ישן"])
    ).toBe("keep");

    expect(
      stripCharacterizationNoteLines("אפיון: משהו שהמורה כתבה\nkeep", [
        "לקויות למידה",
        "לקויות למידה",
      ])
    ).toBe("אפיון: משהו שהמורה כתבה\nkeep");
  });
});

describe("parseFrequency", () => {
  it("parses high frequency values", () => {
    expect(parseFrequency("גבוהה")).toBe("high");
    expect(parseFrequency("גבוה")).toBe("high");
    expect(parseFrequency("high")).toBe("high");
    expect(parseFrequency("שכיחות גבוהה")).toBe("high");
    expect(parseFrequency("  גבוהה  ")).toBe("high");
  });

  it("parses low frequency values", () => {
    expect(parseFrequency("נמוכה")).toBe("low");
    expect(parseFrequency("נמוך")).toBe("low");
    expect(parseFrequency("low")).toBe("low");
    expect(parseFrequency("שכיחות נמוכה")).toBe("low");
  });

  it("returns null for empty or unknown values", () => {
    expect(parseFrequency("")).toBeNull();
    expect(parseFrequency("  ")).toBeNull();
    expect(parseFrequency("unknown")).toBeNull();
    expect(parseFrequency("בינוני")).toBeNull();
  });
});

describe("parseStudentImportFile", () => {
  it("maps Hebrew headers and joins first/last name", async () => {
    const data = await workbookBuffer([
      {
        "שם פרטי": "יוסי",
        "שם משפחה": "כהן",
        טלפון: "0501234567",
        כיתה: "ג1",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].full_name).toBe("יוסי כהן");
    expect(result.rows[0].phone).toBe("0501234567");
    expect(result.rows[0].class_name).toBe("ג1");
  });

  it("maps integration sample headers from attached template", async () => {
    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "123456789",
        "ת. לידה": "14/05/2010",
        כתה: "ג1",
        "ז/נ": "ז",
        כתובת: "רחוב 1",
        ישוב: "ירושלים",
        "שם האב": "אבי",
        "נייד אב": "0501111111",
        "שם האם": "שרה",
        "נייד אם": "0502222222",
        "כתובת מייל": "test@example.com",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].full_name).toBe("יוסי כהן");
    expect(result.rows[0].class_name).toBe("ג1");
    expect(result.rows[0].email).toBe("test@example.com");
  });

  it("TZ-141: maps תאריך כניסה לשילוב from Excel dates and leaves it optional", async () => {
    const withDate = await parseStudentImportFile(
      await workbookBuffer([
        {
          "שם משפחה": "כהן",
          "שם פרטי": "יוסי",
          "תאריך כניסה לשילוב": "02/09/2023",
        },
      ]),
      {
        status: "integration",
        category: "schools",
        existingStudents: emptyExisting,
      }
    );
    expect(withDate.unrecognizedHeaders).toEqual([]);
    expect(withDate.mappedFields).toContain("integration_start_date");
    expect(withDate.rows[0].status).toBe("ok");
    expect(withDate.rows[0].integration_start_date).toBe("2023-09-02");

    const serial = await parseStudentImportFile(
      await workbookBuffer([
        {
          "שם מלא": "נועה לוי",
          "תאריך כניסה לשילוב": 45171, // 2023-09-02
        },
      ]),
      {
        status: "integration",
        category: "schools",
        existingStudents: emptyExisting,
      }
    );
    expect(serial.rows[0].integration_start_date).toBe("2023-09-02");

    const withoutColumn = await parseStudentImportFile(
      await workbookBuffer([{ "שם מלא": "דניאל חן", כיתה: "ג" }]),
      {
        status: "integration",
        category: "schools",
        existingStudents: emptyExisting,
      }
    );
    expect(withoutColumn.rows[0].status).toBe("ok");
    expect(withoutColumn.rows[0].integration_start_date).toBeNull();
    expect(withoutColumn.mappedFields).not.toContain("integration_start_date");
  });

  it("TZ-141: integration sample file includes תאריך כניסה לשילוב", async () => {
    const samplePath = path.join(
      process.cwd(),
      "public/samples/integration-students-sample.xlsx"
    );
    const sampleBuf = await readFile(samplePath);
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.load(sampleBuf as never);
    const headers: string[] = [];
    sampleWb.worksheets[0]?.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? "").trim();
    });
    expect(headers).toContain("תאריך כניסה לשילוב");
    expect(headers).toContain("מצב משפחתי");
    expect(headers).toContain("אחראי יחיד");
    expect(headers).toContain("מחנכת");
    expect(headers).toContain("טיפולים נוספים");
  });

  it("TZ-141: maps optional student-card columns and skips unknown select values", async () => {
    const result = await parseStudentImportFile(
      await workbookBuffer([
        {
          "שם משפחה": "כהן",
          "שם פרטי": "יוסי",
          "מצב משפחתי": "נשואים",
          "אחראי יחיד": "כן — אחראי יחיד",
          מחנכת: "רחל לוי",
          "טיפולים נוספים": "ריפוי בעיסוק",
          "תאריך וועדת אפיון וזכאות": "01/03/2024",
          "תומכת חינוך": "מירי",
          הערות: "הערה מהאקסל",
          "שנה קלנדרית": "5787",
        },
      ]),
      {
        status: "personal-basket",
        category: "schools",
        existingStudents: emptyExisting,
        canAssignTeachers: true,
      }
    );
    expect(result.unrecognizedHeaders).toEqual([]);
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].family_status).toBe("נשואים");
    expect(result.rows[0].single_responsible_party).toBe(true);
    expect(result.rows[0].homeroom_teacher).toBe("רחל לוי");
    expect(result.rows[0].additional_treatments).toBe("ריפוי בעיסוק");
    expect(result.rows[0].eligibility_committee_date).toBe("2024-03-01");
    expect(result.rows[0].education_support).toBe("מירי");
    expect(result.rows[0].notes).toBe("הערה מהאקסל");
    expect(result.rows[0].calendar_year).toBe(5787);
    expect(result.rows[0].fieldWarnings).toEqual([]);

    const unknown = await parseStudentImportFile(
      await workbookBuffer([
        {
          "שם מלא": "נועה לוי",
          "מצב משפחתי": "רווקים",
          "אחראי יחיד": "לא ברור",
          שכיחות: "בינונית",
          מין: "אחר",
        },
      ]),
      {
        status: "personal-basket",
        category: "schools",
        existingStudents: emptyExisting,
      }
    );
    expect(unknown.rows[0].status).toBe("ok");
    expect(unknown.rows[0].family_status).toBeNull();
    expect(unknown.rows[0].single_responsible_party).toBeNull();
    expect(unknown.rows[0].frequency).toBeNull();
    expect(unknown.rows[0].gender).toBeNull();
    expect(unknown.rows[0].fieldWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("מצב משפחתי"),
        expect.stringContaining("אחראי יחיד"),
        expect.stringContaining("שכיחות"),
        expect.stringContaining("מין"),
      ])
    );
  });

  it("imports email, birth date and parent mobiles", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "נועה לוי",
        מייל: "noa@example.com",
        "תאריך לידה": "14/05/2010",
        טלפון: "0501111111",
        "שם האב": "דני לוי",
        "נייד אב": "0502222222",
        "שם האם": "מיכל לוי",
        "טלפון אם": "0503333333",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].email).toBe("noa@example.com");
    expect(result.rows[0].birth_date).toBe("2010-05-14");
    expect(result.rows[0].phone).toBe("0501111111");
    expect(result.rows[0].father_name).toBe("דני לוי");
    expect(result.rows[0].father_mobile).toBe("0502222222");
    expect(result.rows[0].mother_name).toBe("מיכל לוי");
    expect(result.rows[0].mother_mobile).toBe("0503333333");
    expect(result.mappedFields).toEqual(
      expect.arrayContaining([
        "full_name",
        "email",
        "birth_date",
        "phone",
        "father_name",
        "father_mobile",
        "mother_name",
        "mother_mobile",
      ])
    );
  });

  it("marks missing name as error and existing students as update", async () => {
    const existing: Student[] = [
      {
        id: "1",
        institution_id: null,
        category: "schools",
        full_name: "נועה לוי",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "integration",
        class_name: null,
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      { "שם מלא": "נועה לוי", כיתה: "א" },
      { "שם מלא": "", כיתה: "ב" },
      { "שם מלא": "דניאל חן", כיתה: "ג" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].existingStudentId).toBe("1");
    expect(result.rows[1].status).toBe("error");
    expect(result.rows[2].status).toBe("ok");
    expect(countImportPreview(result.rows)).toEqual({
      ok: 1,
      update: 1,
      error: 1,
      duplicate_in_file: 0,
      over_capacity: 0,
      invalid_class: 0,
    });
  });

  it("maps every header from the special-ed sample file including ת.ז.", async () => {
    const samplePath = path.join(
      process.cwd(),
      "public/samples/special-ed-class-students-sample.xlsx"
    );
    const sampleBuf = await readFile(samplePath);
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.load(sampleBuf as never);
    const headers: string[] = [];
    sampleWb.worksheets[0]?.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? "").trim();
    });

    expect(headers).toContain("ת.ז.");
    expect(headers).toContain("מחנכת");
    expect(headers).toContain("תאריך כניסה לשילוב");
    expect(headers).toContain("מצב משפחתי");
    expect(headers).toContain("אחראי יחיד");
    expect(headers).toContain("תאריך וועדת אפיון וזכאות");
    expect(headers).toContain("טיפולים נוספים");
    expect(headers).toContain("הערות");
    expect(headers).toContain("שנה קלנדרית");

    const dataWb = new ExcelJS.Workbook();
    const sheet = dataWb.addWorksheet("תלמידים");
    sheet.addRow(headers);
    sheet.addRow([
      "כהן",
      "יוסי",
      "123456789",
      "14/05/2010",
      "א1",
      "ז",
      "רחוב 1",
      "ירושלים",
      "אבי",
      "0501111111",
      "avi@test.com",
      "שרה",
      "0502222222",
      "sara@test.com",
      "רחל כהן",
      "לקויות למידה",
      "מצליח בקריאה",
    ]);
    const data = (await dataWb.xlsx.writeBuffer()) as ArrayBuffer;

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: emptyExisting,
      knownClassNames: ["א1"],
    });

    expect(result.unrecognizedHeaders).toEqual([]);
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].full_name).toBe("יוסי כהן");
    expect(result.rows[0].id_number).toBe("123456789");
    expect(result.rows[0].birth_date).toBe("2010-05-14");
    expect(result.rows[0].class_name).toBe("א1");
    expect(result.rows[0].gender).toBe("ז");
    expect(result.rows[0].home_address).toBe("רחוב 1");
    expect(result.rows[0].city).toBe("ירושלים");
    expect(result.rows[0].father_name).toBe("אבי");
    expect(result.rows[0].father_mobile).toBe("0501111111");
    expect(result.rows[0].father_email).toBe("avi@test.com");
    expect(result.rows[0].mother_name).toBe("שרה");
    expect(result.rows[0].mother_mobile).toBe("0502222222");
    expect(result.rows[0].mother_email).toBe("sara@test.com");
    expect(result.rows[0].teacher_name).toBe("רחל כהן");
    expect(result.rows[0].characterization).toBe("לקויות למידה");
    expect(result.rows[0].functioning).toBe("מצליח בקריאה");
    expect(result.mappedFields).toEqual(
      expect.arrayContaining([
        "last_name",
        "first_name",
        "id_number",
        "birth_date",
        "class_name",
        "gender",
        "home_address",
        "city",
        "father_name",
        "father_mobile",
        "father_email",
        "mother_name",
        "mother_mobile",
        "mother_email",
        "homeroom_teacher",
        "characterization",
        "functioning",
      ])
    );
  });

  it("strips invisible and bidi characters from parent emails", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "יוסי כהן",
        "מייל אבא": "avi\u200B@test.com",
        "מייל אמא": "\u202Esara@test.com\u202C",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].father_email).toBe("avi@test.com");
    expect(result.rows[0].mother_email).toBe("sara@test.com");
  });

  it("marks in-file duplicates as duplicate_in_file", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "יוסי כהן", כיתה: "א" },
      { "שם מלא": "יוסי כהן", כיתה: "ב" },
      { "שם מלא": "נועה לוי", כיתה: "ג" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: [],
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[1].status).toBe("duplicate_in_file");
    expect(result.rows[2].status).toBe("ok");
    expect(countImportPreview(result.rows)).toEqual({
      ok: 2,
      update: 0,
      error: 0,
      duplicate_in_file: 1,
      over_capacity: 0,
      invalid_class: 0,
    });
  });

  it("special-ed duplicate_in_file keys on name+class, not name only", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "יוסי כהן", כיתה: "א1" },
      { "שם מלא": "יוסי כהן", כיתה: "ב2" },
      { "שם מלא": "יוסי כהן", כיתה: "א1" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
      knownClassNames: ["א1", "ב2"],
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("א1");
    expect(result.rows[1].status).toBe("ok");
    expect(result.rows[1].class_name).toBe("ב2");
    expect(result.rows[2].status).toBe("duplicate_in_file");
  });

  it("special-ed duplicate_in_file treats א1 and א 1 as the same class", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "יוסי כהן", כיתה: "א1" },
      { "שם מלא": "יוסי כהן", כיתה: "א 1" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
      knownClassNames: ["א1"],
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("א1");
    expect(result.rows[1].status).toBe("duplicate_in_file");
    expect(result.rows[1].class_name).toBe("א1");
  });

  it("special-ed without class does not match a same-name student in any class", async () => {
    const existing: Student[] = [
      {
        id: "other-class-1",
        institution_id: null,
        category: "schools",
        full_name: "נועה לוי",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "א1",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([{ "שם מלא": "נועה לוי" }]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].existingStudentId).toBeNull();
    expect(result.rows[0].class_name).toBeNull();
  });

  it("findExistingStudent normalizes both Excel and DB class_name", async () => {
    const existing: Student[] = [
      {
        id: "legacy-1",
        institution_id: null,
        category: "schools",
        full_name: "נועה לוי",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "  כיתה א  ",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      { "שם מלא": "נועה לוי", כיתה: "כיתה א" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["כיתה א"],
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].existingStudentId).toBe("legacy-1");
  });

  it("imports students without planContext (no capacity check)", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "תלמיד א" },
      { "שם מלא": "תלמיד ב" },
      { "שם מלא": "תלמיד ג" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[1].status).toBe("ok");
    expect(result.rows[2].status).toBe("ok");
    expect(countImportPreview(result.rows)).toEqual({
      ok: 3,
      update: 0,
      error: 0,
      duplicate_in_file: 0,
      over_capacity: 0,
      invalid_class: 0,
    });
  });

  it("updates do not affect new student count", async () => {
    const existing: Student[] = [
      {
        id: "1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד קיים",
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

    const data = await workbookBuffer([
      { "שם מלא": "תלמיד קיים", טלפון: "0501111111" },
      { "שם מלא": "תלמיד חדש א" },
      { "שם מלא": "תלמיד חדש ב" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      defaultClassName: "כיתה א",
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[1].status).toBe("ok");
    expect(result.rows[2].status).toBe("ok");
    expect(countImportPreview(result.rows)).toEqual({
      ok: 2,
      update: 1,
      error: 0,
      duplicate_in_file: 0,
      over_capacity: 0,
      invalid_class: 0,
    });
  });

  it("TZ-209: class-page re-import keeps ת.ז. students when Excel has grade letters", async () => {
    const existing: Student[] = [
      {
        id: "multi-1",
        institution_id: null,
        category: "schools",
        full_name: "דנה לוי",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "כתה א2",
        teacher_name: null,
        notes: null,
        id_number: "111222333",
        created_at: "",
        updated_at: "",
      },
      {
        id: "multi-2",
        institution_id: null,
        category: "schools",
        full_name: "רועי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "כתה א2",
        teacher_name: null,
        notes: null,
        id_number: "444555666",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם מלא": "דנה לוי",
        "מספר ת.ז.": "111222333",
        כיתה: "א",
        טלפון: "0502222222",
      },
      {
        "שם מלא": "רועי כהן",
        "מספר ת.ז.": "444555666",
        כיתה: "ב",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["כיתה א", "כיתה ב", "כתה א2"],
      defaultClassName: "כתה א2",
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[1].status).toBe("update");
    expect(result.rows.every((row) => row.class_name === "כתה א2")).toBe(true);
    expect(result.rows[0].classMappedFrom).toBe("א");
    expect(result.rows[1].classMappedFrom).toBe("ב");
    expect(result.rows[0].existingStudentId).toBe("multi-1");
  });

  it("maps special-ed class list columns and default class name", async () => {
    const data = await workbookBuffer([
      {
        "שם התלמיד": "יוסף לוי",
        אפיון: "לקויות למידה",
        "תיאור תפקוד": "מצליח בקריאה",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: emptyExisting,
      defaultClassName: "כיתה א מיוחדת",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].full_name).toBe("יוסף לוי");
    expect(result.rows[0].characterization).toBe("לקויות למידה");
    expect(result.rows[0].functioning).toBe("מצליח בקריאה");
    expect(result.rows[0].class_name).toBe("כיתה א מיוחדת");
    expect(result.mappedFields).toEqual(
      expect.arrayContaining(["full_name", "characterization", "functioning"])
    );
  });

  it("maps every header from the personal-basket sample file including אפיון", async () => {
    const samplePath = path.join(
      process.cwd(),
      "public/samples/personal-basket-students-sample.xlsx"
    );
    const sampleBuf = await readFile(samplePath);
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.load(sampleBuf as never);
    const headers: string[] = [];
    sampleWb.worksheets[0]?.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? "").trim();
    });

    expect(headers).toContain("אפיון");
    expect(headers).toContain("שכיחות");
    expect(headers).toContain("תאריך כניסה לשילוב");
    expect(headers).toContain("מצב משפחתי");
    expect(headers).toContain("תומכת חינוך");
    expect(headers).toContain("תאריך וועדת אפיון וזכאות");

    const dataWb = new ExcelJS.Workbook();
    const sheet = dataWb.addWorksheet("תלמידים");
    sheet.addRow(headers);
    sheet.addRow([
      "כהן",
      "יוסי",
      "123456789",
      "14/05/2010",
      "ג1",
      "ז",
      "רחוב 1",
      "ירושלים",
      "אבי",
      "0501111111",
      "avi@test.com",
      "שרה",
      "0502222222",
      "sara@test.com",
      "גבוהה",
      "רותי כהן",
      "לקות למידה",
    ]);
    const data = (await dataWb.xlsx.writeBuffer()) as ArrayBuffer;

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: emptyExisting,
      canAssignTeachers: true,
    });

    expect(result.unrecognizedHeaders).toEqual([]);
    expect(result.rows[0].characterization).toBe("לקות למידה");
    expect(result.rows[0].frequency).toBe("high");
    expect(result.rows[0].notes).toBeNull();
    expect(result.mappedFields).toContain("characterization");
  });

  it("maps Giti personal-basket headers including אפיון and parent emails", async () => {
    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "123-456-789",
        "ת. לידה": "14/05/2010",
        כתה: "ג1",
        "ז/נ": "ז",
        כתובת: "רחוב 1",
        ישוב: "ירושלים",
        "שם האב": "אבי",
        "נייד אב": "0501111111",
        "שם האם": "שרה",
        "נייד אם": "0502222222",
        "כתובת מייל אמא": "sara@test.com",
        "כתובת מייל אבא": "avi@test.com",
        שכיחות: "גבוהה",
        "מורה אחראית": "רותי",
        אפיון: "לקות למידה",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: emptyExisting,
      canAssignTeachers: true,
    });

    expect(result.unrecognizedHeaders).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].full_name).toBe("יוסי כהן");
    expect(result.rows[0].id_number).toBe("123-456-789");
    expect(result.rows[0].father_email).toBe("avi@test.com");
    expect(result.rows[0].mother_email).toBe("sara@test.com");
    expect(result.rows[0].characterization).toBe("לקות למידה");
    expect(result.rows[0].notes).toBeNull();
    expect(result.rows[0].frequency).toBe("high");
    expect(result.mappedFields).toEqual(
      expect.arrayContaining(["characterization", "father_email", "mother_email"])
    );
  });

  it("matches an existing personal-basket student by normalized ת.ז. even if the name differs", async () => {
    const existing: Student[] = [
      {
        id: "existing-1",
        institution_id: null,
        category: "schools",
        full_name: "שם ישן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: "ג1",
        teacher_name: null,
        notes: "אפיון: ישן",
        id_number: "012345678",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "12345678",
        אפיון: "לקות למידה",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].existingStudentId).toBe("existing-1");
    expect(result.rows[0].characterization).toBe("לקות למידה");
  });

  it("does not treat a same ת.ז. in another status/category as an update", async () => {
    const existing: Student[] = [
      {
        id: "integration-1",
        institution_id: null,
        category: "schools",
        full_name: "יוסי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "integration",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "123456789",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "123456789",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("error");
    expect(result.rows[0].message).toBe("id_number_other_status");
    expect(result.rows[0].existingStudentId).toBeNull();
  });

  it("does not name-match when the ת.ז. belongs to another status/category", async () => {
    const existing: Student[] = [
      {
        id: "integration-1",
        institution_id: null,
        category: "schools",
        full_name: "יוסי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "integration",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "123456789",
        created_at: "",
        updated_at: "",
      },
      {
        id: "basket-same-name",
        institution_id: null,
        category: "schools",
        full_name: "יוסי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "123456789",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("error");
    expect(result.rows[0].message).toBe("id_number_other_status");
    expect(result.rows[0].existingStudentId).toBeNull();
  });

  it("same name with a different ת.ז. creates a new student", async () => {
    const existing: Student[] = [
      {
        id: "existing-1",
        institution_id: null,
        category: "schools",
        full_name: "יוסי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "111111111",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "222222222",
        אפיון: "לקות למידה",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].existingStudentId).toBeNull();
    expect(result.rows[0].id_number).toBe("222222222");
  });

  it("same name still updates when the row has no ת.ז.", async () => {
    const existing: Student[] = [
      {
        id: "existing-1",
        institution_id: null,
        category: "schools",
        full_name: "יוסי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "111111111",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        אפיון: "לקות למידה",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].existingStudentId).toBe("existing-1");
    expect(result.rows[0].id_number).toBeNull();
  });

  it("same name still updates when the existing student has no ת.ז.", async () => {
    const existing: Student[] = [
      {
        id: "existing-no-tz",
        institution_id: null,
        category: "schools",
        full_name: "יוסי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "222222222",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].existingStudentId).toBe("existing-no-tz");
    expect(result.rows[0].id_number).toBe("222222222");
  });

  it("a ת.ז. match takes priority over name", async () => {
    const existing: Student[] = [
      {
        id: "by-name",
        institution_id: null,
        category: "schools",
        full_name: "יוסי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "222222222",
        created_at: "",
        updated_at: "",
      },
      {
        id: "by-tz",
        institution_id: null,
        category: "schools",
        full_name: "שם אחר",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "111111111",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "111111111",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].existingStudentId).toBe("by-tz");
  });

  it("saves a passport/foreign ID as typed and still matches it", async () => {
    const existing: Student[] = [
      {
        id: "passport-1",
        institution_id: null,
        category: "schools",
        full_name: "שם ישן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "ab1234567",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "AB1234567",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].existingStudentId).toBe("passport-1");
    expect(result.rows[0].id_number).toBe("AB1234567");
  });

  it("pads an all-digit ת.ז. to 9 when saving, without stripping a dashed value", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "קצר", "ת.ז.": "12345678" },
      { "שם מלא": "מקווקו", "ת.ז.": "123-456-789" },
      { "שם מלא": "דרכון", "ת.ז.": "AB1234567" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: [],
    });

    expect(result.rows[0].id_number).toBe("012345678");
    expect(result.rows[1].id_number).toBe("123-456-789");
    expect(result.rows[2].id_number).toBe("AB1234567");
  });

  it("does not match an archived student by ת.ז.", async () => {
    const existing: Student[] = [
      {
        id: "archived-1",
        institution_id: null,
        category: "schools",
        full_name: "יוסי כהן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "123456789",
        archived_at: "2026-01-01T00:00:00.000Z",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "ת.ז.": "123456789",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].existingStudentId).toBeNull();
  });

  it("marks in-file duplicate ת.ז. even when names differ", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "יוסי כהן", "ת.ז.": "123456789" },
      { "שם מלא": "יוסף כהן", "ת.ז.": "123-456-789" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: [],
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[1].status).toBe("duplicate_in_file");
  });

  it("does not treat same name with different ת.ז. as an in-file duplicate", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "יוסי כהן", "ת.ז.": "111111111" },
      { "שם מלא": "יוסי כהן", "ת.ז.": "222222222" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: [],
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[1].status).toBe("ok");
    expect(result.rows[0].id_number).toBe("111111111");
    expect(result.rows[1].id_number).toBe("222222222");
  });

  it("name-based in-file duplicate only when at least one row lacks a ת.ז.", async () => {
    const bothNamed = await parseStudentImportFile(
      await workbookBuffer([
        { "שם מלא": "יוסי כהן" },
        { "שם מלא": "יוסי כהן", "ת.ז.": "222222222" },
      ]),
      {
        status: "personal-basket",
        category: "schools",
        existingStudents: [],
      }
    );
    expect(bothNamed.rows[0].status).toBe("ok");
    expect(bothNamed.rows[1].status).toBe("duplicate_in_file");

    const secondLacksId = await parseStudentImportFile(
      await workbookBuffer([
        { "שם מלא": "יוסי כהן", "ת.ז.": "111111111" },
        { "שם מלא": "יוסי כהן" },
      ]),
      {
        status: "personal-basket",
        category: "schools",
        existingStudents: [],
      }
    );
    expect(secondLacksId.rows[0].status).toBe("ok");
    expect(secondLacksId.rows[1].status).toBe("duplicate_in_file");
  });

  it("matches alphanumeric ת.ז. after stripping spaces/dashes and stores as typed", async () => {
    const existing: Student[] = [
      {
        id: "passport-spaced",
        institution_id: null,
        category: "schools",
        full_name: "שם ישן",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "personal-basket",
        class_name: null,
        teacher_name: null,
        notes: null,
        id_number: "AB123",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      { "שם מלא": "יוסי כהן", "ת.ז.": "AB 123" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
    });

    expect(result.rows[0].status).toBe("update");
    expect(result.rows[0].existingStudentId).toBe("passport-spaced");
    expect(result.rows[0].id_number).toBe("AB 123");
  });

  it("parses personal-basket import with frequency column", async () => {
    const data = await workbookBuffer([
      {
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        שכיחות: "גבוהה",
        כתה: "ג1",
      },
      {
        "שם משפחה": "לוי",
        "שם פרטי": "מירב",
        שכיחות: "נמוכה",
        כתה: "ד2",
      },
      {
        "שם משפחה": "דוד",
        "שם פרטי": "רון",
        שכיחות: "",
        כתה: "ה3",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].full_name).toBe("יוסי כהן");
    expect(result.rows[0].frequency).toBe("high");
    expect(result.rows[1].full_name).toBe("מירב לוי");
    expect(result.rows[1].frequency).toBe("low");
    expect(result.rows[2].full_name).toBe("רון דוד");
    expect(result.rows[2].frequency).toBeNull();
    expect(result.mappedFields).toEqual(
      expect.arrayContaining(["first_name", "last_name", "frequency", "class_name"])
    );
  });

  it("omits teacher_name for admin (canAssignTeachers=false)", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "יוסי כהן",
        "מורה אחראית": "רותי מהקובץ",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
      defaultTeacherName: "מורה מהרשימה",
      canAssignTeachers: false,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].teacher_name).toBeNull();
  });

  it("keeps teacher_name for owner (canAssignTeachers=true)", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "יוסי כהן",
        "מורה אחראית": "רותי מהקובץ",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
      canAssignTeachers: true,
    });

    expect(result.rows[0].teacher_name).toBe("רותי מהקובץ");
  });

  it("backward compat: מחנכת alone → both teacher_name and homeroom_teacher", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "דינה לוי",
        מחנכת: "רחל המחנכת",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
      canAssignTeachers: true,
    });

    expect(result.rows[0].homeroom_teacher).toBe("רחל המחנכת");
    expect(result.rows[0].teacher_name).toBe("רחל המחנכת");
  });

  it("both מורה אחראית and מחנכת → each to its own field", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "דינה לוי",
        "מורה אחראית": "שרה המורה",
        מחנכת: "רחל המחנכת",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
      canAssignTeachers: true,
    });

    expect(result.rows[0].teacher_name).toBe("שרה המורה");
    expect(result.rows[0].homeroom_teacher).toBe("רחל המחנכת");
  });

  it("TZ-141: truncates homeroom_teacher and education_support to 120 chars with warning", async () => {
    const longValue = "א".repeat(150);
    const data = await workbookBuffer([
      {
        "שם מלא": "דני כהן",
        מחנכת: longValue,
        "תומכת חינוך": longValue,
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].homeroom_teacher).toBe("א".repeat(120));
    expect(result.rows[0].education_support).toBe("א".repeat(120));
    expect(result.rows[0].fieldWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("מחנכת קוצר"),
        expect.stringContaining("תומכת חינוך קוצר"),
      ])
    );
  });

  it("TZ-141: warns on unparseable integration/committee dates", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "מיכל לוי",
        "תאריך כניסה לשילוב": "לא ברור",
        "תאריך וועדת אפיון וזכאות": "מתישהו",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].integration_start_date).toBeNull();
    expect(result.rows[0].eligibility_committee_date).toBeNull();
    expect(result.rows[0].fieldWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("תאריך כניסה לשילוב לא מזוהה"),
        expect.stringContaining("תאריך ועדה לא מזוהה"),
      ])
    );
  });

  it("warns on unparseable birth_date", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "יוסי כהן",
        "תאריך לידה": "לא ידוע",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].birth_date).toBeNull();
    expect(result.rows[0].fieldWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("תאריך לידה לא מזוהה"),
      ])
    );
  });

  it("warns on invalid calendar date like 2023-02-31", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "רונית דוד",
        "תאריך לידה": "31/02/2023",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].birth_date).toBeNull();
    expect(result.rows[0].fieldWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("תאריך לידה לא מזוהה"),
      ])
    );
  });

  it("shows frequency warning with «לא נשמרת מהקובץ» when unknown value", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "דני כהן",
        "שכיחות": "בינונית",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].frequency).toBeNull();
    expect(result.rows[0].fieldWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("שכיחות לא מוכרת"),
        expect.stringContaining("לא נשמרת מהקובץ"),
      ])
    );
  });

  it("warns when Gregorian year is converted to Hebrew", async () => {
    const data = await workbookBuffer([
      {
        "שם מלא": "שרה לוי",
        "שנה קלנדרית": "2026",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].calendar_year).toBe(5786);
    expect(result.rows[0].fieldWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("2026"),
        expect.stringContaining("הומרה"),
        expect.stringContaining("5786"),
      ])
    );
  });

  it("rejects unknown class from Excel when no plan and no import target class", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "תלמיד א", כיתה: "כיתה לא קיימת" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
      knownClassNames: ["כיתה א", "כיתה ב"],
      // No defaultClassName and no plan — cannot invent a class
    });

    expect(result.rows[0].status).toBe("invalid_class");
    expect(result.rows[0].message).toContain("כיתה לא קיימת");
  });

  it("maps unknown Excel class onto the selected import target when no plan", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "תלמיד א", כיתה: "כיתה לא קיימת" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
      knownClassNames: ["כיתה א", "כיתה ב"],
      defaultClassName: "כיתה א",
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("כיתה א");
    expect(result.rows[0].classMappedFrom).toBe("כיתה לא קיימת");
  });

  it("accepts known class from Excel when no plan", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "תלמיד א", כיתה: "כיתה ב" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
      knownClassNames: ["כיתה א", "כיתה ב"],
      defaultClassName: "כיתה א",
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("כיתה ב");
  });

  it("does not remap a second registered class onto the import target page", async () => {
    const existing: Student[] = [
      {
        id: "s-a",
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

    const data = await workbookBuffer([
      { "שם מלא": "תלמיד חדש ב", כיתה: "כיתה ב" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["כיתה א", "כיתה ב"],
      defaultClassName: "כיתה א",
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("כיתה ב");
    expect(result.rows[0].classMappedFrom).toBeNull();
  });

  it("accepts default class when Excel row has no class", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "תלמיד א" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
      knownClassNames: [],
      defaultClassName: "כיתה חדשה מדיאלוג",
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("כיתה חדשה מדיאלוג");
  });

  it("marks rows over per-class capacity with virtual students", async () => {
    // Create 20 rows - with limit 17, should get 17 ok and 3 over_capacity
    const rows = Array.from({ length: 20 }, (_, i) => ({
      "שם מלא": `תלמיד ${i + 1}`,
    }));
    const data = await workbookBuffer(rows);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
      defaultClassName: "כיתה א",
      knownClassNames: ["כיתה א"],
      planContext: {
        // Use the proper custom plan ID (must match CUSTOM_PLAN_ID = "plan-custom")
        planId: "plan-custom",
        institutionType: "schools",
        educationFramework: "special",
        planCustomClasses: 5, // 5 classes × 17 = 85 total, but per-class limit is still 17
      },
    });

    const counts = countImportPreview(result.rows);
    expect(counts.ok).toBe(17);
    expect(counts.over_capacity).toBe(3);
    expect(result.rows.length).toBe(20);
    
    // First 17 should be ok
    for (let i = 0; i < 17; i++) {
      expect(result.rows[i].status).toBe("ok");
    }
    // Last 3 should be over_capacity
    for (let i = 17; i < 20; i++) {
      expect(result.rows[i].status).toBe("over_capacity");
    }
  });

  it("non-billing-exempt admin over class quota gets error on new class from Excel", async () => {
    // Simulate an institution admin (role=owner/admin) who is NOT is_admin=true
    // They have a plan with class limit of 2, and already have 2 classes
    // Trying to create students in a new (3rd) class should fail

    const existingStudents: Student[] = [
      {
        id: "1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד כיתה א",
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
      {
        id: "2",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד כיתה ב",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "כיתה ב",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    // Try to create student in a new class "כיתה ג" when at limit
    const data = await workbookBuffer([
      { "שם מלא": "תלמיד חדש", כיתה: "כיתה ג" }, // New class - should fail
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents,
      knownClassNames: ["כיתה א", "כיתה ב"],
      planContext: {
        planId: "plan-custom", // Custom plan with class limit
        institutionType: "schools",
        educationFramework: "special",
        planCustomClasses: 2, // Limit is 2, already have 2
      },
    });

    expect(result.rows).toHaveLength(1);
    // Should be rejected because class quota is exceeded
    expect(result.rows[0].status).toBe("invalid_class");
    expect(result.rows[0].message).toContain("מכסת הכיתות");
  });

  it("TZ-84: 15 rows of ד on a 1-class package count as one new class", async () => {
    const data = await workbookBuffer(
      Array.from({ length: 15 }, (_, i) => ({
        "שם מלא": `תלמיד ${i + 1}`,
        כיתה: "ד",
        אפיון: "12",
        "תיאור תפקוד": "גבוהה",
      }))
    );

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: [],
      knownClassNames: ["כיתה"],
      planContext: {
        planId: "plan-3",
        institutionType: "schools",
        educationFramework: "special",
      },
    });

    const counts = countImportPreview(result.rows);
    expect(counts.ok).toBe(15);
    expect(counts.invalid_class).toBe(0);
    expect(result.rows.every((row) => row.class_name === "ד")).toBe(true);
  });

  it("personal-basket empty or whitespace class cell stays empty, never כיתה", async () => {
    const data = await workbookBuffer([
      { "שם מלא": "יוסי כהן", כיתה: "" },
      { "שם מלא": "שרה לוי", כיתה: "   " },
      { "שם מלא": "רון דוד" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((row) => row.class_name == null)).toBe(true);
    expect(result.rows.every((row) => row.class_name !== "כיתה")).toBe(true);
  });

  it("non-special-ed import does not canonicalize class names onto special-ed aliases", async () => {
    const existing: Student[] = [
      {
        id: "existing-1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד חינוך מיוחד",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "כיתה ד׳",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      { "שם מלא": "תלמיד סל אישי", כיתה: "ד" },
    ]);

    const personal = await parseStudentImportFile(data, {
      status: "personal-basket",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["כיתה ד׳"],
    });
    expect(personal.rows[0].status).toBe("ok");
    expect(personal.rows[0].class_name).toBe("ד");

    const integration = await parseStudentImportFile(data, {
      status: "integration",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["כיתה ד׳"],
    });
    expect(integration.rows[0].status).toBe("ok");
    expect(integration.rows[0].class_name).toBe("ד");
  });

  it("TZ-84: maps Excel ד onto existing כיתה ד׳ instead of consuming quota", async () => {
    const existing: Student[] = [
      {
        id: "existing-1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד קיים",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "כיתה ד׳",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      { "שם מלא": "תלמיד חדש", כיתה: "ד" },
      { "שם מלא": "תלמיד קיים", כיתה: "ד'" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["כיתה ד׳"],
      planContext: {
        planId: "plan-3",
        institutionType: "schools",
        educationFramework: "special",
      },
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("כיתה ד׳");
    expect(result.rows[1].status).toBe("update");
    expect(result.rows[1].existingStudentId).toBe("existing-1");
  });

  it("TZ-84: existing class with a different name absorbs the Excel class", async () => {
    const existing: Student[] = [
      {
        id: "owner-1",
        institution_id: null,
        category: "schools",
        full_name: 'תל"כ — איידי',
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "איידי",
        teacher_name: "איידי",
        notes: "__matoah_class_curriculum__",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer(
      Array.from({ length: 15 }, (_, i) => ({
        "שם מלא": `תלמיד ${i + 1}`,
        כיתה: "ד",
        אפיון: "12",
        "תיאור תפקוד": "גבוהה",
      }))
    );

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["איידי"],
      defaultClassName: "איידי",
      planContext: {
        planId: "plan-3",
        institutionType: "schools",
        educationFramework: "special",
      },
    });

    const counts = countImportPreview(result.rows);
    expect(counts.ok).toBe(15);
    expect(counts.invalid_class).toBe(0);
    expect(result.rows.every((row) => row.class_name === "איידי")).toBe(true);
    expect(result.rows.every((row) => row.classMappedFrom === "ד")).toBe(true);
  });

  it("TZ-84: a 1-class package maps unmatched Excel ד onto the single existing class", async () => {
    const existing: Student[] = [
      {
        id: "1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד איידי",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "איידי",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer(
      Array.from({ length: 15 }, (_, i) => ({
        "שם מלא": `תלמיד ${i + 1}`,
        כיתה: "ד",
      }))
    );

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["איידי"],
      planContext: {
        planId: "plan-3",
        institutionType: "schools",
        educationFramework: "special",
      },
    });

    expect(result.rows.every((row) => row.status === "ok")).toBe(true);
    expect(result.rows.every((row) => row.class_name === "איידי")).toBe(true);
    expect(result.rows[0].classMappedFrom).toBe("ד");
  });

  it("TZ-84: a deleted class does not consume quota so Excel ד can open the one new class", async () => {
    const existing: Student[] = [
      {
        id: "archived-1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד ארכיון",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "איידי",
        teacher_name: null,
        notes: null,
        archived_at: "2026-10-20T00:00:00.000Z",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer(
      Array.from({ length: 15 }, (_, i) => ({
        "שם מלא": `תלמיד ${i + 1}`,
        כיתה: "ד",
      }))
    );

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["איידי"],
      planContext: {
        planId: "plan-3",
        institutionType: "schools",
        educationFramework: "special",
      },
    });

    const counts = countImportPreview(result.rows);
    expect(counts.ok).toBe(15);
    expect(counts.invalid_class).toBe(0);
    expect(result.rows.every((row) => row.class_name === "ד")).toBe(true);
    expect(result.rows.every((row) => !row.classMappedFrom)).toBe(true);
  });

  it("TZ-84: stale localStorage ד does not block mapping onto the live class", async () => {
    const existing: Student[] = [
      {
        id: "owner-1",
        institution_id: null,
        category: "schools",
        full_name: 'תל"כ — איידי',
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "איידי",
        teacher_name: "איידי",
        notes: "__matoah_class_curriculum__",
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      { "שם מלא": "תלמיד 1", כיתה: "ד" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["ד", "איידי"],
      defaultClassName: "איידי",
      planContext: {
        planId: "plan-3",
        institutionType: "schools",
        educationFramework: "special",
      },
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("איידי");
    expect(result.rows[0].classMappedFrom).toBe("ד");
  });

  it("TZ-84: quota fallback remapping still detects in-file duplicates", async () => {
    const existing: Student[] = [
      {
        id: "1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד איידי",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "איידי",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer([
      { "שם מלא": "אותו תלמיד", כיתה: "ד" },
      { "שם מלא": "אותו תלמיד", כיתה: "איידי" },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["איידי"],
      planContext: {
        planId: "plan-3",
        institutionType: "schools",
        educationFramework: "special",
      },
    });

    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].class_name).toBe("איידי");
    expect(result.rows[1].status).toBe("duplicate_in_file");
  });

  it("TZ-84: a genuine extra class still fails when two classes already fill the quota", async () => {
    const existing: Student[] = [
      {
        id: "1",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד כיתה א",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "א",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
      {
        id: "2",
        institution_id: null,
        category: "schools",
        full_name: "תלמיד כיתה ב",
        phone: null,
        father_name: null,
        mother_name: null,
        status: "special-ed-class",
        class_name: "ב",
        teacher_name: null,
        notes: null,
        created_at: "",
        updated_at: "",
      },
    ];

    const data = await workbookBuffer(
      Array.from({ length: 3 }, (_, i) => ({
        "שם מלא": `תלמיד ${i + 1}`,
        כיתה: "ד",
      }))
    );

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: existing,
      knownClassNames: ["א", "ב"],
      planContext: {
        planId: "plan-custom",
        institutionType: "schools",
        educationFramework: "special",
        planCustomClasses: 2,
      },
    });

    expect(result.rows.every((row) => row.status === "invalid_class")).toBe(true);
    expect(result.rows[0].message).toContain("מכסת הכיתות");
    expect(result.rows[0].message).toContain("הכיתות הקיימות:");
    expect(result.rows[0].message).toContain("לשדרג את החבילה");
  });

  it("TZ-206: pairs שם + משפחה columns into full_name", async () => {
    const data = await workbookBuffer([
      {
        שם: "דוד",
        משפחה: "כהן",
        כיתה: "ח1",
      },
    ]);

    const result = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "kindergartens",
      existingStudents: emptyExisting,
    });

    expect(result.rows[0].full_name).toBe("דוד כהן");
    expect(result.mappedFields).toEqual(
      expect.arrayContaining(["first_name", "last_name"])
    );
  });

  it("TZ-206: maps quoted last name and English header", async () => {
    const data = await workbookBuffer([
      {
        '"שם משפחה"': "לוי",
        "שם פרטי": "שרה",
      },
    ]);

    const dataEn = await workbookBuffer([
      {
        "last name": "לוי",
        "first name": "שרה",
      },
    ]);

    const he = await parseStudentImportFile(data, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: emptyExisting,
    });
    const en = await parseStudentImportFile(dataEn, {
      status: "special-ed-class",
      category: "schools",
      existingStudents: emptyExisting,
    });

    expect(he.rows[0].full_name).toBe("שרה לוי");
    expect(en.rows[0].full_name).toBe("שרה לוי");
  });
});
