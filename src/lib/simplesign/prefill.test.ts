import { describe, expect, it } from "vitest";
import {
  mapPrefillToSimpleSignKeys,
  buildSimpleSignPrefillBySignerSlot,
  buildSimpleSignPrefillForDocument,
  formatFuncScaleOverlay,
  parseSimpleSignDocumentInputs,
  splitSimpleSignPrefillBySigner,
  type SimpleSignDocumentInput,
} from "@/lib/simplesign/prefill";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { getFormLockedKeys } from "@/lib/form-schema-loader";
import { FORM_TABLE_DEFS, tableCellKey } from "@/lib/form-table-grids";
import { formMayUseSimpleSign } from "@/lib/simplesign/config";

describe("mapPrefillToSimpleSignKeys", () => {
  const inputs: SimpleSignDocumentInput[] = [
    { key: "field_13", label: "institution_name", type: "text" },
    { key: "field_11", label: "parent1_signature", type: "signature" },
    { key: "field_7", label: "parent1_name", type: "text" },
  ];

  it("maps matoah keys via SimpleSign labels", () => {
    const mapped = mapPrefillToSimpleSignKeys(
      {
        institution_name: "ביה\"ס דוגמה",
        parent1_name: "ישראל ישראלי",
        parent1_signature: "ignored",
      },
      inputs
    );
    expect(mapped).toEqual({
      field_13: "ביה\"ס דוגמה",
      field_7: "ישראל ישראלי",
    });
  });

  it("falls back to matching SimpleSign key when labels equal matoah keys", () => {
    const mapped = mapPrefillToSimpleSignKeys(
      { field_7: "value" },
      [{ key: "field_7", label: "שם הורה 1", type: "text" }]
    );
    expect(mapped).toEqual({ field_7: "value" });
  });

  it("maps by API key when labels are Hebrew display text (SimpleSign label/key split)", () => {
    const mapped = mapPrefillToSimpleSignKeys(
      {
        student_name: "תלמיד",
        father_name: "אב",
        institution_name: "מוסד",
      },
      [
        { key: "student_name", label: "שם התלמיד/ה", type: "text", signer: 0 },
        { key: "father_name", label: "שם האב", type: "text", signer: 1 },
        { key: "institution_name", label: "שם המוסד", type: "text", signer: 0 },
      ]
    );
    expect(mapped).toEqual({
      student_name: "תלמיד",
      father_name: "אב",
      institution_name: "מוסד",
    });
  });

  it("prefers a key match over another input whose label collides", () => {
    // תווית של שדה אחר זהה למפתח מתוה — ה-key האמיתי חייב לנצח
    const mapped = mapPrefillToSimpleSignKeys(
      { father_name: "אב" },
      [
        { key: "notes", label: "father_name", type: "text", signer: 0 },
        { key: "father_name", label: "שם האב", type: "text", signer: 1 },
      ]
    );
    expect(mapped).toEqual({ father_name: "אב" });
  });

  it("splits prefill by signer slot from document inputs", () => {
    const inputs: SimpleSignDocumentInput[] = [
      { key: "student_name", label: "student_name", type: "text", signer: 1 },
      { key: "father_name", label: "father_name", type: "text", signer: 1 },
      { key: "mother_name", label: "mother_name", type: "text", signer: 2 },
      { key: "signature", label: "חתימה", type: "signature", signer: 1 },
    ];
    const schema = getFormSchema("waiver-confidentiality");
    expect(schema).toBeTruthy();
    const bySlot = buildSimpleSignPrefillBySignerSlot(
      schema!,
      {
        student_name: "תלמיד",
        father_name: "אב",
        mother_name: "אם",
      },
      inputs
    );
    expect(bySlot[1]).toEqual({
      student_name: "תלמיד",
      father_name: "אב",
    });
    expect(bySlot[2]).toEqual({ mother_name: "אם" });
  });

  it("keeps signer:0 as a shared field and does not treat it as missing", () => {
    const inputs = parseSimpleSignDocumentInputs({
      inputs: [
        { key: "student_name", label: "student_name", type: "text", signer: 0 },
        { key: "father_name", label: "father_name", type: "text", signer: 1 },
      ],
    });
    expect(inputs[0]?.signer).toBe(0);
    expect(inputs[1]?.signer).toBe(1);
  });

  it("separates shared signer:0 fields from per-signer prefill", () => {
    const inputs: SimpleSignDocumentInput[] = [
      { key: "student_name", label: "student_name", type: "text", signer: 0 },
      { key: "student_id_number", label: "student_id_number", type: "text", signer: 0 },
      { key: "father_name", label: "father_name", type: "text", signer: 1 },
      { key: "mother_name", label: "mother_name", type: "text", signer: 2 },
      { key: "signature", label: "חתימה", type: "signature", signer: 1 },
    ];
    const schema = getFormSchema("waiver-confidentiality");
    expect(schema).toBeTruthy();
    const { shared, bySigner } = splitSimpleSignPrefillBySigner(
      buildSimpleSignPrefillBySignerSlot(
        schema!,
        {
          student_name: "נועה כהן",
          student_id_number: "312456789",
          father_name: "דנה כהן",
          mother_name: "יוסי כהן",
        },
        inputs
      )
    );
    expect(shared).toEqual({
      student_name: "נועה כהן",
      student_id_number: "312456789",
    });
    expect(bySigner[1]).toEqual({ father_name: "דנה כהן" });
    expect(bySigner[2]).toEqual({ mother_name: "יוסי כהן" });
    expect(bySigner).not.toHaveProperty("0");
    expect(bySigner[1]).not.toHaveProperty("student_name");
    expect(bySigner[2]).not.toHaveProperty("student_id_number");
  });

  it("prefills SimpleSign year field from school year even when the Matoah form has no year field", () => {
    const schema = getFormSchema("waiver-confidentiality");
    expect(schema).toBeTruthy();
    const inputs: SimpleSignDocumentInput[] = [
      { key: "field_7", label: "student_name", type: "text" },
      { key: "field_20", label: "year", type: "text" },
    ];
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { student_name: "תלמיד" },
      inputs,
      'תשפ"ז'
    );
    expect(mapped.field_7).toBe("תלמיד");
    expect(mapped.field_20).toBe('תשפ"ז');
  });

  it("puts school year prefill on the signer that owns the year field", () => {
    const schema = getFormSchema("waiver-confidentiality");
    expect(schema).toBeTruthy();
    const inputs: SimpleSignDocumentInput[] = [
      { key: "student_name", label: "student_name", type: "text", signer: 1 },
      { key: "field_20", label: "year", type: "text", signer: 2 },
    ];
    const bySlot = buildSimpleSignPrefillBySignerSlot(
      schema!,
      { student_name: "תלמיד" },
      inputs,
      'תשפ"ז'
    );
    expect(bySlot[1]).toEqual({ student_name: "תלמיד" });
    expect(bySlot[2]).toEqual({ field_20: 'תשפ"ז' });
  });
});

