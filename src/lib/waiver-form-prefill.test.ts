import { describe, expect, it } from "vitest";
import { getFormSchema } from "@/lib/form-schemas";
import { buildFormInitialData } from "@/lib/form-sync";
import {
  isMoeWaiverForm,
  prefillMoeWaiverParentFields,
} from "@/lib/waiver-form-prefill";
import type { Student, StudentFormFill } from "@/lib/supabase/types";

function baseStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: "s1",
    institution_id: null,
    category: "schools",
    full_name: "שולמית נחום",
    phone: null,
    father_name: "אבי נחום",
    mother_name: "שרה נחום",
    status: "integration",
    class_name: "ג1",
    teacher_name: null,
    notes: null,
    id_number: "123456782",
    birth_date: "2016-01-01",
    gender: "נ",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("waiver-form-prefill (TZ-157)", () => {
  it("detects MOE waiver form ids", () => {
    expect(isMoeWaiverForm("waiver-eligibility-characterization")).toBe(true);
    expect(isMoeWaiverForm("waiver-confidentiality")).toBe(false);
  });

  it("prefills parent_guardian_name and parent sections from the student card", () => {
    const schema = getFormSchema("waiver-eligibility-characterization")!;
    const initial: Record<string, string> = {};
    prefillMoeWaiverParentFields(schema, baseStudent(), initial, []);

    expect(initial.parent_guardian_name).toBe("אבי נחום / שרה נחום");
    expect(initial.parent1_name).toBe("אבי נחום");
    expect(initial.parent2_name).toBe("שרה נחום");
  });

  it("uses a single parent name when single_responsible_party is set", () => {
    const schema = getFormSchema("waiver-eligibility-characterization")!;
    const initial: Record<string, string> = {};
    prefillMoeWaiverParentFields(
      schema,
      baseStudent({
        single_responsible_party: true,
        mother_name: null,
      }),
      initial,
      []
    );

    expect(initial.parent_guardian_name).toBe("אבי נחום");
  });

  it("pulls parent IDs from waiver-confidentiality fill", () => {
    const schema = getFormSchema("waiver-eligibility-characterization")!;
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: {
          father_id: "111111118",
          mother_id: "222222226",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ];
    const initial: Record<string, string> = {};
    prefillMoeWaiverParentFields(schema, baseStudent(), initial, fills);

    expect(initial.parent1_id).toBe("111111118");
    expect(initial.parent2_id).toBe("222222226");
    expect(initial.parent_guardian_id ?? "").toBe("");
  });

  it("pairs guardian name and ID from the same parent (TZ-157 / Bugbot)", () => {
    const schema = getFormSchema("waiver-eligibility-characterization")!;
    const fills: StudentFormFill[] = [
      {
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: {
          father_id: "111111118",
          mother_id: "222222226",
        },
        status: "draft",
        document_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ];
    const initial: Record<string, string> = {};
    prefillMoeWaiverParentFields(
      schema,
      baseStudent({
        single_responsible_party: true,
        father_name: null,
        mother_name: "שרה נחום",
      }),
      initial,
      fills
    );

    expect(initial.parent_guardian_name).toBe("שרה נחום");
    expect(initial.parent_guardian_id).toBe("222222226");
    expect(initial.parent1_id).toBe("");
    expect(initial.parent2_id).toBe("222222226");
  });

  it("does not overwrite saved parent_guardian values in buildFormInitialData", () => {
    const schema = getFormSchema("waiver-eligibility-characterization")!;
    const initial = buildFormInitialData(schema, baseStudent(), {
      parent_guardian_name: "שם שנשמר",
      parent_guardian_id: "999999999",
    });

    expect(initial.parent_guardian_name).toBe("שם שנשמר");
    expect(initial.parent_guardian_id).toBe("999999999");
  });

  it("does not fill parent_guardian_id when saved name differs from resolved pair", () => {
    const schema = getFormSchema("waiver-eligibility-characterization")!;
    const initial: Record<string, string> = {
      parent_guardian_name: "דוד כהן",
    };
    prefillMoeWaiverParentFields(schema, baseStudent(), initial, []);

    expect(initial.parent_guardian_name).toBe("דוד כהן");
    expect(initial.parent_guardian_id ?? "").toBe("");
  });

  it("uses both parent names when single_responsible_party is set but two names exist", () => {
    const schema = getFormSchema("waiver-eligibility-characterization")!;
    const initial: Record<string, string> = {};
    prefillMoeWaiverParentFields(
      schema,
      baseStudent({ single_responsible_party: true }),
      initial,
      []
    );

    expect(initial.parent_guardian_name).toBe("אבי נחום / שרה נחום");
    expect(initial.parent_guardian_id ?? "").toBe("");
  });
});
