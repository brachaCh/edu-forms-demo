import { describe, expect, it } from "vitest";
import {
  CORE_FIELD_DEFS,
  coreFieldLabelPath,
  coreFieldOrderId,
  coreFieldValue,
  coreFieldsForStatus,
  coreNameSavePatch,
  defaultHiddenCoreFields,
  INTEGRATION_FREQUENCY_ORDER_ID,
  resolveCardFieldOrder,
  sanitizePersonalBasketCustomLabels,
} from "@/lib/student-card";
import type { Student } from "@/lib/supabase/types";

describe("coreFieldsForStatus", () => {
  it("מחזיר את שדות כרטיס תלמיד שילוב לפי הסדר המבוקש", () => {
    expect(coreFieldsForStatus("integration")).toEqual([
      "first_name",
      "last_name",
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
      "family_status",
      "single_responsible_party",
      "email",
      "integration_start_date",
      "teacher_name",
      "homeroom_teacher",
      "additional_treatments",
      "notes",
    ]);
  });

  it("מחזיר את שדות כרטיס תלמיד כיתה, כולל אפיון וועדת זכאות", () => {
    const fields = coreFieldsForStatus("special-ed-class");

    expect(fields).toContain("characterization");
    expect(fields).toContain("eligibility_committee_date");
    // המחנכת נשמרת ב-teacher_name — לפיה משויכים התלמידים לכיתה
    expect(fields).toContain("teacher_name");
    expect(fields).not.toContain("homeroom_teacher");
  });

  it("לא מדליף שדות תלמיד לכרטיס איש צוות", () => {
    const staffFields = coreFieldsForStatus("integration-teacher");

    expect(staffFields).toEqual([
      "full_name",
      "phone",
      "email",
      "home_address",
      "role",
      "notes",
    ]);
  });

  it("מחזיר את שדות כרטיס סל אישי לפי הסדר המבוקש", () => {
    expect(coreFieldsForStatus("personal-basket")).toEqual([
      "first_name",
      "last_name",
      "id_number",
      "birth_date",
      "integration_frequency",
      "characterization",
      "class_name",
      "home_address",
      "city",
      "gender",
      "father_name",
      "father_mobile",
      "father_email",
      "mother_name",
      "mother_mobile",
      "mother_email",
      "family_status",
      "single_responsible_party",
      "email",
      "integration_start_date",
      "eligibility_committee_date",
      "teacher_name",
      "homeroom_teacher",
      "education_support",
      "additional_treatments",
      "notes",
    ]);
  });

  it("בסל אישי כתובת וישוב צמודות אחרי מספר זוגי של שדות ב־wizard", () => {
    const wizardKeys = coreFieldsForStatus("personal-basket").filter(
      (key) =>
        key !== "first_name" &&
        key !== "last_name" &&
        key !== "integration_frequency"
    );
    const addressIndex = wizardKeys.indexOf("home_address");
    expect(addressIndex).toBeGreaterThanOrEqual(0);
    expect(addressIndex % 2).toBe(0);
    expect(wizardKeys[addressIndex + 1]).toBe("city");
  });

  it("משאיר כרטיס ללא רשימה ייעודית בלי השדות הייעודיים", () => {
    const generic = coreFieldsForStatus(null);

    for (const key of [
      "role",
      "characterization",
      "family_status",
      "eligibility_committee_date",
    ] as const) {
      expect(generic).not.toContain(key);
    }
  });

  it("כל שדה ליבה מוגדר ב-CORE_FIELD_DEFS", () => {
    const defined = new Set(CORE_FIELD_DEFS.map((field) => field.key));

    for (const status of [
      "integration",
      "special-ed-class",
      "integration-teacher",
      "personal-basket",
      null,
    ] as const) {
      for (const key of coreFieldsForStatus(status)) {
        expect(defined.has(key)).toBe(true);
      }
    }
  });
});

describe("defaultHiddenCoreFields", () => {
  it("מסתיר בדיוק את השדות שאינם שייכים לסוג הכרטיס", () => {
    const hidden = defaultHiddenCoreFields("integration");

    expect(hidden).toContain("characterization");
    expect(hidden).toContain("role");
    expect(hidden).not.toContain("family_status");
  });
});

describe("שם ומשפחה כשני שדות בכרטיס", () => {
  const student = { full_name: "שרה כהן לוי" } as Student;

  it("מפצל את full_name לשם ולמשפחה", () => {
    expect(coreFieldValue(student, "first_name")).toBe("שרה");
    expect(coreFieldValue(student, "last_name")).toBe("כהן לוי");
  });

  it("מרכיב חזרה את full_name בשמירת חלק אחד", () => {
    expect(coreNameSavePatch(student, "last_name", "לוי")).toEqual({
      full_name: "שרה לוי",
    });
    expect(coreNameSavePatch(student, "first_name", "")).toEqual({
      full_name: "כהן לוי",
    });
  });

  it("שומר את מיקום «שם מלא» בסדר שנשמר לפני הפיצול", () => {
    expect(
      resolveCardFieldOrder(
        ["core:id_number", "core:full_name", "core:class_name"],
        ["core:first_name", "core:last_name", "core:id_number", "core:class_name"]
      )
    ).toEqual([
      "core:id_number",
      "core:first_name",
      "core:last_name",
      "core:class_name",
    ]);
  });
});

describe("coreFieldLabelPath", () => {
  it("קורא למורה «מורה אחראית» בשילוב ו«מחנכת» בכיתה", () => {
    expect(coreFieldLabelPath("teacher_name", "integration")).toBe(
      "studentFields.responsibleTeacher"
    );
    expect(coreFieldLabelPath("teacher_name", "special-ed-class")).toBe(
      "studentFields.homeroomTeacher"
    );
  });

  it("קורא למייל «מייל הורים» בכרטיסי תלמיד בלבד", () => {
    expect(coreFieldLabelPath("email", "integration")).toBe(
      "studentFields.parentsEmail"
    );
    expect(coreFieldLabelPath("email", "integration-teacher")).toBe(
      "studentFields.email"
    );
  });

  it("קורא למורה «מורה אחראית» גם בסל אישי", () => {
    expect(coreFieldLabelPath("teacher_name", "personal-basket")).toBe(
      "studentFields.responsibleTeacher"
    );
    expect(coreFieldLabelPath("email", "personal-basket")).toBe(
      "studentFields.parentsEmail"
    );
  });
});

describe("sanitizePersonalBasketCustomLabels", () => {
  it("מסיר שדה נוסף 1–8 וכפילויות עיר/ישוב", () => {
    expect(
      sanitizePersonalBasketCustomLabels([
        "טלפון",
        "שדה נוסף 3",
        "עיר",
        "שדה נוסף 8",
        "מייל",
        "ישוב",
        "יישוב:",
      ])
    ).toEqual(["טלפון", "מייל"]);
  });
});

describe("coreFieldOrderId", () => {
  it("משאיר לשכיחות את המזהה ההיסטורי כדי לא לאבד סדר שמור", () => {
    expect(coreFieldOrderId("integration_frequency")).toBe(
      INTEGRATION_FREQUENCY_ORDER_ID
    );
    expect(coreFieldOrderId("class_name")).toBe("core:class_name");
  });
});