describe("waiver parent ID numbers stay empty for SimpleSign", () => {
  const parentIdKeys = [
    "father_id",
    "mother_id",
    "parent1_id",
    "parent2_id",
    "parent_guardian_id",
  ] as const;

  it.each([
    "waiver-confidentiality",
    "waiver-multidisciplinary-team",
    "waiver-eligibility-characterization",
    "waiver-appeal-committee",
  ] as const)("does not send parent IDs from Matoah for %s", (formId) => {
    const schema = getFormSchema(formId);
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        student_name: "תלמיד",
        student_id_number: "312456789",
        father_name: "אב",
        mother_name: "אם",
        parent1_name: "הורה א",
        parent2_name: "הורה ב",
        parent_guardian_name: "הורי התלמיד",
        father_id: "111111118",
        mother_id: "222222226",
        parent1_id: "111111118",
        parent2_id: "222222226",
        parent_guardian_id: "000000018",
      },
      [
        { key: "student_id_number", label: "student_id_number", type: "text" },
        ...parentIdKeys.map((key) => ({
          key,
          label: key,
          type: "text" as const,
        })),
      ]
    );
    if (formId === "waiver-confidentiality") {
      expect(mapped.student_id_number).toBe("312456789");
    }
    for (const key of parentIdKeys) {
      expect(mapped).not.toHaveProperty(key);
    }
  });
});

describe("waiver-multidisciplinary-team SimpleSign template", () => {
  const inputs: SimpleSignDocumentInput[] = [
    { key: "signature", label: "חתימה", type: "signature", signer: 1 },
    { key: "full_name", label: "שם מלא", type: "text", required: true, signer: 1 },
    { key: "id_number", label: "ת.ז.", type: "text", signer: 1 },
    { key: "phone", label: "טלפון", type: "phone", signer: 1 },
    { key: "email", label: "אימייל", type: "email", required: true, signer: 1 },
    { key: "date", label: "תאריך", type: "date", signer: 1 },
    { key: "filled_at", label: "filled_at", type: "date", signer: 1 },
    { key: "institution_name", label: "institution_name", type: "text", signer: 1 },
    { key: "institution_code", label: "institution_code", type: "text", signer: 1 },
    { key: "district", label: "district", type: "text", signer: 1 },
    { key: "parent_guardian_name", label: "parent_guardian_name", type: "text", signer: 1 },
    { key: "parent_guardian_id", label: "parent_guardian_id", type: "text", signer: 1 },
    { key: "consent_disability_docs", label: "consent_disability_docs", type: "checkbox", signer: 1 },
    { key: "consent_committee_docs", label: "consent_committee_docs", type: "checkbox", signer: 1 },
    { key: "committee_docs_detail", label: "committee_docs_detail", type: "text", signer: 1 },
    { key: "consent_edu_treatment_info", label: "consent_edu_treatment_info", type: "checkbox", signer: 1 },
    { key: "consent_final", label: "consent_final", type: "checkbox", signer: 1 },
    { key: "parent1_name", label: "parent1_name", type: "text", signer: 1 },
    { key: "parent1_id", label: "parent1_id", type: "text", signer: 1 },
    { key: "parent2_name", label: "parent2_name", type: "text", signer: 2 },
    { key: "parent2_id", label: "parent2_id", type: "text", signer: 2 },
    { key: "signature_2", label: "חתימה - הורה ב'", type: "signature", required: true, signer: 2 },
  ];

  const data = {
    filled_at: "2026-09-14",
    institution_name: "ביה\"ס דוגמה",
    institution_code: "123456",
    district: "מרכז",
    parent_guardian_name: "הורי התלמיד",
    parent_guardian_id: "000000018",
    consent_disability_docs: "true",
    consent_committee_docs: "true",
    committee_docs_detail: "אבחון פסיכולוגי",
    consent_edu_treatment_info: "true",
    consent_final: "true",
    parent1_name: "הורה א",
    parent1_id: "111111118",
    parent2_name: "הורה ב",
    parent2_id: "222222226",
  };

  it("maps every Matoah data field onto the live SimpleSign keys", () => {
    const schema = getFormSchema("waiver-multidisciplinary-team");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(schema!, data, inputs);
    expect(mapped).toMatchObject({
      filled_at: "2026-09-14",
      institution_name: "ביה\"ס דוגמה",
      institution_code: "123456",
      district: "מרכז",
      parent_guardian_name: "הורי התלמיד",
      consent_disability_docs: "V",
      consent_committee_docs: "V",
      committee_docs_detail: "אבחון פסיכולוגי",
      consent_edu_treatment_info: "V",
      consent_final: "V",
      parent1_name: "הורה א",
      parent2_name: "הורה ב",
    });
    expect(mapped).not.toHaveProperty("parent_guardian_id");
    expect(mapped).not.toHaveProperty("parent1_id");
    expect(mapped).not.toHaveProperty("parent2_id");
    expect(mapped).not.toHaveProperty("signature");
    expect(mapped).not.toHaveProperty("signature_2");
    expect(mapped).not.toHaveProperty("full_name");
    expect(mapped).not.toHaveProperty("email");
  });

  it("puts parent2 fields on signer slot 2 and the rest on slot 1", () => {
    const schema = getFormSchema("waiver-multidisciplinary-team");
    expect(schema).toBeTruthy();
    const bySlot = buildSimpleSignPrefillBySignerSlot(schema!, data, inputs);
    expect(bySlot[2]).toEqual({
      parent2_name: "הורה ב",
    });
    expect(bySlot[1]?.parent1_name).toBe("הורה א");
    expect(bySlot[1]?.institution_name).toBe("ביה\"ס דוגמה");
    expect(bySlot[1]).not.toHaveProperty("parent1_id");
    expect(bySlot[1]).not.toHaveProperty("parent_guardian_id");
    expect(bySlot[1]).not.toHaveProperty("parent2_name");
  });
});

