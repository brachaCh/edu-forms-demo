import { describe, expect, it } from "vitest";
import {
  buildMisfiledContactRepairPatch,
  routeCoreFieldSavePatch,
} from "@/lib/form-fields";
import {
  DEFAULT_SITE_TEXTS,
  applyStudentFieldCaptionEdit,
} from "@/lib/site-text";

describe("applyStudentFieldCaptionEdit", () => {
  it("redirects birthDate→phone caption to the phone field", () => {
    const result = applyStudentFieldCaptionEdit(
      DEFAULT_SITE_TEXTS,
      "studentFields.birthDate",
      "טלפון"
    );

    expect(result.path).toBe("studentFields.phone");
    expect(result.texts.studentFields.birthDate).toBe(
      DEFAULT_SITE_TEXTS.studentFields.birthDate
    );
    expect(result.texts.studentFields.phone).toBe("טלפון");
  });

  it("keeps ordinary birthDate renames on birthDate", () => {
    const result = applyStudentFieldCaptionEdit(
      DEFAULT_SITE_TEXTS,
      "studentFields.birthDate",
      "תאריך לידה מלא"
    );

    expect(result.path).toBe("studentFields.birthDate");
    expect(result.value).toBe("תאריך לידה מלא");
    expect(result.texts).toBe(DEFAULT_SITE_TEXTS);
  });
});

describe("routeCoreFieldSavePatch", () => {
  it("routes phone typed into birth_date to phone", () => {
    expect(routeCoreFieldSavePatch("birth_date", "0501234567")).toEqual({
      phone: "0501234567",
      birth_date: null,
    });
  });

  it("routes date typed into phone to birth_date", () => {
    expect(routeCoreFieldSavePatch("phone", "03/08/2020")).toEqual({
      birth_date: "2020-08-03",
      phone: null,
    });
  });
});

describe("buildMisfiledContactRepairPatch swap", () => {
  it("swaps inverted phone and birth_date values", () => {
    const patch = buildMisfiledContactRepairPatch({
      id: "s1",
      institution_id: null,
      category: "schools",
      full_name: "בדיקה",
      phone: "03/08/2020",
      father_name: null,
      mother_name: null,
      status: "integration",
      class_name: null,
      teacher_name: null,
      notes: null,
      id_number: null,
      birth_date: "0501234567",
      gender: null,
      home_address: null,
      city: null,
      father_mobile: null,
      mother_mobile: null,
      email: null,
      created_at: "",
      updated_at: "",
    });

    expect(patch).toEqual({
      birth_date: "2020-08-03",
      phone: "0501234567",
    });
  });
});
