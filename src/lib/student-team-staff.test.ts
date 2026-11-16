import { describe, expect, it } from "vitest";
import { rowTableInitialData, tableCellKey } from "@/lib/form-table-grids";
import {
  applyStaffPicksToStudentTeam,
  enrichStudentTeamHomeroomFromInstitutionStaff,
  existingStudentTeamNames,
  STUDENT_TEAM_TABLE_ID,
  toInstitutionStaffPickerRow,
  toStaffFillRecipient,
} from "@/lib/student-team-staff";

describe("applyStaffPicksToStudentTeam", () => {
  it("fills empty rows and skips duplicate names", () => {
    const data = rowTableInitialData(STUDENT_TEAM_TABLE_ID);
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "name")] = "רחל כהן";
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "role")] = "מחנכת";

    const next = applyStaffPicksToStudentTeam(data, [
      { name: "רחל כהן", role: "מחנכת", phone: "050-111" },
      { name: "שרה לוי", role: "מומחית תחום", phone: "050-222" },
      { name: "  שרה לוי  ", role: "אחר" },
    ]);

    expect(next[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "name")]).toBe(
      "רחל כהן"
    );
    expect(next[tableCellKey(STUDENT_TEAM_TABLE_ID, 1, "name")]).toBe(
      "שרה לוי"
    );
    expect(next[tableCellKey(STUDENT_TEAM_TABLE_ID, 1, "role")]).toBe(
      "מומחית תחום"
    );
    expect(next[tableCellKey(STUDENT_TEAM_TABLE_ID, 1, "phone")]).toBe(
      "050-222"
    );
    expect(existingStudentTeamNames(next).has("שרה לוי")).toBe(true);
  });
});

describe("enrichStudentTeamHomeroomFromInstitutionStaff", () => {
  it("TZ-207: fills empty phone on homeroom row without overwriting saved phone", () => {
    const data = rowTableInitialData(STUDENT_TEAM_TABLE_ID);
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "name")] = "רחל כהן";
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "role")] = "מחנכת";
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 1, "name")] = "דנה לוי";
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 1, "role")] = "מחנכת";
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 1, "phone")] = "050-999";

    enrichStudentTeamHomeroomFromInstitutionStaff(
      data,
      [
        {
          id: "1",
          full_name: "רחל כהן",
          role: "מחנכת",
          phone: "050-111",
        },
        {
          id: "2",
          full_name: "דנה לוי",
          role: "מחנכת",
          phone: "050-222",
        },
      ],
      [0, 1]
    );

    expect(data[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "phone")]).toBe(
      "050-111"
    );
    expect(data[tableCellKey(STUDENT_TEAM_TABLE_ID, 1, "phone")]).toBe(
      "050-999"
    );
  });

  it("TZ-207: skips phone when multiple staff share the same name", () => {
    const data = rowTableInitialData(STUDENT_TEAM_TABLE_ID);
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "name")] = "רחל כהן";
    data[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "role")] = "מחנכת";

    enrichStudentTeamHomeroomFromInstitutionStaff(
      data,
      [
        {
          id: "1",
          full_name: "רחל כהן",
          role: "מחנכת",
          phone: "050-111",
        },
        {
          id: "2",
          full_name: "רחל כהן",
          role: "מחנכת",
          phone: "050-222",
        },
      ],
      [0]
    );

    expect(data[tableCellKey(STUDENT_TEAM_TABLE_ID, 0, "phone")] ?? "").toBe(
      ""
    );
  });
});

describe("toInstitutionStaffPickerRow", () => {
  it("keeps only id, full_name, role, and phone", () => {
    const row = toInstitutionStaffPickerRow({
      id: "staff-1",
      full_name: "מורה אחרת",
      role: "קלינאית תקשורת",
      phone: "050-1111111",
      notes: "secret",
      email: "hidden@example.com",
    } as { id: string; full_name: string; role: string; phone: string });
    expect(row).toEqual({
      id: "staff-1",
      full_name: "מורה אחרת",
      role: "קלינאית תקשורת",
      phone: "050-1111111",
    });
    expect(row).not.toHaveProperty("notes");
    expect(row).not.toHaveProperty("email");
  });
});

describe("toStaffFillRecipient", () => {
  it("TZ-188: returns name and email for fill request dropdown", () => {
    const row = toStaffFillRecipient({
      full_name: "מורה אחרת",
      email: "teacher@example.com",
    });
    expect(row).toEqual({
      name: "מורה אחרת",
      email: "teacher@example.com",
    });
  });

  it("TZ-188: returns null when name is missing", () => {
    const row = toStaffFillRecipient({
      full_name: null,
      email: "teacher@example.com",
    });
    expect(row).toBeNull();
  });

  it("TZ-188: returns null when email is missing", () => {
    const row = toStaffFillRecipient({
      full_name: "מורה אחרת",
      email: null,
    });
    expect(row).toBeNull();
  });
});