describe("waiver-eligibility-characterization SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("waiver-eligibility-characterization")).toBe(
      true
    );
  });

  const inputs: SimpleSignDocumentInput[] = [
    { key: "signature", label: "חתימה", type: "signature", signer: 1 },
    { key: "signature_2", label: "חתימה - הורה ב'", type: "signature", signer: 2 },
    { key: "filled_at", label: "filled_at", type: "date", signer: 0 },
    { key: "institution_name", label: "institution_name", type: "text", signer: 0 },
    { key: "institution_code", label: "institution_code", type: "text", signer: 0 },
    { key: "district", label: "district", type: "text", signer: 0 },
    { key: "parent_guardian_name", label: "parent_guardian_name", type: "text", signer: 0 },
    { key: "parent_guardian_id", label: "parent_guardian_id", type: "text", signer: 0 },
    { key: "consent_disability_docs", label: "consent_disability_docs", type: "checkbox", signer: 0 },
    { key: "consent_committee_docs", label: "consent_committee_docs", type: "checkbox", signer: 0 },
    { key: "committee_docs_detail", label: "committee_docs_detail", type: "text", signer: 0 },
    { key: "consent_edu_treatment_info", label: "consent_edu_treatment_info", type: "checkbox", signer: 0 },
    { key: "consent_final", label: "consent_final", type: "checkbox", signer: 0 },
    { key: "parent1_name", label: "parent1_name", type: "text", signer: 0 },
    { key: "parent1_id", label: "parent1_id", type: "text", signer: 0 },
    { key: "parent2_name", label: "parent2_name", type: "text", signer: 0 },
    { key: "parent2_id", label: "parent2_id", type: "text", signer: 0 },
  ];

  const data = {
    filled_at: "2026-09-15",
    institution_name: "ביה\"ס דוגמה",
    institution_code: "123456",
    district: "מרכז",
    parent_guardian_name: "הורי התלמיד",
    parent_guardian_id: "000000018",
    consent_disability_docs: "true",
    consent_committee_docs: "true",
    committee_docs_detail: "אבחון פסיכולוגי",
    consent_edu_treatment_info: "true",
    consent_final: "true",
    parent1_name: "הורה א",
    parent1_id: "111111118",
    parent2_name: "הורה ב",
    parent2_id: "222222226",
  };

  it("maps every Matoah data field onto the SimpleSign keys", () => {
    const schema = getFormSchema("waiver-eligibility-characterization");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(schema!, data, inputs);
    expect(mapped).toMatchObject({
      filled_at: "2026-09-15",
      institution_name: "ביה\"ס דוגמה",
      parent_guardian_name: "הורי התלמיד",
      consent_final: "V",
      parent1_name: "הורה א",
      parent2_name: "הורה ב",
    });
    expect(mapped).not.toHaveProperty("signature");
    expect(mapped).not.toHaveProperty("signature_2");
    expect(mapped).not.toHaveProperty("parent_guardian_id");
    expect(mapped).not.toHaveProperty("parent1_id");
    expect(mapped).not.toHaveProperty("parent2_id");
  });

  it("puts all form fields on the shared signer slot", () => {
    const schema = getFormSchema("waiver-eligibility-characterization");
    expect(schema).toBeTruthy();
    const bySlot = buildSimpleSignPrefillBySignerSlot(schema!, data, inputs);
    expect(bySlot[0]).toMatchObject({
      institution_name: "ביה\"ס דוגמה",
      parent1_name: "הורה א",
      parent2_name: "הורה ב",
    });
    expect(bySlot[0]).not.toHaveProperty("parent1_id");
    expect(bySlot[0]).not.toHaveProperty("parent2_id");
    expect(bySlot[0]).not.toHaveProperty("parent_guardian_id");
    expect(bySlot[1]).toBeUndefined();
    expect(bySlot[2]).toBeUndefined();
  });
});

