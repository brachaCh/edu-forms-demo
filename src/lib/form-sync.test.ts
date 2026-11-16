import { describe, expect, it } from "vitest";
import { formSupportsVoiceRecording, getFormSchema } from "@/lib/form-schemas";
import {
  applyLearningClusterSubjectPrefill,
  applyStudentCardBackedScheduleFields,
  buildCardPatchFromFormFills,
  buildFormInitialData,
  formUsesLearningClusterSubjects,
  parseLearningClusterSubjects,
  studentPatchFromFormData,
} from "@/lib/form-sync";
import { buildMisfiledContactRepairPatch } from "@/lib/form-fields";
import type { FormSchema } from "@/lib/form-schemas";
import { fillsForPortfolioCreateNew } from "@/lib/portfolio-form-fills";
import type { Student, StudentFormFill } from "@/lib/supabase/types";

function baseStudent(): Student {
  return {
    id: "s1",
    institution_id: null,
    category: "schools",
    full_name: "יעל כהן",
    phone: "0500000000",
    father_name: "אבי כהן",
    mother_name: "שרה כהן",
    status: "integration",
    class_name: "ג1",
    teacher_name: "רותי",
    notes: null,
    id_number: "123456789",
    birth_date: "2016-05-10",
    gender: "נ",
    home_address: "רחוב הרצל 1",
    city: "ירושלים",
    father_mobile: "0501111111",
    mother_mobile: "0502222222",
    email: "yael@example.com",
    created_at: "",
    updated_at: "",
  };
}

function schemaById(formId: string): FormSchema {
  const schema = getFormSchema(formId);
  expect(schema).toBeTruthy();
  return schema as FormSchema;
}

