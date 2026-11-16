import { describe, expect, it } from "vitest";
import {
  isTenantForbiddenError,
  teacherNameForExcelImport,
  teacherNameForWizardCreate,
  teacherNameForWrite,
  teacherNamePrefill,
} from "./teacher-assignment";

describe("TZ-32: teacher assignment helpers", () => {
  describe("admin wizard create with defaultTeacher", () => {
    it("omits teacher_name", () => {
      expect(teacherNamePrefill("רותי כהן", false)).toBe("");
      expect(
        teacherNameForWizardCreate({
          formTeacherName: "רותי כהן",
          defaultTeacher: "רותי כהן",
          canAssignTeachers: false,
        })
      ).toBeNull();
    });

    it("owner still uses defaultTeacher", () => {
      expect(teacherNamePrefill("רותי כהן", true)).toBe("רותי כהן");
      expect(
        teacherNameForWizardCreate({
          formTeacherName: "",
          defaultTeacher: "רותי כהן",
          canAssignTeachers: true,
        })
      ).toBe("רותי כהן");
    });
  });

  describe("import dialogs omit teacher_name for admin", () => {
    it("StudentExcelImportDialog / FrequencyExcelImportDialog strip assignment", () => {
      expect(teacherNameForExcelImport("מורה מהקובץ", false)).toBeNull();
      expect(teacherNameForExcelImport("מורה מהקובץ", true)).toBe(
        "מורה מהקובץ"
      );
      expect(teacherNameForWrite("  רותי  ", false)).toBeNull();
    });
  });

  describe("isTenantForbiddenError", () => {
    it("maps ADMIN_CANNOT_ASSIGN_TEACHER to 403", () => {
      expect(isTenantForbiddenError("ADMIN_CANNOT_ASSIGN_TEACHER")).toBe(true);
      expect(isTenantForbiddenError("MEMBER_CANNOT_CHANGE_TEACHER")).toBe(true);
      expect(isTenantForbiddenError("STUDENT_NOT_FOUND")).toBe(false);
    });
  });
});