describe("waiver-appeal-committee SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("waiver-appeal-committee")).toBe(true);
  });

  const inputs: SimpleSignDocumentInput[] = [
    { key: "signature", label: "חתימה", type: "signature", signer: 1 },
    { key: "signature_2", label: "חתימה - הורה ב'", type: "signature", signer: 2 },
    { key: "filled_at", label: "filled_at", type: "text", signer: 0 },
    { key: "institution_name", label: "institution_name", type: "text", signer: 0 },
    { key: "institution_code", label: "institution_code", type: "text", signer: 0 },
    { key: "district", label: "district", type: "text", signer: 0 },
    { key: "parent_guardian_name", label: "parent_guardian_name", type: "text", signer: 0 },
    { key: "parent_guardian_id", label: "parent_guardian_id", type: "text", signer: 0 },
    { key: "consent_disability_docs", label: "consent_disability_docs", type: "checkbox", signer: 0 },
    { key: "consent_committee_docs", label: "consent_committee_docs", type: "checkbox", signer: 0 },
    { key: "committee_docs_detail", label: "committee_docs_detail", type: "text", signer: 0 },
    { key: "consent_edu_treatment_info", label: "consent_edu_treatment_info", type: "checkbox", signer: 0 },
    { key: "consent_final", label: "consent_final", type: "checkbox", signer: 0 },
    { key: "parent1_name", label: "parent1_name", type: "text", signer: 0 },
    { key: "parent1_id", label: "parent1_id", type: "text", signer: 0 },
    { key: "parent2_name", label: "parent2_name", type: "text", signer: 0 },
    { key: "parent2_id", label: "parent2_id", type: "text", signer: 0 },
  ];

  const data = {
    filled_at: "2026-09-15",
    institution_name: "ביה\"ס דוגמה",
    parent_guardian_name: "הורי התלמיד",
    consent_final: "true",
    parent1_name: "הורה א",
    parent1_id: "111111118",
    parent2_name: "הורה ב",
    parent2_id: "222222226",
  };

  it("maps Matoah data fields onto the SimpleSign keys", () => {
    const schema = getFormSchema("waiver-appeal-committee");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(schema!, data, inputs);
    expect(mapped).toMatchObject({
      filled_at: "2026-09-15",
      institution_name: "ביה\"ס דוגמה",
      parent_guardian_name: "הורי התלמיד",
      consent_final: "V",
      parent1_name: "הורה א",
      parent2_name: "הורה ב",
    });
    expect(mapped).not.toHaveProperty("signature");
    expect(mapped).not.toHaveProperty("signature_2");
    expect(mapped).not.toHaveProperty("parent_guardian_id");
    expect(mapped).not.toHaveProperty("parent1_id");
    expect(mapped).not.toHaveProperty("parent2_id");
  });

  it("puts all form fields on the shared signer slot", () => {
    const schema = getFormSchema("waiver-appeal-committee");
    expect(schema).toBeTruthy();
    const bySlot = buildSimpleSignPrefillBySignerSlot(schema!, data, inputs);
    expect(bySlot[0]).toMatchObject({
      institution_name: "ביה\"ס דוגמה",
      parent1_name: "הורה א",
      parent2_name: "הורה ב",
    });
    expect(bySlot[0]).not.toHaveProperty("parent1_id");
    expect(bySlot[0]).not.toHaveProperty("parent2_id");
    expect(bySlot[0]).not.toHaveProperty("parent_guardian_id");
    expect(bySlot[1]).toBeUndefined();
    expect(bySlot[2]).toBeUndefined();
  });
});

describe("function-scale overlay for SimpleSign", () => {
  it("places V in the selected slot of a 9-character overlay", () => {
    const overlay = formatFuncScaleOverlay("3").replace(/[\u202D\u202C]/g, "");
    expect(overlay).toHaveLength(9);
    expect(overlay[2]).toBe("V");
    expect([...overlay].filter((ch) => ch === "V")).toHaveLength(1);
  });

  it("sends the overlay on multidisciplinary scale fields", () => {
    const schema = getFormSchema("referral-questionnaire-multidisciplinary");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { func_reading_accuracy: "3" },
      [{ key: "acc", label: "func_reading_accuracy", type: "text" }]
    );
    const overlay = mapped.acc.replace(/[\u202D\u202C]/g, "");
    expect(overlay[2]).toBe("V");
  });
});

describe("referral-questionnaire SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("referral-questionnaire")).toBe(true);
  });

  const inputs: SimpleSignDocumentInput[] = [
    { key: "signature", label: "חתימה", type: "signature", required: true, signer: 1 },
    { key: "full_name", label: "שם מלא", type: "text", required: true, signer: 1 },
    { key: "email", label: "אימייל", type: "email", required: true, signer: 1 },
    { key: "id_number", label: "ת.ז.", type: "text", signer: 1 },
    { key: "phone", label: "טלפון", type: "phone", signer: 1 },
    { key: "signature_2", label: "חתימה - הורה ב'", type: "signature", required: true, signer: 2 },
    { key: "first_name", label: "first_name", type: "text", signer: 0 },
    { key: "id_number_2", label: "id_number", type: "text", signer: 0 },
    { key: "phone_2", label: "phone", type: "text", signer: 0 },
    { key: "email_2", label: "email", type: "text", signer: 0 },
    { key: "father_name", label: "father_name", type: "text", signer: 0 },
    { key: "school_name", label: "school_name", type: "text", signer: 0 },
    { key: "gender_male", label: "gender_male", type: "checkbox", signer: 0 },
    { key: "gender_female", label: "gender_female", type: "checkbox", signer: 0 },
    { key: "summary_recommendations", label: "summary_recommendations", type: "text", signer: 0 },
  ];

  it("maps Matoah fields onto shared keys and skips leftover defaults", () => {
    const schema = getFormSchema("referral-questionnaire");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        first_name: "נועה",
        id_number: "123456782",
        phone: "0500000000",
        email: "parent@example.com",
        father_name: "הורה א",
        school_name: 'ביה"ס דוגמה',
        gender: "male",
        summary_recommendations: "המלצה",
      },
      inputs
    );
    expect(mapped.first_name).toBe("נועה");
    expect(mapped.id_number_2).toBe("123456782");
    expect(mapped.phone_2).toBe("0500000000");
    expect(mapped.email_2).toBe("parent@example.com");
    expect(mapped.father_name).toBe("הורה א");
    expect(mapped.school_name).toBe('ביה"ס דוגמה');
    expect(mapped.gender_male).toBe("V");
    expect(mapped.summary_recommendations).toBe("המלצה");
    expect(mapped).not.toHaveProperty("signature");
    expect(mapped).not.toHaveProperty("signature_2");
    expect(mapped.full_name).toBeUndefined();
    expect(mapped.email).toBeUndefined();
    expect(mapped.id_number).toBeUndefined();
    expect(mapped.phone).toBeUndefined();
    expect(mapped).not.toHaveProperty("gender_female");
  });

  it("puts form fields on the shared signer slot", () => {
    const schema = getFormSchema("referral-questionnaire");
    expect(schema).toBeTruthy();
    const bySlot = buildSimpleSignPrefillBySignerSlot(
      schema!,
      { first_name: "נועה", school_name: 'ביה"ס דוגמה' },
      inputs
    );
    expect(bySlot[0]).toMatchObject({
      first_name: "נועה",
      school_name: 'ביה"ס דוגמה',
    });
    expect(bySlot[1]).toBeUndefined();
    expect(bySlot[2]).toBeUndefined();
  });
});