describe("form sync", () => {
  it("prefills student-backed fields even when the schema field is not shared", () => {
    const schema = schemaById("referral-questionnaire-kindergarten");
    const initial = buildFormInitialData(schema, baseStudent());

    expect(initial.id_number).toBe("123456789");
    expect(initial.birth_date).toBe("2016-05-10");
    expect(initial.home_address).toBe("רחוב הרצל 1");
    expect(initial.email).toBe("yael@example.com");
    expect(initial.parent1_phone).toBe("0501111111");
    expect(initial.parent2_phone).toBe("0502222222");
    expect(initial.gender).toBe("female");
    expect(initial.teacher_name ?? "").toBe("");
    expect(initial.kindergarten_manager ?? "").toBe("");
  });

  it("prefills school referral questionnaire without mapping teacher to מחנך", () => {
    const schema = schemaById("referral-questionnaire");
    const initial = buildFormInitialData(schema, baseStudent());

    expect(initial.id_number).toBe("123456789");
    expect(initial.homeroom_teacher ?? "").toBe("");
    expect(initial.teacher_name ?? "").toBe("");
  });

  it("prefills school name and institution code from the user institution", () => {
    const schema = schemaById("referral-questionnaire-multidisciplinary");
    const initial = buildFormInitialData(schema, baseStudent(), null, [], [], {
      school_name: "בית ספר הדוגמה",
      institution_name: "מוסד הדוגמה",
      institution_code: "123456",
    });

    expect(initial.school_name).toBe("בית ספר הדוגמה");
    expect(initial.institution_code).toBe("123456");
  });

  it("prefills family status from the student card in multidisciplinary referral", () => {
    const schema = schemaById("referral-questionnaire-multidisciplinary");
    const initial = buildFormInitialData(schema, {
      ...baseStudent(),
      family_status: "נשואים",
    });

    expect(initial.family_status).toBe("נשואים");
  });

  it("prefills class from the student card in multidisciplinary referral", () => {
    const schema = schemaById("referral-questionnaire-multidisciplinary");
    const initial = buildFormInitialData(schema, {
      ...baseStudent(),
      class_name: "ה3",
    });

    expect(initial.class_name).toBe("ה3");
  });

  it("student card class overrides an empty saved draft", () => {
    const schema = schemaById("referral-questionnaire-multidisciplinary");
    const initial = buildFormInitialData(
      schema,
      { ...baseStudent(), class_name: "ה3" },
      { class_name: "" }
    );

    expect(initial.class_name).toBe("ה3");
  });

  it("student card class overrides a stale value in a saved draft", () => {
    const schema = schemaById("referral-questionnaire-multidisciplinary");
    const initial = buildFormInitialData(
      schema,
      { ...baseStudent(), class_name: "ה3" },
      { class_name: "ג1" }
    );

    expect(initial.class_name).toBe("ה3");
  });

  it("maps class_level field alias from the student card", () => {
    const schema = schemaById("moe-psychologist-code-change");
    const initial = buildFormInitialData(schema, {
      ...baseStudent(),
      class_name: "ד2",
    });

    expect(initial.class_level).toBe("ד2");
  });

  it("prefills appendix 6.11 from the student card and institution", () => {
    const schema = schemaById("moe-eligibility-renewal");
    const initial = buildFormInitialData(
      schema,
      { ...baseStudent(), class_name: "ו2" },
      null,
      [],
      [],
      {
        school_name: "בית ספר הדוגמה",
        institution_code: "312512",
      }
    );

    expect(initial.first_name).toBe("יעל");
    expect(initial.last_name).toBe("כהן");
    expect(initial.id_number).toBe("123456789");
    expect(initial.birth_date).toBe("2016-05-10");
    expect(initial.gender).toBe("female");
    expect(initial.parent1_name).toBe("אבי כהן");
    expect(initial.parent2_name).toBe("שרה כהן");
    expect(initial.class_level).toBe("ו2");
    expect(initial.school_name).toBe("בית ספר הדוגמה");
    expect(initial.school_code).toBe("312512");
    expect(initial.school_year).toMatch(/^תש/);
  });

  it("prefills the school website photo consent form from the student card", () => {
    const schema = schemaById("moe-school-website-photo-consent");
    const initial = buildFormInitialData(schema, {
      ...baseStudent(),
      class_name: "ו2",
    });

    expect(initial.full_name).toBe("יעל כהן");
    expect(initial.class_level).toBe("ו2");
  });

  it("maps family status to kindergarten select options when prefilling", () => {
    const schema = schemaById("referral-questionnaire-kindergarten");
    const initial = buildFormInitialData(schema, {
      ...baseStudent(),
      family_status: "גרושים",
    });

    expect(initial.family_status).toBe("divorced");
  });

  it("does not overwrite a saved school name with institution prefill", () => {
    const schema = schemaById("referral-questionnaire");
    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      { school_name: "בית ספר שנשמר", institution_code: "999" },
      [],
      [],
      {
        school_name: "בית ספר מהפרופיל",
        institution_code: "111",
      }
    );

    expect(initial.school_name).toBe("בית ספר שנשמר");
    expect(initial.institution_code).toBe("999");
  });

  it("fills empty saved school fields from institution prefill", () => {
    const schema = schemaById("referral-questionnaire-multidisciplinary");
    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      { school_name: "", institution_code: "" },
      [],
      [],
      {
        school_name: "בית ספר מהפרופיל",
        institution_code: "555",
      }
    );

    expect(initial.school_name).toBe("בית ספר מהפרופיל");
    expect(initial.institution_code).toBe("555");
  });

  it("prefills student-info from the card without putting teacher into מחנכת", () => {
    const schema = schemaById("student-info");
    const initial = buildFormInitialData(schema, baseStudent());

    expect(initial.full_name).toBe("יעל כהן");
    expect(initial.id_number).toBe("123456789");
    expect(initial.birth_date).toBe("2016-05-10");
    expect(initial.home_address).toBe("רחוב הרצל 1");
    expect(initial.city).toBe("ירושלים");
    expect(initial.phone).toBe("0500000000");
    expect(initial.email).toBe("yael@example.com");
    expect(initial.father_mobile).toBe("0501111111");
    expect(initial.mother_mobile).toBe("0502222222");
    expect(initial.father_name).toBe("אבי כהן");
    expect(initial.mother_name).toBe("שרה כהן");
    expect(initial.class_name).toBe("ג1");
    expect(initial.homeroom_teacher ?? "").toBe("");
    expect(initial.teacher_name ?? "").toBe("");
  });

  it("prefills repeated exact-key values from other forms", () => {
    const schema = schemaById("referral-questionnaire");
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "student-info",
        data: {
          siblings_count: "4",
          birth_order: "2",
          filled_at: "2026-07-01",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.siblings_count).toBe("4");
    expect(initial.birth_order).toBe("2");
    expect(initial.filled_at).toBe("");
  });

  it("does not copy parent signatures from waiver or other forms into referral", () => {
    const schema = schemaById("referral-questionnaire");
    const fills: StudentFormFill[] = [
      {
        id: "waiver",
        student_id: "s1",
        form_id: "waiver-multidisciplinary-team",
        data: {
          parent1_signature: "data:image/png;base64,WAIVER1",
          parent2_signature: "data:image/png;base64,WAIVER2",
          father_signature: "data:image/png;base64,DAD",
          mother_signature: "data:image/png;base64,MOM",
        },
        status: "completed",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.parent1_signature ?? "").toBe("");
    expect(initial.parent2_signature ?? "").toBe("");
    expect(initial.father_signature ?? "").toBe("");
    expect(initial.mother_signature ?? "").toBe("");
  });

  it("prefills class_name and homeroom_teacher from the student card and prior forms", () => {
    const schedule = schemaById("personal-schedule");
    const withCard = buildFormInitialData(
      schedule,
      { ...baseStudent(), class_name: "ב2", homeroom_teacher: "רחל" },
      null,
      []
    );
    expect(withCard.full_name).toBe("יעל כהן");
    expect(withCard.class_name).toBe("ב2");

    const restored = applyStudentCardBackedScheduleFields(
      schedule,
      { ...baseStudent(), class_name: "ד׳4" },
      { sched_sun_p1: "חשבון" }
    );
    expect(restored.full_name).toBe("יעל כהן");
    expect(restored.class_name).toBe("ד׳4");
    expect(restored.sched_sun_p1).toBe("חשבון");

    const withHomeroomSchema = schemaById("student-info");
    const fills: StudentFormFill[] = [
      {
        id: "basket",
        student_id: "s1",
        form_id: "personal-basket-card",
        data: {
          class_name: "ג3",
          homeroom_teacher: "מירי כהן",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];
    const fromForms = buildFormInitialData(
      withHomeroomSchema,
      { ...baseStudent(), class_name: "", homeroom_teacher: "" },
      null,
      fills
    );
    expect(fromForms.class_name).toBe("ג3");
    expect(fromForms.homeroom_teacher).toBe("מירי כהן");
  });

  it("prefills by meaning when field keys differ between forms", () => {
    const schema = schemaById("waiver-confidentiality");
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "referral-questionnaire",
        data: {
          id_number: "999888777",
          first_name: "דנה",
          last_name: "לוי",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const student = {
      ...baseStudent(),
      full_name: "",
      id_number: null,
    };
    const initial = buildFormInitialData(schema, student, null, fills);

    expect(initial.student_id_number).toBe("999888777");
    expect(initial.student_name).toBe("דנה לוי");
  });

  it("splits full_name from the student card into first/last name fields", () => {
    const schema = schemaById("referral-questionnaire");
    const initial = buildFormInitialData(schema, baseStudent());

    expect(initial.first_name).toBe("יעל");
    expect(initial.last_name).toBe("כהן");
  });

  it("writes implicit student fields back to the card", () => {
    const schema = schemaById("referral-questionnaire");
    const patch = studentPatchFromFormData(schema, {
      id_number: "987654321",
      birth_date: "2017-01-01",
      email: "new@example.com",
      parent1_phone: "0503333333",
      parent2_phone: "0504444444",
    });

    expect(patch.id_number).toBe("987654321");
    expect(patch.birth_date).toBe("2017-01-01");
    expect(patch.email).toBe("new@example.com");
    expect(patch.father_mobile).toBe("0503333333");
    expect(patch.mother_mobile).toBe("0504444444");
  });

  it("does not clear existing card fields with empty form values", () => {
    const schema = schemaById("waiver-confidentiality");
    const patch = studentPatchFromFormData(schema, {
      student_name: "אורי לוי",
      student_id_number: "",
      father_name: "",
      mother_name: "",
    });

    expect(patch.full_name).toBe("אורי לוי");
    expect(patch.id_number).toBeUndefined();
    expect(patch.father_name).toBeUndefined();
    expect(patch.mother_name).toBeUndefined();
  });

  it("prefers saved waiver fill over student card for ID and parent IDs", () => {
    const schema = schemaById("waiver-confidentiality");
    const student = {
      ...baseStudent(),
      id_number: "111111111",
    };
    const saved = {
      student_id_number: "222222222",
      father_id: "333333333",
      mother_id: "444444444",
    };
    const initial = buildFormInitialData(schema, student, saved);

    expect(initial.student_id_number).toBe("222222222");
    expect(initial.father_id).toBe("333333333");
    expect(initial.mother_id).toBe("444444444");
  });

  it("routes phone/email typed into parent-name fields to the right card keys", () => {
    const schema = schemaById("waiver-confidentiality");
    const patch = studentPatchFromFormData(schema, {
      father_name: "0533198544",
      mother_name: "parent@example.com",
    });

    expect(patch.father_name).toBeUndefined();
    expect(patch.mother_name).toBeUndefined();
    expect(patch.father_mobile).toBe("0533198544");
    expect(patch.email).toBe("parent@example.com");
  });

  it("repairs card when parent-name fields hold phone/email values", () => {
    const patch = buildMisfiledContactRepairPatch({
      ...baseStudent(),
      father_name: "0556733052",
      mother_name: "parent@example.com",
      phone: "",
      email: "demo@example.com",
      father_mobile: "0533195844",
      mother_mobile: "0533647855",
    });

    expect(patch).toEqual({
      phone: "0556733052",
      father_name: null,
      mother_name: null,
    });
  });

  it("repairs card when phone holds a date value", () => {
    const patch = buildMisfiledContactRepairPatch({
      ...baseStudent(),
      phone: "03/08/2020",
      birth_date: null,
    });

    expect(patch).toEqual({
      birth_date: "2020-08-03",
      phone: null,
    });
  });

  it("hydrates empty card fields from all saved forms", () => {
    const student = {
      ...baseStudent(),
      id_number: null,
      email: null,
      city: null,
      birth_date: null,
    };
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "student-info",
        data: {
          id_number: "111222333",
          email: "from-form@example.com",
          city: "תל אביב",
          birth_date: "2015-03-01",
          homeroom_teacher: "לא אמור להיכנס כמורה",
        },
        status: "completed",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const patch = buildCardPatchFromFormFills(student, fills);

    expect(patch.id_number).toBe("111222333");
    expect(patch.email).toBe("from-form@example.com");
    expect(patch.city).toBe("תל אביב");
    expect(patch.birth_date).toBe("2015-03-01");
    expect(patch.teacher_name).toBeUndefined();
    expect(patch.full_name).toBeUndefined();
  });

  it("does not overwrite existing card values when hydrating from forms", () => {
    const patch = buildCardPatchFromFormFills(baseStudent(), [
      {
        id: "f1",
        student_id: "s1",
        form_id: "referral-questionnaire",
        data: { id_number: "999", email: "other@example.com" },
        status: "completed",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ]);

    expect(Object.keys(patch)).toHaveLength(0);
  });

  it("keeps card values over stale draft when reopening a form", () => {
    const schema = schemaById("student-info");
    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      {
        email: "old-draft@example.com",
        id_number: "000",
      },
      []
    );

    expect(initial.email).toBe("yael@example.com");
    expect(initial.id_number).toBe("123456789");
  });

  it("TZ-209: saving a form does not move special-ed student by grade alias", () => {
    const schema = schemaById("referral-questionnaire-multidisciplinary");
    const patch = studentPatchFromFormData(
      schema,
      { class_name: "א" },
      {
        ...baseStudent(),
        status: "special-ed-class",
        class_name: "כתה א2",
      },
      ["כיתה א", "כתה א2", "כיתה ג"]
    );
    expect(patch.class_name).toBeUndefined();
  });

  it("TZ-209: saving a form writes exact live class name when provided", () => {
    const schema = schemaById("referral-questionnaire-multidisciplinary");
    const known = ["כיתה א", "כתה א2", "כיתה ג"];
    const patch = studentPatchFromFormData(
      schema,
      { class_name: "כיתה ג" },
      {
        ...baseStudent(),
        status: "special-ed-class",
        class_name: "כתה א2",
      },
      known
    );
    expect(patch.class_name).toBe("כיתה ג");
  });

  it("does not overwrite class-curriculum owner identity from form fields", () => {
    const schema = schemaById("class-profile");
    const owner = {
      ...baseStudent(),
      full_name: 'תל"כ — כיתה',
      teacher_name: "כיתה",
      notes: "__matoah_class_curriculum__",
      status: "special-ed-class" as const,
    };
    const patch = studentPatchFromFormData(
      schema,
      {
        class_name: "ד2",
        teacher_name: "רותי המחנכת",
        full_name: "לא אמור להישמר",
      },
      owner
    );

    expect(patch.class_name).toBe("ד2");
    expect(patch.teacher_name).toBeUndefined();
    expect(patch.full_name).toBeUndefined();
  });

  it("prefills integration_start_date from a matching custom card field", () => {
    const schema = schemaById("student-info");
    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      null,
      [],
      [
        {
          id: "cf1",
          student_id: "s1",
          label: "תאריך כניסה לשילוב",
          value: "02/08/2026",
          created_at: "",
          updated_at: "",
        },
      ]
    );

    expect(initial.integration_start_date).toBe("2026-08-02");
  });

  it("TZ-75: prefills personal-schedule cells from the shiluv schedule form", () => {
    const schema = schemaById("personal-schedule");
    const fills: StudentFormFill[] = [
      {
        id: "sch",
        student_id: "s1",
        form_id: "schedule",
        data: {
          sched_sun_p3: "מורה דמו\nחשבון",
          sched_sun_p3_synced_by: "מורה דמו",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.sched_sun_p3).toBe("מורה דמו\nחשבון");
    expect(initial.sched_sun_p3_synced_by).toBe("מורה דמו");
    expect(initial.sched_sun_p3_in_class ?? "").toBe("");
    expect(initial.sched_sun_p3_other ?? "").toBe("");
  });

  it("TZ-75: does not overwrite in-class/other marks already saved on personal-schedule", () => {
    const schema = schemaById("personal-schedule");
    const fills: StudentFormFill[] = [
      {
        id: "sch",
        student_id: "s1",
        form_id: "schedule",
        data: { sched_mon_p2: "מורה א\nקריאה" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      {
        sched_mon_p2: "מורה ב\nעברית",
        sched_mon_p2_in_class: "1",
      },
      fills
    );

    expect(initial.sched_mon_p2).toBe("מורה ב\nעברית");
    expect(initial.sched_mon_p2_in_class).toBe("1");
  });

  it("TZ-75: does not refill a cleared personal-schedule cell on reopen", () => {
    const schema = schemaById("personal-schedule");
    const fills: StudentFormFill[] = [
      {
        id: "personal",
        student_id: "s1",
        form_id: "personal-schedule",
        data: {
          sched_sun_p3: "",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      },
      {
        id: "sch",
        student_id: "s1",
        form_id: "schedule",
        data: {
          sched_sun_p3: "מורה דמו\nחשבון",
          sched_sun_p3_synced_by: "מורה דמו",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      fills[0].data,
      fills
    );

    expect(initial.sched_sun_p3 ?? "").toBe("");
    expect(initial.sched_sun_p3_synced_by ?? "").toBe("");
  });

  it("TZ-75: existing schedule-detailed fill including empty cells is the open base", () => {
    const schema = schemaById("personal-schedule");
    const fills: StudentFormFill[] = [
      {
        id: "detailed",
        student_id: "s1",
        form_id: "schedule-detailed",
        data: {
          sched_sun_p3: "",
          sched_sun_p3_in_class: "1",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      },
      {
        id: "sch",
        student_id: "s1",
        form_id: "schedule",
        data: {
          sched_sun_p3: "מורה דמו\nחשבון",
          sched_sun_p3_in_class: "1",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.sched_sun_p3 ?? "").toBe("");
    expect(initial.sched_sun_p3_in_class).toBe("1");
  });

  it("TZ-75 open: passed-in data wins over an older own fill", () => {
    const schema = schemaById("personal-schedule");
    const fills: StudentFormFill[] = [
      {
        id: "personal",
        student_id: "s1",
        form_id: "personal-schedule",
        data: { sched_sun_p3: "ישן", sched_sun_p3_in_class: "" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      { sched_sun_p3: "חדש", sched_sun_p3_in_class: "1" },
      fills
    );

    expect(initial.sched_sun_p3).toBe("חדש");
    expect(initial.sched_sun_p3_in_class).toBe("1");
  });

  it("TZ-75 open: the form's own fill is used when nothing was passed in", () => {
    const schema = schemaById("personal-schedule");
    const fills: StudentFormFill[] = [
      {
        id: "personal",
        student_id: "s1",
        form_id: "personal-schedule",
        data: { sched_mon_p2: "של הטופס", sched_mon_p2_in_class: "1" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      },
      {
        id: "detailed",
        student_id: "s1",
        form_id: "schedule-detailed",
        data: { sched_mon_p2: "מפורטת", sched_mon_p2_in_class: "" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.sched_mon_p2).toBe("של הטופס");
    expect(initial.sched_mon_p2_in_class).toBe("1");
  });

  it("TZ-75 open: schedule-detailed is used only when opening personal-schedule", () => {
    const personal = schemaById("personal-schedule");
    const detailed = schemaById("schedule-detailed");
    const fills: StudentFormFill[] = [
      {
        id: "personal",
        student_id: "s1",
        form_id: "personal-schedule",
        data: { sched_tue_p1: "אישית" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      },
      {
        id: "detailed",
        student_id: "s1",
        form_id: "schedule-detailed",
        data: { sched_tue_p1: "מפורטת", sched_tue_p1_in_class: "1" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const openedPersonal = buildFormInitialData(
      personal,
      baseStudent(),
      null,
      fills.filter((fill) => fill.form_id !== "personal-schedule")
    );
    expect(openedPersonal.sched_tue_p1).toBe("מפורטת");
    expect(openedPersonal.sched_tue_p1_in_class).toBe("1");

    const openedDetailed = buildFormInitialData(
      detailed,
      baseStudent(),
      null,
      fills
    );
    expect(openedDetailed.sched_tue_p1).toBe("מפורטת");
    expect(openedDetailed.sched_tue_p1).not.toBe("אישית");
  });

  it("TZ-75 open: shiluv schedule fills empty-only cells without in-class/other", () => {
    const schema = schemaById("personal-schedule");
    const fills: StudentFormFill[] = [
      {
        id: "personal",
        student_id: "s1",
        form_id: "personal-schedule",
        data: { sched_sun_p3: "" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      },
      {
        id: "sch",
        student_id: "s1",
        form_id: "schedule",
        data: {
          sched_sun_p3: "מורה דמו\nחשבון",
          sched_wed_p2: "מורה א\nקריאה",
          sched_wed_p2_in_class: "1",
          sched_wed_p2_other: "1",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      fills[0].data,
      fills
    );

    expect(initial.sched_sun_p3 ?? "").toBe("");
    expect(initial.sched_wed_p2).toBe("מורה א\nקריאה");
    expect(initial.sched_wed_p2_in_class ?? "").toBe("");
    expect(initial.sched_wed_p2_other ?? "").toBe("");
  });

  it("TZ-75: writes _synced_by only for main sched_[day]_pN cells", () => {
    const schema = schemaById("personal-schedule");
    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      {
        sched_sun_p3: "מורה דמו\nחשבון",
        sched_sun_p3_staff: "צוות",
        sched_sun_p3_student: "תלמיד",
        sched_sun_p3_subject: "חשבון",
      },
      []
    );

    expect(initial.sched_sun_p3).toBe("מורה דמו\nחשבון");
    expect(Object.prototype.hasOwnProperty.call(initial, "sched_sun_p3_synced_by")).toBe(
      true
    );
    expect(
      Object.prototype.hasOwnProperty.call(initial, "sched_sun_p3_staff_synced_by")
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(initial, "sched_sun_p3_student_synced_by")
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(initial, "sched_sun_p3_subject_synced_by")
    ).toBe(false);
  });

  it("TZ-75: never copies in-class/other marks from shiluv schedule", () => {
    const schema = schemaById("personal-schedule");
    const fills: StudentFormFill[] = [
      {
        id: "sch",
        student_id: "s1",
        form_id: "schedule",
        data: {
          sched_tue_p1: "מורה א\nקריאה",
          sched_tue_p1_in_class: "1",
          sched_tue_p1_other: "1",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.sched_tue_p1).toBe("מורה א\nקריאה");
    expect(initial.sched_tue_p1_in_class ?? "").toBe("");
    expect(initial.sched_tue_p1_other ?? "").toBe("");
  });

  it("prefills only homeroom teacher into student team details", () => {
    const schema = schemaById("student-team-details");
    const fills: StudentFormFill[] = [
      {
        id: "basket",
        student_id: "s1",
        form_id: "personal-basket-card",
        data: {
          homeroom_teacher: "רחל כהן",
          domain_specialist: "שרה לוי",
          accompanying_teacher: "מירי דוד",
          aide_name: "נועה אברהם",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial["tbl_student-team_r0_name"]).toBe("רחל כהן");
    expect(initial["tbl_student-team_r0_role"]).toBe("מחנכת");
    expect(initial["tbl_student-team_r1_name"] ?? "").toBe("");
    expect(initial["tbl_student-team_r2_name"] ?? "").toBe("");
  });

  it("TZ-207: copies homeroom phone from institution staff like the picker", () => {
    const schema = schemaById("student-team-details");
    const fills: StudentFormFill[] = [
      {
        id: "basket",
        student_id: "s1",
        form_id: "personal-basket-card",
        data: { homeroom_teacher: "רחל כהן" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];
    const staff = [
      {
        id: "s-homeroom",
        full_name: "רחל כהן",
        role: "מחנכת",
        phone: "050-1234567",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      null,
      fills,
      [],
      null,
      staff
    );

    expect(initial["tbl_student-team_r0_phone"]).toBe("050-1234567");
  });

  it("TZ-207: leaves phone empty when staff record has no phone", () => {
    const schema = schemaById("student-team-details");
    const fills: StudentFormFill[] = [
      {
        id: "basket",
        student_id: "s1",
        form_id: "personal-basket-card",
        data: { homeroom_teacher: "רחל כהן" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];
    const staff = [
      {
        id: "s-homeroom",
        full_name: "רחל כהן",
        role: "מחנכת",
        phone: null,
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      null,
      fills,
      [],
      null,
      staff
    );

    expect(initial["tbl_student-team_r0_phone"] ?? "").toBe("");
  });

  it("TZ-207: does not refill homeroom phone from staff when the row was already saved", () => {
    const schema = schemaById("student-team-details");
    const fills: StudentFormFill[] = [
      {
        id: "basket",
        student_id: "s1",
        form_id: "personal-basket-card",
        data: { homeroom_teacher: "רחל כהן" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];
    const saved = {
      "tbl_student-team_r0_name": "רחל כהן",
      "tbl_student-team_r0_role": "מחנכת",
    };
    const staff = [
      {
        id: "s-homeroom",
        full_name: "רחל כהן",
        role: "מחנכת",
        phone: "050-1234567",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      saved,
      fills,
      [],
      null,
      staff
    );

    expect(initial["tbl_student-team_r0_phone"] ?? "").toBe("");
  });

  it("maps tachi current status to formative initial status", () => {
    const schema = schemaById("formative-assessment-verbal");
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "tachi",
        data: {
          domain: "שפה",
          current_status: "קוראת מילים בודדות",
          main_goal: "קריאה שוטפת של פסקה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.domain).toBe("שפה");
    expect(initial.initial_status).toBe("קוראת מילים בודדות");
    expect(initial.current_status).toBe("");
    expect(initial.goals_rest_of_year).toBe("קריאה שוטפת של פסקה");
  });

  it("maps integrative tachi baseline and goals into formative verbal", () => {
    const schema = schemaById("formative-assessment-verbal");
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "tachi-integrative",
        data: {
          domain: "רגשי",
          baseline: "מתקשה בוויסות",
          main_goals: "שימוש באסטרטגיות הרגעה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.domain).toBe("רגשי");
    expect(initial.initial_status).toBe("מתקשה בוויסות");
    expect(initial.current_status).toBe("");
    expect(initial.goals_rest_of_year).toBe("שימוש באסטרטגיות הרגעה");
  });

  it("refills empty formative fields from tachi even when a blank draft exists", () => {
    const schema = schemaById("formative-assessment-verbal");
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "tachi",
        data: {
          domain: "חשבון",
          current_status: "מזהה עד 20",
          main_goal: "חיבור עד 100",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-03T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      {
        domain: "",
        initial_status: "",
        current_status: "",
        goals_rest_of_year: "",
      },
      fills
    );

    expect(initial.domain).toBe("חשבון");
    expect(initial.initial_status).toBe("מזהה עד 20");
    expect(initial.goals_rest_of_year).toBe("חיבור עד 100");
  });

  it("prefills formative goals from tachi goals table when main_goal empty", () => {
    const schema = schemaById("formative-assessment-verbal");
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "tachi",
        data: {
          current_status: "מתחילה",
          "tbl_tachi-goals_rows": "2",
          "tbl_tachi-goals_r0_goal": "יעד א",
          "tbl_tachi-goals_r1_goal": "יעד ב",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.initial_status).toBe("מתחילה");
    expect(initial.goals_rest_of_year).toBe("יעד א\nיעד ב");
  });

  it("prefills summative verbal assessment from integrative tachi", () => {
    const schema = schemaById("summative-assessment-verbal");
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "tachi-integrative",
        data: {
          domain: "חשבון",
          baseline: "מזהה מספרים עד 20",
          main_goals: "חיבור עד 100",
          recommendations: "המשך תרגול יומי",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.topic).toBe("חשבון");
    expect(initial.initial_status).toBe("מזהה מספרים עד 20");
    expect(initial.goals_and_process).toBe("חיבור עד 100");
    expect(initial.table_recommendations).toBe("המשך תרגול יומי");
  });

  it("TZ-205: new תח״י excludes prior תח״י fill but keeps cross-form prefill", () => {
    const priorTachi: StudentFormFill = {
      id: "tachi-old",
      student_id: "s1",
      form_id: "tachi",
      data: {
        domain: "מתמטיקה",
        main_goal: "מטרה ישנה",
        current_status: "מצב ישן",
      },
      status: "completed",
      document_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    const studentInfoFill: StudentFormFill = {
      id: "info",
      student_id: "s1",
      form_id: "student-info",
      data: {
        homeroom_teacher: "מירי כהן",
        class_name: "ג3",
      },
      status: "draft",
      document_id: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-02T00:00:00.000Z",
    };
    const allFills = [priorTachi, studentInfoFill];
    const forNew = fillsForPortfolioCreateNew("tachi", allFills, true);
    const initial = buildFormInitialData(
      schemaById("tachi"),
      { ...baseStudent(), class_name: "", homeroom_teacher: "" },
      null,
      forNew
    );
    expect(initial.domain).toBe("");
    expect(initial.main_goal).toBe("");
    expect(initial.class_name).toBe("ג3");
  });

  it("TZ-205: new תל״א excludes prior תל״א but keeps prep and class prefill", () => {
    const priorTla: StudentFormFill = {
      id: "tla-old",
      student_id: "s1",
      form_id: "tla",
      data: {
        domain: "רגשי",
        main_goal: "מטרה ישנה",
      },
      status: "draft",
      document_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    const prep: StudentFormFill = {
      id: "prep",
      student_id: "s1",
      form_id: "tla-prep",
      data: {
        strengths: "מוקד כוח מהכנה",
        areas_to_strengthen: "מוקד חיזוק מהכנה",
      },
      status: "draft",
      document_id: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-02T00:00:00.000Z",
    };
    const classProfile: StudentFormFill = {
      id: "class",
      student_id: "s1",
      form_id: "class-profile",
      data: { class_name: "ד1" },
      status: "draft",
      document_id: null,
      created_at: "2026-06-03T00:00:00.000Z",
      updated_at: "2026-06-04T00:00:00.000Z",
    };
    const allFills = [priorTla, prep, classProfile];
    const forNewTla = fillsForPortfolioCreateNew("tla", allFills, true);
    const blankTla = buildFormInitialData(
      schemaById("tla"),
      { ...baseStudent(), class_name: "" },
      null,
      forNewTla
    );
    expect(blankTla.domain).toBe("");
    expect(blankTla.main_goal).toBe("");
    expect(blankTla.class_name).toBe("ד1");

    const forNewPresentation = allFills.filter(
      (fill) => fill.form_id !== "tla-presentation"
    );
    const presentation = buildFormInitialData(
      schemaById("tla-presentation"),
      baseStudent(),
      null,
      forNewPresentation
    );
    expect(presentation.strengths).toBe("מוקד כוח מהכנה");
    expect(presentation.areas_to_strengthen).toBe("מוקד חיזוק מהכנה");
  });

  it("does not prefill integrative tachi from regular tachi (or the reverse)", () => {
    const tachiFill: StudentFormFill = {
      id: "tachi-fill",
      student_id: "s1",
      form_id: "tachi",
      data: {
        domain: "שפה מתח״י",
        main_goal: "מטרה מתח״י",
        current_status: "מצב מתח״י",
      },
      status: "draft",
      document_id: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
    };
    const integrativeFill: StudentFormFill = {
      id: "integrative-fill",
      student_id: "s1",
      form_id: "tachi-integrative",
      data: {
        domain: "רגשי מאינטגרטיבי",
        main_goals: "מטרות מאינטגרטיבי",
        baseline: "בסיס מאינטגרטיבי",
      },
      status: "draft",
      document_id: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
    };

    const intoIntegrative = buildFormInitialData(
      schemaById("tachi-integrative"),
      baseStudent(),
      null,
      [tachiFill]
    );
    expect(intoIntegrative.domain).toBe("");
    expect(intoIntegrative.main_goals).toBe("");
    expect(intoIntegrative.baseline).toBe("");

    const intoTachi = buildFormInitialData(
      schemaById("tachi"),
      baseStudent(),
      null,
      [integrativeFill]
    );
    expect(intoTachi.domain).toBe("");
    expect(intoTachi.main_goal).toBe("");
    expect(intoTachi.current_status).toBe("");
  });

  it("prefills first formative table row from tachi", () => {
    const schema = schemaById("formative-assessment-table");
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "tachi",
        data: {
          domain: "רגשי",
          current_status: "מתקשה בוויסות",
          main_goal: "שימוש באסטרטגיות הרגעה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial["tbl_formative-domains_r0_domain"]).toBe("רגשי");
    expect(initial["tbl_formative-domains_r0_initial"]).toBe("מתקשה בוויסות");
    expect(initial["tbl_formative-domains_r0_current"]).toBe("");
    expect(initial["tbl_formative-domains_r0_goals"]).toBe(
      "שימוש באסטרטגיות הרגעה"
    );
  });

  it("splits learning-cluster subjects on middle dots and spaces", () => {
    expect(parseLearningClusterSubjects("תורה · נביא · יהדות")).toEqual([
      "תורה",
      "נביא",
      "יהדות",
    ]);
    expect(parseLearningClusterSubjects("תורה נביא יהדות")).toEqual([
      "תורה",
      "נביא",
      "יהדות",
    ]);
    expect(parseLearningClusterSubjects("תורה - נביא – יהדות")).toEqual([
      "תורה",
      "נביא",
      "יהדות",
    ]);
    expect(
      parseLearningClusterSubjects("תורה נביא יהדות ופרשת שבוע")
    ).toEqual(["תורה", "נביא", "יהדות", "פרשת שבוע"]);
    expect(
      parseLearningClusterSubjects("תורה · נביא · יהדות · ופרשת שבוע")
    ).toEqual(["תורה", "נביא", "יהדות", "פרשת שבוע"]);
    expect(
      parseLearningClusterSubjects("תורה · נביא · יהדות · פרשת שבוע")
    ).toEqual(["תורה", "נביא", "יהדות", "פרשת שבוע"]);
    expect(parseLearningClusterSubjects("תורה ונביא ויהדות")).toEqual([
      "תורה",
      "נביא",
      "יהדות",
    ]);
    expect(parseLearningClusterSubjects("")).toEqual([]);
  });

  it("keeps פרשת שבוע as one subject without a connecting vav", () => {
    const schema = schemaById("class-teaching-plan");
    const fills: StudentFormFill[] = [
      {
        id: "lc1",
        student_id: "s1",
        form_id: "learning-clusters",
        data: { sacred_studies: "תורה נביא יהדות ופרשת שבוע" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const fromClusters = buildFormInitialData(
      schema,
      baseStudent(),
      null,
      fills
    );
    expect(fromClusters["tbl_class-teaching-plan_r0_subject"]).toBe("תורה");
    expect(fromClusters["tbl_class-teaching-plan_r1_subject"]).toBe("נביא");
    expect(fromClusters["tbl_class-teaching-plan_r2_subject"]).toBe("יהדות");
    expect(fromClusters["tbl_class-teaching-plan_r3_subject"]).toBe(
      "פרשת שבוע"
    );
    expect(fromClusters["tbl_class-teaching-plan_r4_subject"] ?? "").toBe("");

    const repaired = buildFormInitialData(
      schema,
      baseStudent(),
      {
        "tbl_class-teaching-plan_r0_subject": "תורה",
        "tbl_class-teaching-plan_r1_subject": "נביא",
        "tbl_class-teaching-plan_r2_subject": "יהדות",
        "tbl_class-teaching-plan_r3_subject": "ופרשת",
        "tbl_class-teaching-plan_r4_subject": "שבוע",
      },
      fills
    );
    expect(repaired["tbl_class-teaching-plan_r3_subject"]).toBe("פרשת שבוע");
    expect(repaired["tbl_class-teaching-plan_r4_subject"] ?? "").toBe("");
  });

  it("prefills subject columns from learning clusters on both TLK tables", () => {
    const fills: StudentFormFill[] = [
      {
        id: "lc1",
        student_id: "s1",
        form_id: "learning-clusters",
        data: { sacred_studies: "תורה · נביא · יהדות" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    for (const formId of ["class-teaching-plan", "adapted-curriculum"] as const) {
      const initial = buildFormInitialData(
        schemaById(formId),
        baseStudent(),
        null,
        fills
      );
      expect(initial[`tbl_${formId}_r0_subject`]).toBe("תורה");
      expect(initial[`tbl_${formId}_r1_subject`]).toBe("נביא");
      expect(initial[`tbl_${formId}_r2_subject`]).toBe("יהדות");
      expect(initial[`tbl_${formId}_r3_subject`] ?? "").toBe("");
      expect(initial[`tbl_${formId}_r0_goals`] ?? "").toBe("");
      expect(initial[`tbl_${formId}_r0_methods`] ?? "").toBe("");
      expect(initial[`tbl_${formId}_r0_program`] ?? "").toBe("");
      expect(initial[`tbl_${formId}_r0_textbooks`] ?? "").toBe("");
    }
  });

  it("prefills tlk-summary subjects and clusters from learning clusters", () => {
    const fills: StudentFormFill[] = [
      {
        id: "lc1",
        student_id: "s1",
        form_id: "learning-clusters",
        data: {
          sacred_studies: "תורה · נביא",
          math: "חשבון · גאומטריה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schemaById("tlk-summary"),
      baseStudent(),
      null,
      fills
    );

    expect(initial["tbl_tlk-summary-subjects_r0_cluster"]).toBe(
      "אשכול מקצועות הקודש"
    );
    expect(initial["tbl_tlk-summary-subjects_r0_subject"]).toBe("תורה");
    expect(initial["tbl_tlk-summary-subjects_r1_cluster"]).toBe(
      "אשכול מקצועות הקודש"
    );
    expect(initial["tbl_tlk-summary-subjects_r1_subject"]).toBe("נביא");
    expect(initial["tbl_tlk-summary-subjects_r2_cluster"]).toBe(
      "אשכול החינוך המתמטי"
    );
    expect(initial["tbl_tlk-summary-subjects_r2_subject"]).toBe("חשבון");
    expect(initial["tbl_tlk-summary-subjects_r3_subject"]).toBe("גאומטריה");
    expect(initial["tbl_tlk-summary-subjects_r0_weekly_hours"] ?? "").toBe("");
  });

  it("applyLearningClusterSubjectPrefill adds subjects without overwriting manual rows", () => {
    const schema = schemaById("tlk-summary");
    expect(formUsesLearningClusterSubjects(schema)).toBe(true);
    const fills: StudentFormFill[] = [
      {
        id: "lc1",
        student_id: "s1",
        form_id: "learning-clusters",
        data: { language: "עברית · אנגלית" },
        status: "completed",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];
    const data = buildFormInitialData(
      schema,
      baseStudent(),
      {
        "tbl_tlk-summary-subjects_r0_subject": "חינוך גופני",
        "tbl_tlk-summary-subjects_r0_cluster": "אשכול כישורי החיים",
      },
      fills
    );
    expect(data["tbl_tlk-summary-subjects_r0_subject"]).toBe("חינוך גופני");
    expect(data["tbl_tlk-summary-subjects_r1_subject"]).toBe("עברית");
    expect(data["tbl_tlk-summary-subjects_r2_subject"]).toBe("אנגלית");
    const added = applyLearningClusterSubjectPrefill(schema, data, fills);
    expect(added).toBe(0);
  });

  it("prefers learning-cluster fill with content over a newer empty draft", () => {
    const fills: StudentFormFill[] = [
      {
        id: "lc-empty",
        student_id: "s1",
        form_id: "learning-clusters",
        data: { sacred_studies: "" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-03T00:00:00.000Z",
        updated_at: "2026-07-04T00:00:00.000Z",
      },
      {
        id: "lc-full",
        student_id: "s1",
        form_id: "learning-clusters",
        data: { sacred_studies: "תורה · נביא" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schemaById("adapted-curriculum"),
      baseStudent(),
      null,
      fills
    );
    expect(initial["tbl_adapted-curriculum_r0_subject"]).toBe("תורה");
    expect(initial["tbl_adapted-curriculum_r1_subject"]).toBe("נביא");
  });

  it("does not overwrite an already filled subject cell from learning clusters", () => {
    const schema = schemaById("class-teaching-plan");
    const fills: StudentFormFill[] = [
      {
        id: "lc1",
        student_id: "s1",
        form_id: "learning-clusters",
        data: { sacred_studies: "תורה · נביא · יהדות" },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      {
        "tbl_class-teaching-plan_r0_subject": "חשבון",
        "tbl_class-teaching-plan_r0_goals": "לזהות מספרים",
      },
      fills
    );

    expect(initial["tbl_class-teaching-plan_r0_subject"]).toBe("חשבון");
    expect(initial["tbl_class-teaching-plan_r0_goals"]).toBe("לזהות מספרים");
    expect(initial["tbl_class-teaching-plan_r1_subject"]).toBe("תורה");
    expect(initial["tbl_class-teaching-plan_r2_subject"]).toBe("נביא");
    expect(initial["tbl_class-teaching-plan_r3_subject"]).toBe("יהדות");
  });

  it("expands teaching-plan rows when there are more cluster subjects than defaults", () => {
    const schema = schemaById("class-teaching-plan");
    const fills: StudentFormFill[] = [
      {
        id: "lc1",
        student_id: "s1",
        form_id: "learning-clusters",
        data: {
          sacred_studies: "תורה · נביא · יהדות",
          language: "עברית · אנגלית",
          math: "חשבון · גאומטריה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial["tbl_class-teaching-plan_rows"]).toBe("7");
    expect(initial["tbl_class-teaching-plan_r6_subject"]).toBe("גאומטריה");
  });

  it("enables voice recording on TLK and summary tables but not on learning clusters", () => {
    expect(formSupportsVoiceRecording(schemaById("class-teaching-plan"))).toBe(
      true
    );
    expect(formSupportsVoiceRecording(schemaById("adapted-curriculum"))).toBe(
      true
    );
    expect(formSupportsVoiceRecording(schemaById("expert-guidance"))).toBe(
      true
    );
    expect(formSupportsVoiceRecording(schemaById("staff-meetings"))).toBe(
      true
    );
    expect(formSupportsVoiceRecording(schemaById("inclusion-meetings"))).toBe(
      false
    );
    expect(formSupportsVoiceRecording(schemaById("parent-conversations"))).toBe(
      true
    );
    expect(
      formSupportsVoiceRecording(schemaById("external-correspondence"))
    ).toBe(true);
    expect(formSupportsVoiceRecording(schemaById("learning-clusters"))).toBe(
      false
    );
    expect(formSupportsVoiceRecording(schemaById("tachi"))).toBe(false);
    expect(formSupportsVoiceRecording(schemaById("tachi-integrative"))).toBe(
      false
    );
    expect(formSupportsVoiceRecording(schemaById("tla-integrative"))).toBe(
      false
    );
  });

  it("enables voice recording on class-profile text areas", () => {
    expect(formSupportsVoiceRecording(schemaById("class-profile"))).toBe(true);
  });

  it("prefills tla presentation strengths from tla-prep rubric", () => {
    const schema = schemaById("tla-presentation");
    const fills: StudentFormFill[] = [
      {
        id: "prep",
        student_id: "s1",
        form_id: "tla-prep",
        data: {
          strengths: "קריאה שוטפת וזיכרון חזותי",
          areas_to_strengthen: "כתיבה וארגון",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
      {
        id: "class",
        student_id: "s1",
        form_id: "class-profile",
        data: {
          strengths: "מפרופיל כיתה",
          areas_to_strengthen: "מפרופיל כיתה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-03T00:00:00.000Z",
        updated_at: "2026-07-04T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial.strengths).toBe("קריאה שוטפת וזיכרון חזותי");
    expect(initial.areas_to_strengthen).toBe("כתיבה וארגון");
  });

  it("does not overwrite saved tla presentation foci with prep", () => {
    const schema = schemaById("tla-presentation");
    const fills: StudentFormFill[] = [
      {
        id: "prep",
        student_id: "s1",
        form_id: "tla-prep",
        data: {
          strengths: "מהכנה",
          areas_to_strengthen: "מהכנה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(
      schema,
      baseStudent(),
      {
        strengths: "עריכה להצגה",
        areas_to_strengthen: "עריכה לחיזוק",
      },
      fills
    );

    expect(initial.strengths).toBe("עריכה להצגה");
    expect(initial.areas_to_strengthen).toBe("עריכה לחיזוק");
  });

  it("prefills personal-basket goals table rows from tachis", () => {
    const schema = schemaById("personal-basket-card");
    const fills: StudentFormFill[] = [
      {
        id: "t1",
        student_id: "s1",
        form_id: "tachi",
        data: {
          domain: "רגשי",
          main_goal: "וויסות עצמי",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
      {
        id: "t2",
        student_id: "s1",
        form_id: "tachi",
        data: {
          domain: "לימודי",
          "tbl_tachi-goals_r0_goal": "קריאה fluency",
          "tbl_tachi-goals_r1_goal": "הבנת הנקרא",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-03T00:00:00.000Z",
        updated_at: "2026-07-04T00:00:00.000Z",
      },
    ];

    const initial = buildFormInitialData(schema, baseStudent(), null, fills);

    expect(initial["tbl_personal-basket-goals_r0_domain"]).toBe("רגשי");
    expect(initial["tbl_personal-basket-goals_r0_main_goal"]).toBe("וויסות עצמי");
    expect(initial["tbl_personal-basket-goals_r0_partners"]).toBe("");
    expect(initial["tbl_personal-basket-goals_r1_domain"]).toBe("לימודי");
    expect(initial["tbl_personal-basket-goals_r1_main_goal"]).toBe(
      "קריאה fluency\nהבנת הנקרא"
    );
  });

  it("does not overwrite existing personal-basket goals cells from tachis", () => {
    const schema = schemaById("personal-basket-card");
    const fills: StudentFormFill[] = [
      {
        id: "t1",
        student_id: "s1",
        form_id: "tachi",
        data: {
          domain: "רגשי",
          main_goal: "מטרה מתח״י",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
    ];

    const saved = {
      "tbl_personal-basket-goals_r0_domain": "רגשי",
      "tbl_personal-basket-goals_r0_main_goal": "מטרה ידנית",
      "tbl_personal-basket-goals_r0_partners": "צוות א׳",
    };

    const initial = buildFormInitialData(schema, baseStudent(), saved, fills);

    expect(initial["tbl_personal-basket-goals_r0_main_goal"]).toBe("מטרה ידנית");
    expect(initial["tbl_personal-basket-goals_r0_partners"]).toBe("צוות א׳");
  });

  it("does not duplicate a domain in the personal-basket goals table", () => {
    const schema = schemaById("personal-basket-card");
    const fills: StudentFormFill[] = [
      {
        id: "t1",
        student_id: "s1",
        form_id: "tachi",
        data: {
          domain: "רגשי",
          main_goal: "מטרה ראשונה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-02T00:00:00.000Z",
      },
      {
        id: "t2",
        student_id: "s1",
        form_id: "tachi",
        data: {
          domain: "רגשי",
          main_goal: "מטרה שנייה",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-07-03T00:00:00.000Z",
        updated_at: "2026-07-04T00:00:00.000Z",
      },
    ];

    const saved = {
      "tbl_personal-basket-goals_r0_domain": "רגשי",
      "tbl_personal-basket-goals_r0_main_goal": "",
    };

    const initial = buildFormInitialData(schema, baseStudent(), saved, fills);

    expect(initial["tbl_personal-basket-goals_r0_main_goal"]).toBe("מטרה ראשונה");
    expect(initial["tbl_personal-basket-goals_r1_domain"] ?? "").toBe("");
  });
});