describe("referral-questionnaire-multidisciplinary SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("referral-questionnaire-multidisciplinary")).toBe(
      true
    );
  });

  const inputs: SimpleSignDocumentInput[] = [
    { key: "signature", label: "חתימה", type: "signature", required: true, signer: 1 },
    { key: "full_name", label: "שם מלא", type: "text", required: true, signer: 1 },
    { key: "email", label: "אימייל", type: "email", required: true, signer: 1 },
    { key: "school_name", label: "school_name", type: "text", signer: 1 },
    { key: "id_number_2", label: "id_number", type: "text", signer: 1 },
    { key: "phone_2", label: "phone", type: "text", signer: 1 },
    { key: "gender_male", label: "gender_male", type: "checkbox", signer: 1 },
    { key: "gender_female", label: "gender_female", type: "checkbox", signer: 1 },
    { key: "had_prior_discussion", label: "had_prior_discussion", type: "checkbox", signer: 1 },
    { key: "func_reading_accuracy", label: "func_reading_accuracy", type: "text", signer: 1 },
    { key: "func_writing_manne", label: "func_writing_manne", type: "text", signer: 1 },
    { key: "parent_notes_on_teacher_report", label: "parent_notes_on_teacher_report", type: "text", signer: 1 },
  ];

  it("maps Matoah fields and skips leftover SimpleSign defaults", () => {
    const schema = getFormSchema("referral-questionnaire-multidisciplinary");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        school_name: "ביה\"ס דוגמה",
        id_number: "123456782",
        phone: "0500000000",
        gender: "male",
        had_prior_discussion: "yes",
        func_reading_accuracy: "3",
        parent_notes_on_teacher_report: "הערה",
      },
      inputs
    );
    expect(mapped.school_name).toBe("ביה\"ס דוגמה");
    expect(mapped.id_number_2).toBe("123456782");
    expect(mapped.phone_2).toBe("0500000000");
    expect(mapped.gender_male).toBe("V");
    expect(mapped).not.toHaveProperty("gender");
    expect(mapped).not.toHaveProperty("gender_female");
    expect(mapped.had_prior_discussion).toBe("V");
    expect(mapped.func_reading_accuracy.replace(/[\u202D\u202C]/g, "")[2]).toBe(
      "V"
    );
    expect(mapped.parent_notes_on_teacher_report).toBe("הערה");
    expect(mapped).not.toHaveProperty("signature");
    expect(mapped).not.toHaveProperty("full_name");
    expect(mapped).not.toHaveProperty("email");
    expect(mapped).not.toHaveProperty("func_writing_manne");
  });
});

describe("gender checkboxes for SimpleSign", () => {
  it("marks only the selected gender checkbox with V", () => {
    const schema = getFormSchema("referral-questionnaire-multidisciplinary");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { gender: "male" },
      [
        { key: "g_m", label: "gender_male", type: "checkbox" },
        { key: "g_f", label: "gender_female", type: "checkbox" },
      ]
    );
    expect(mapped.g_m).toBe("V");
    expect(mapped).not.toHaveProperty("g_f");
  });
});

describe("exclusive select checkboxes for SimpleSign", () => {
  it("marks only the selected school-type checkbox with V", () => {
    const schema = getFormSchema("moe-parent-approval-committee-no-presence");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { school_type: "regular" },
      [
        { key: "st_r", label: "school_type_regular", type: "checkbox" },
        { key: "st_s", label: "school_type_special", type: "checkbox" },
      ]
    );
    expect(mapped.st_r).toBe("V");
    expect(mapped).not.toHaveProperty("st_s");
  });

  it("marks only the selected framework-choice checkbox with V", () => {
    const schema = getFormSchema("moe-parent-approval-committee-no-presence");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { framework_choice: "special_class" },
      [
        { key: "fw_school", label: "framework_choice_special_school", type: "checkbox" },
        { key: "fw_class", label: "framework_choice_special_class", type: "checkbox" },
      ]
    );
    expect(mapped.fw_class).toBe("V");
    expect(mapped).not.toHaveProperty("fw_school");
  });

  it("marks only the selected yes/no checkbox with V", () => {
    const schema = getFormSchema("moe-exhaust-options");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { has_personal_plan: "no" },
      [
        { key: "hp_yes", label: "has_personal_plan_yes", type: "checkbox" },
        { key: "hp_no", label: "has_personal_plan_no", type: "checkbox" },
      ]
    );
    expect(mapped.hp_no).toBe("V");
    expect(mapped).not.toHaveProperty("hp_yes");
  });

  it("marks only the selected class-type checkbox with V", () => {
    const schema = getFormSchema("moe-parent-approval-committee-no-presence");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { class_type: "special_kindergarten" },
      [
        { key: "ct_r", label: "class_type_regular", type: "checkbox" },
        { key: "ct_sc", label: "class_type_special_class", type: "checkbox" },
        { key: "ct_sk", label: "class_type_special_kindergarten", type: "checkbox" },
        { key: "ct_ss", label: "class_type_special_school", type: "checkbox" },
      ]
    );
    expect(mapped.ct_sk).toBe("V");
    expect(mapped).not.toHaveProperty("ct_r");
    expect(mapped).not.toHaveProperty("ct_sc");
    expect(mapped).not.toHaveProperty("ct_ss");
  });

  it("marks only the selected appendix-8 characterization checkbox with V", () => {
    const schema = getFormSchema("moe-psychologist-recommendation");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { characterization_type: "learning_disability_58" },
      [
        {
          key: "characterization_type_learning_disability_58",
          label: "characterization_type_learning_disability_58",
          type: "checkbox",
        },
        {
          key: "characterization_type_behavioral_emotional_55",
          label: "characterization_type_behavioral_emotional_55",
          type: "checkbox",
        },
        {
          key: "characterization_type_developmental_delay_62",
          label: "characterization_type_developmental_delay_62",
          type: "checkbox",
        },
      ]
    );
    expect(mapped.characterization_type_learning_disability_58).toBe("V");
    expect(mapped).not.toHaveProperty(
      "characterization_type_behavioral_emotional_55"
    );
    expect(mapped).not.toHaveProperty(
      "characterization_type_developmental_delay_62"
    );
  });
});

describe("tachi table cells for SimpleSign", () => {
  it("prefills header fields and goal-table cells", () => {
    const schema = getFormSchema("tachi");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        full_name: "תלמיד דוגמה",
        class_name: "ג",
        filled_at: "2026-09-15",
        domain: "שפה",
        weekly_hours: "2",
        current_status: "מצב",
        main_goal: "מטרה",
        "tbl_tachi-goals_r0_goal": "יעד ראשון",
        "tbl_tachi-goals_r0_timeframe": "חודש",
        "tbl_tachi-goals_r0_methods": "הוראה פרטנית",
        "tbl_tachi-goals_r0_criteria": "קריטריון",
        "tbl_tachi-goals_r0_followup": "מעקב",
      },
      [
        { key: "full_name", label: "שם מלא", type: "text", required: true },
        { key: "full_name_2", label: "full_name", type: "text" },
        { key: "class_name", label: "class_name", type: "text" },
        { key: "filled_at", label: "filled_at", type: "date" },
        { key: "domain", label: "domain", type: "text" },
        { key: "weekly_hours", label: "weekly_hours", type: "text" },
        { key: "current_status", label: "current_status", type: "text" },
        { key: "main_goal", label: "main_goal", type: "text" },
        { key: "g0", label: "tbl_tachi-goals_r0_goal", type: "text" },
        { key: "tf0", label: "tbl_tachi-goals_r0_timeframe", type: "text" },
        { key: "m0", label: "tbl_tachi-goals_r0_methods", type: "text" },
        { key: "c0", label: "tbl_tachi-goals_r0_criteria", type: "text" },
        { key: "f0", label: "tbl_tachi-goals_r0_followup", type: "text" },
      ]
    );
    expect(mapped.full_name_2).toBe("תלמיד דוגמה");
    expect(mapped.class_name).toBe("ג");
    expect(mapped.filled_at).toBe("2026-09-15");
    expect(mapped.domain).toBe("שפה");
    expect(mapped.weekly_hours).toBe("2");
    expect(mapped.current_status).toBe("מצב");
    expect(mapped.main_goal).toBe("מטרה");
    expect(mapped.g0).toBe("יעד ראשון");
    expect(mapped.tf0).toBe("חודש");
    expect(mapped.m0).toBe("הוראה פרטנית");
    expect(mapped.c0).toBe("קריטריון");
    expect(mapped.f0).toBe("מעקב");
    expect(mapped.full_name).toBeUndefined();
  });
});

describe("moe-parent-approval-committee-no-presence SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("moe-parent-approval-committee-no-presence")).toBe(
      true
    );
  });
});

describe("moe-exhaust-options SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("moe-exhaust-options")).toBe(true);
  });

  it("does not prefill student full_name onto a signer-private SimpleSign field", () => {
    const schema = getFormSchema("moe-exhaust-options");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      { full_name: "תלמיד דוגמה", first_name: "תלמיד", last_name: "דוגמה" },
      [
        { key: "full_name", label: "שם מלא", type: "text", signer: 1 },
        { key: "first_name", label: "first_name", type: "text", signer: 0 },
        { key: "last_name", label: "last_name", type: "text", signer: 0 },
      ]
    );
    expect(mapped.full_name).toBeUndefined();
    expect(mapped.first_name).toBe("תלמיד");
    expect(mapped.last_name).toBe("דוגמה");
  });
});

describe("moe-inclusion-plan SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("moe-inclusion-plan")).toBe(false);
  });

  it("does not lock fields for SimpleSign", () => {
    expect(getFormLockedKeys("moe-inclusion-plan")).toBeNull();
  });

  it("maps checklist marks, dates and summary text onto SimpleSign keys", () => {
    const schema = getFormSchema("moe-inclusion-plan");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        full_name: "תלמיד דוגמה",
        class_seat_physical: "true",
        class_seat_physical_date: "2026-09-17",
        class_seat_physical_notes: "ליד המורה",
        inclusion_goals: "שיפור קשב",
        summary_classroom: "הושב ליד המורה",
      },
      [
        { key: "full_name_2", label: "full_name", type: "text", signer: 0 },
        {
          key: "class_seat_physical",
          label: "class_seat_physical",
          type: "checkbox",
          signer: 0,
        },
        {
          key: "class_seat_physical_date",
          label: "class_seat_physical_date",
          type: "date",
          signer: 0,
        },
        {
          key: "class_seat_physical_notes",
          label: "class_seat_physical_notes",
          type: "text",
          signer: 0,
        },
        {
          key: "inclusion_goals",
          label: "inclusion_goals",
          type: "text",
          signer: 0,
        },
        {
          key: "summary_classroom",
          label: "summary_classroom",
          type: "text",
          signer: 0,
        },
      ]
    );
    expect(mapped.full_name_2).toBe("תלמיד דוגמה");
    expect(mapped.class_seat_physical).toBe("V");
    expect(mapped.class_seat_physical_date).toBe("2026-09-17");
    expect(mapped.class_seat_physical_notes).toBe("ליד המורה");
    expect(mapped.inclusion_goals).toBe("שיפור קשב");
    expect(mapped.summary_classroom).toBe("הושב ליד המורה");
  });
});

describe("moe-psychologist-recommendation SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("moe-psychologist-recommendation")).toBe(true);
  });

  it("uses 4 meeting-attendee rows to match the marked SimpleSign table", () => {
    expect(FORM_TABLE_DEFS["meeting-attendees"]?.defaultRows).toBe(4);
  });

  it("maps student name and attendee cells onto live SimpleSign keys", () => {
    const schema = getFormSchema("moe-psychologist-recommendation");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        full_name: "תלמיד דוגמה",
        id_number: "123456789",
        "tbl_meeting-attendees_r0_name": "נוכח א",
        "tbl_meeting-attendees_r0_role": "מחנכת",
      },
      [
        { key: "full_name", label: "שם מלא", type: "text", signer: 1 },
        { key: "full_name_2", label: "full_name", type: "text", signer: 0 },
        { key: "id_number_2", label: "id_number", type: "text", signer: 0 },
        {
          key: "tbl_meeting_attendees_r0_name",
          label: "tbl_meeting-attendees_r0_name",
          type: "text",
          signer: 0,
        },
        {
          key: "tbl_meeting_attendees_r0_role",
          label: "tbl_meeting-attendees_r0_role",
          type: "text",
          signer: 0,
        },
      ]
    );
    expect(mapped.full_name).toBeUndefined();
    expect(mapped.full_name_2).toBe("תלמיד דוגמה");
    expect(mapped.id_number_2).toBe("123456789");
    expect(mapped.tbl_meeting_attendees_r0_name).toBe("נוכח א");
    expect(mapped.tbl_meeting_attendees_r0_role).toBe("מחנכת");
  });
});

describe("moe-psychologist-code-change SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("moe-psychologist-code-change")).toBe(true);
  });

  it("locks the marked Matoah keys", () => {
    expect(getFormLockedKeys("moe-psychologist-code-change")).toEqual(
      expect.arrayContaining([
        "filled_at",
        "full_name",
        "id_number",
        "school_name",
        "class_level",
        "committee_date",
        "current_characterization",
        "source_multidisciplinary",
        "source_referral_questionnaire",
        "source_official_document",
        "source_other",
        "reasoning",
        "psychologist_name",
        "psychologist_status",
        "psychologist_sign",
        "supervisor_name",
        "supervisor_sign",
      ])
    );
  });

  it("maps student name, sources and reasoning onto live SimpleSign keys", () => {
    const schema = getFormSchema("moe-psychologist-code-change");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        full_name: "תלמיד דוגמה",
        id_number: "123456789",
        source_multidisciplinary: "true",
        source_referral_questionnaire: "true",
        reasoning: "נימוק",
      },
      [
        { key: "full_name", label: "שם מלא", type: "text", signer: 1 },
        { key: "full_name_2", label: "full_name", type: "text", signer: 0 },
        { key: "id_number_2", label: "id_number", type: "text", signer: 0 },
        {
          key: "source_multidisciplinary",
          label: "source_multidisciplinary",
          type: "checkbox",
          signer: 0,
        },
        {
          key: "source_referral_questionnaire_2",
          label: "source_referral_questionnaire",
          type: "checkbox",
          signer: 0,
        },
        { key: "reasoning", label: "reasoning", type: "text", signer: 0 },
      ]
    );
    expect(mapped.full_name).toBeUndefined();
    expect(mapped.full_name_2).toBe("תלמיד דוגמה");
    expect(mapped.id_number_2).toBe("123456789");
    expect(mapped.source_multidisciplinary).toBe("V");
    expect(mapped.source_referral_questionnaire_2).toBe("V");
    expect(mapped.reasoning).toBe("נימוק");
  });
});

describe("moe-exhaust-options support row fields", () => {
  it("keeps סוג only on support rows that have that column in the official form", () => {
    const schema = getFormSchema("moe-exhaust-options");
    expect(schema).toBeTruthy();
    const keys = new Set(listFormFields(schema!).map((field) => field.key));
    expect(keys.has("support_integration_hours_kind")).toBe(true);
    expect(keys.has("support_individual_hours_kind")).toBe(true);
    expect(keys.has("support_shekel_budget_kind")).toBe(true);
    expect(keys.has("support_other_kind")).toBe(true);
    expect(keys.has("support_ale_hours_kind")).toBe(false);
    expect(keys.has("support_counselor_kind")).toBe(false);
    expect(keys.has("support_psychological_kind")).toBe(false);
    expect(keys.has("support_ale_hours_duration")).toBe(true);
    expect(keys.has("support_counselor_duration")).toBe(true);
    expect(keys.has("support_psychological_duration")).toBe(true);
  });

  it("prefills kind, individual/group and duration for a support row", () => {
    const schema = getFormSchema("moe-exhaust-options");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        support_integration_hours: "הוראה מתקנת",
        support_integration_hours_kind: "טיפול",
        support_integration_hours_setting: "individual",
        support_integration_hours_duration: "3 חודשים",
      },
      [
        { key: "notes", label: "support_integration_hours", type: "text" },
        { key: "kind", label: "support_integration_hours_kind", type: "text" },
        { key: "setting", label: "support_integration_hours_setting", type: "text" },
        {
          key: "ind",
          label: "support_integration_hours_setting_individual",
          type: "checkbox",
        },
        {
          key: "grp",
          label: "support_integration_hours_setting_group",
          type: "checkbox",
        },
        { key: "dur", label: "support_integration_hours_duration", type: "text" },
      ]
    );
    expect(mapped.notes).toBe("הוראה מתקנת");
    expect(mapped.kind).toBe("טיפול");
    expect(mapped.setting).toBe("פרטני");
    expect(mapped).not.toHaveProperty("ind");
    expect(mapped).not.toHaveProperty("grp");
    expect(mapped.dur).toBe("3 חודשים");
  });
});

describe("tachi SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("tachi")).toBe(false);
  });

  it("maps table cells via labels and skips leftover defaults", () => {
    const schema = getFormSchema("tachi");
    expect(schema).toBeTruthy();
    const inputs: SimpleSignDocumentInput[] = [
      { key: "signature", label: "חתימה", type: "signature", required: true, signer: 1 },
      { key: "full_name", label: "שם מלא", type: "text", required: true, signer: 1 },
      { key: "email", label: "אימייל", type: "email", required: true, signer: 1 },
      { key: "full_name_2", label: "full_name", type: "text", signer: 1 },
      { key: "domain", label: "domain", type: "text", signer: 1 },
      {
        key: "tbl_tachi_goals_r0_goal",
        label: "tbl_tachi-goals_r0_goal",
        type: "text",
        signer: 1,
      },
    ];
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        full_name: "תלמיד דוגמה",
        domain: "שפה",
        "tbl_tachi-goals_r0_goal": "יעד",
      },
      inputs
    );
    expect(mapped.full_name_2).toBe("תלמיד דוגמה");
    expect(mapped.domain).toBe("שפה");
    expect(mapped.tbl_tachi_goals_r0_goal).toBe("יעד");
    expect(mapped).not.toHaveProperty("signature");
    expect(mapped).not.toHaveProperty("email");
    expect(mapped.full_name).toBeUndefined();
  });
});

describe("tachi-integrative table cells for SimpleSign", () => {
  it("prefills individual goal-table cells", () => {
    const schema = getFormSchema("tachi-integrative");
    expect(schema).toBeTruthy();
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        full_name: "תלמיד",
        tbl_tachi_integrative_goals_r0_goal: "should-not-match",
        "tbl_tachi-integrative-goals_r0_goal": "יעד ראשון",
        "tbl_tachi-integrative-goals_r0_teacher": "הוראה פרטנית",
      },
      [
        { key: "g0", label: "tbl_tachi-integrative-goals_r0_goal", type: "text" },
        {
          key: "t0",
          label: "tbl_tachi-integrative-goals_r0_teacher",
          type: "text",
        },
      ]
    );
    expect(mapped.g0).toBe("יעד ראשון");
    expect(mapped.t0).toBe("הוראה פרטנית");
  });
});

describe("tachi-integrative SimpleSign template", () => {
  it("is wired for SimpleSign send", () => {
    expect(formMayUseSimpleSign("tachi-integrative")).toBe(false);
  });

  it("maps header and table cells via labels and skips leftover defaults", () => {
    const schema = getFormSchema("tachi-integrative");
    expect(schema).toBeTruthy();
    const inputs: SimpleSignDocumentInput[] = [
      { key: "signature", label: "חתימה", type: "signature", required: true, signer: 1 },
      { key: "full_name", label: "שם מלא", type: "text", required: true, signer: 1 },
      { key: "email", label: "אימייל", type: "email", required: true, signer: 1 },
      { key: "school_year", label: "school_year", type: "text", signer: 1 },
      { key: "full_name_2", label: "full_name", type: "text", signer: 1 },
      { key: "domain", label: "domain", type: "text", signer: 1 },
      {
        key: "tbl_tachi_integrative_goals_r0_goal",
        label: "tbl_tachi-integrative-goals_r0_goal",
        type: "text",
        signer: 1,
      },
    ];
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        school_year: 'תשפ"ז',
        full_name: "תלמיד דוגמה",
        domain: "שפה",
        "tbl_tachi-integrative-goals_r0_goal": "יעד",
      },
      inputs
    );
    expect(mapped.school_year).toBe('תשפ"ז');
    expect(mapped.full_name_2).toBe("תלמיד דוגמה");
    expect(mapped.domain).toBe("שפה");
    expect(mapped.tbl_tachi_integrative_goals_r0_goal).toBe("יעד");
    expect(mapped).not.toHaveProperty("signature");
    expect(mapped).not.toHaveProperty("email");
    expect(mapped.full_name).toBeUndefined();
  });
});

describe("kindergarten treatments SimpleSign cells", () => {
  it("prefills each treatment cell and marks only checked location boxes", () => {
    const schema = getFormSchema("referral-questionnaire-kindergarten");
    expect(schema).toBeTruthy();
    const ganKey = tableCellKey("kindergarten-treatments", 0, "gan");
    const communityKey = tableCellKey("kindergarten-treatments", 0, "community");
    const frequencyKey = tableCellKey("kindergarten-treatments", 0, "frequency");
    expect(ganKey).toBe("support_psychologist_gan");
    const mapped = buildSimpleSignPrefillForDocument(
      schema!,
      {
        [ganKey]: "true",
        [communityKey]: "",
        [frequencyKey]: "פעם בשבוע",
        support_other: "ריפוי בעיסוק פרטי",
      },
      [
        { key: ganKey, label: ganKey, type: "checkbox" },
        { key: communityKey, label: communityKey, type: "checkbox" },
        { key: frequencyKey, label: frequencyKey, type: "text" },
        { key: "support_other", label: "support_other", type: "text" },
      ]
    );
    expect(mapped[ganKey]).toBe("V");
    expect(mapped).not.toHaveProperty(communityKey);
    expect(mapped[frequencyKey]).toBe("פעם בשבוע");
    expect(mapped.support_other).toBe("ריפוי בעיסוק פרטי");
  });
});
