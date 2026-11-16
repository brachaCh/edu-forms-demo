import { afterEach, describe, expect, it } from "vitest";
import {
  buildSignerEmailRows,
  collectSignatureAssignments,
  isHiddenSingleParentWaiverField,
  partitionSignerAssignments,
  prepareSignerEmailRowsForSend,
  resolveVisibleParentSignerKeys,
  resolveInstitutionManagerSignatureEmail,
  resolveStaffEmailByFullName,
} from "@/lib/simplesign/signer-email-rows";

describe("buildSignerEmailRows", () => {
  it("assigns split parent emails to parent signature keys", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: ["parent1_signature", "parent2_signature"],
      parentEmails: ["a@example.com", "b@example.com"],
    });
    expect(rows).toEqual([
      { fieldKey: "parent1_signature", email: "a@example.com", required: true },
      { fieldKey: "parent2_signature", email: "b@example.com", required: true },
    ]);
  });

  it("uses staff email for staff keys and parent emails only for parents", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: [
        "homeroom_signature",
        "parent1_signature",
        "parent2_signature",
      ],
      parentEmails: ["dad@example.com", "mom@example.com"],
      staffEmailByFieldKey: { homeroom_signature: "teacher@school.com" },
    });
    expect(rows).toEqual([
      {
        fieldKey: "homeroom_signature",
        email: "teacher@school.com",
        required: true,
      },
      { fieldKey: "parent1_signature", email: "dad@example.com", required: true },
      { fieldKey: "parent2_signature", email: "mom@example.com", required: true },
    ]);
  });

  it("prefers direct parent email mapping over fallback array", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: ["father_signature", "mother_signature"],
      parentEmails: ["fallback1@example.com", "fallback2@example.com"],
      parentEmailByFieldKey: {
        father_signature: "dad-direct@example.com",
        mother_signature: "mom-direct@example.com",
      },
    });
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "dad-direct@example.com", required: true },
      { fieldKey: "mother_signature", email: "mom-direct@example.com", required: true },
    ]);
  });

  it("falls back to parentEmails array when parentEmailByFieldKey is missing keys (consumes correct slot)", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: ["father_signature", "mother_signature"],
      parentEmails: ["dad-old@example.com", "mom-old@example.com"],
      parentEmailByFieldKey: {
        father_signature: "dad-new@example.com",
      },
    });
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "dad-new@example.com", required: true },
      { fieldKey: "mother_signature", email: "mom-old@example.com", required: true },
    ]);
  });

  it("privacy: only father_email filled with legacy two-parent email - mother gets correct fallback slot", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: ["father_signature", "mother_signature"],
      parentEmails: ["dad-old@example.com", "mom-old@example.com"],
      parentEmailByFieldKey: {
        father_signature: "dad-new@example.com",
      },
    });
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "dad-new@example.com", required: true },
      { fieldKey: "mother_signature", email: "mom-old@example.com", required: true },
    ]);
  });

  it("privacy: only mother_email filled with legacy two-parent email - father gets correct fallback slot", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: ["father_signature", "mother_signature"],
      parentEmails: ["dad-old@example.com", "mom-old@example.com"],
      parentEmailByFieldKey: {
        mother_signature: "mom-new@example.com",
      },
    });
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "dad-old@example.com", required: true },
      { fieldKey: "mother_signature", email: "mom-new@example.com", required: true },
    ]);
  });

  it("uses parentEmails fallback when parentEmailByFieldKey has empty string", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: ["father_signature", "mother_signature"],
      parentEmails: ["fallback1@example.com", "fallback2@example.com"],
      parentEmailByFieldKey: {
        father_signature: "",
        mother_signature: "mom@example.com",
      },
    });
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "fallback1@example.com", required: true },
      { fieldKey: "mother_signature", email: "mom@example.com", required: true },
    ]);
  });
});

describe("partitionSignerAssignments", () => {
  it("keeps first email per required key and treats the rest as extras", () => {
    const result = partitionSignerAssignments(
      ["homeroom_signature", "parent1_signature"],
      [
        { fieldKey: "homeroom_signature", email: "t@school.com" },
        { fieldKey: "parent1_signature", email: "p@home.com" },
        { fieldKey: "parent1_signature", email: "p2@home.com" },
      ]
    );
    expect(result.missingKeys).toEqual([]);
    expect(result.primary).toEqual([
      { fieldKey: "homeroom_signature", email: "t@school.com" },
      { fieldKey: "parent1_signature", email: "p@home.com" },
    ]);
    expect(result.extras).toEqual([
      { fieldKey: "parent1_signature", email: "p2@home.com" },
    ]);
  });

  it("reports missing required keys", () => {
    const result = partitionSignerAssignments(
      ["parent1_signature", "parent2_signature"],
      [{ fieldKey: "parent1_signature", email: "a@x.com" }]
    );
    expect(result.missingKeys).toEqual(["parent2_signature"]);
  });
});

describe("TZ-30: prepareSignerEmailRowsForSend", () => {
  const twoParentRows = [
    { fieldKey: "father_signature", email: "dad@example.com", required: true },
    { fieldKey: "mother_signature", email: "", required: true },
  ];

  it("waiver + flagged + one parent email: drops the empty second parent", () => {
    const rows = prepareSignerEmailRowsForSend(twoParentRows, {
      formId: "waiver-confidentiality",
      singleResponsibleParty: true,
    });
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "dad@example.com", required: true },
    ]);
  });

  it("waiver + flagged + only mother email: keeps mother only", () => {
    const rows = prepareSignerEmailRowsForSend(
      [
        { fieldKey: "father_signature", email: "", required: true },
        { fieldKey: "mother_signature", email: "mom@example.com", required: true },
      ],
      {
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
      }
    );
    expect(rows).toEqual([
      { fieldKey: "mother_signature", email: "mom@example.com", required: true },
    ]);
  });

  it("waiver + flagged + both emails: keeps only the first filled parent", () => {
    const rows = prepareSignerEmailRowsForSend(
      [
        { fieldKey: "father_signature", email: "dad@example.com", required: true },
        { fieldKey: "mother_signature", email: "mom@example.com", required: true },
      ],
      {
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
      }
    );
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "dad@example.com", required: true },
    ]);
  });

  it("waiver + flagged + staff row: keeps the staff signer and one parent", () => {
    const rows = prepareSignerEmailRowsForSend(
      [
        { fieldKey: "homeroom_signature", email: "teacher@school.com", required: true },
        { fieldKey: "father_signature", email: "", required: true },
        { fieldKey: "mother_signature", email: "mom@example.com", required: true },
      ],
      {
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
      }
    );
    expect(rows).toEqual([
      { fieldKey: "homeroom_signature", email: "teacher@school.com", required: true },
      { fieldKey: "mother_signature", email: "mom@example.com", required: true },
    ]);
  });

  it("waiver + unflagged + only mother email: still shows both parent rows", () => {
    const rows = prepareSignerEmailRowsForSend(
      [
        { fieldKey: "father_signature", email: "", required: true },
        { fieldKey: "mother_signature", email: "mom@example.com", required: true },
      ],
      {
        formId: "waiver-confidentiality",
        singleResponsibleParty: false,
      }
    );
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "", required: true },
      { fieldKey: "mother_signature", email: "mom@example.com", required: true },
    ]);
  });

  it("waiver + flagged + no emails: keeps one empty required parent row", () => {
    const rows = prepareSignerEmailRowsForSend(
      [
        { fieldKey: "father_signature", email: "", required: true },
        { fieldKey: "mother_signature", email: "", required: true },
      ],
      {
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
      }
    );
    expect(rows).toEqual([
      { fieldKey: "father_signature", email: "", required: true },
    ]);
  });

  it("waiver + unflagged: returns the original rows unchanged", () => {
    const rows = prepareSignerEmailRowsForSend(twoParentRows, {
      formId: "waiver-confidentiality",
      singleResponsibleParty: false,
    });
    expect(rows).toBe(twoParentRows);
  });

  it("non-waiver two-parent form: returns the original rows unchanged", () => {
    const referralRows = [
      { fieldKey: "homeroom_signature", email: "teacher@school.com", required: true },
      { fieldKey: "parent1_signature", email: "a@example.com", required: true },
      { fieldKey: "parent2_signature", email: "", required: true },
    ];
    const rows = prepareSignerEmailRowsForSend(referralRows, {
      formId: "referral-questionnaire",
      singleResponsibleParty: true,
    });
    expect(rows).toBe(referralRows);
  });
});

describe("TZ-30: collectSignatureAssignments send path", () => {
  it("allows send with one required parent and an empty optional parent", () => {
    const result = collectSignatureAssignments([
      {
        email: "dad@example.com",
        fieldKey: "father_signature",
        fieldLabel: "חתימת האב",
        required: true,
      },
      {
        email: "",
        fieldKey: "mother_signature",
        fieldLabel: "חתימת האם",
        required: false,
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignments).toEqual([
        {
          email: "dad@example.com",
          fieldKey: "father_signature",
          fieldLabel: "חתימת האב",
        },
      ]);
    }
  });

  it("still sends both when the optional parent email is filled", () => {
    const result = collectSignatureAssignments([
      {
        email: "dad@example.com",
        fieldKey: "father_signature",
        fieldLabel: "חתימת האב",
        required: true,
      },
      {
        email: "mom@example.com",
        fieldKey: "mother_signature",
        fieldLabel: "חתימת האם",
        required: false,
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignments).toHaveLength(2);
    }
  });

  it("rejects when the only required parent email is empty", () => {
    const result = collectSignatureAssignments([
      {
        email: "",
        fieldKey: "father_signature",
        fieldLabel: "חתימת האב",
        required: true,
      },
      {
        email: "",
        fieldKey: "mother_signature",
        fieldLabel: "חתימת האם",
        required: false,
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("מייל");
    }
  });

  it("full send path: waiver + flagged + one parent email produces one assignment", () => {
    const built = buildSignerEmailRows({
      signatureKeys: ["father_signature", "mother_signature"],
      parentEmails: [],
      parentEmailByFieldKey: { father_signature: "dad@example.com" },
    });
    const prepared = prepareSignerEmailRowsForSend(built, {
      formId: "waiver-confidentiality",
      singleResponsibleParty: true,
    });
    const collected = collectSignatureAssignments(
      prepared.map((row) => ({
        email: row.email,
        fieldKey: row.fieldKey,
        fieldLabel: row.fieldKey === "father_signature" ? "חתימת האב" : "חתימת האם",
        required: row.required,
      }))
    );
    expect(prepared).toHaveLength(1);
    expect(collected.ok).toBe(true);
    if (collected.ok) {
      expect(collected.assignments).toEqual([
        {
          email: "dad@example.com",
          fieldKey: "father_signature",
          fieldLabel: "חתימת האב",
        },
      ]);
    }
  });

  it("rejects two required rows when the second email is missing", () => {
    const result = collectSignatureAssignments([
      {
        email: "dad@example.com",
        fieldKey: "father_signature",
        fieldLabel: "חתימת האב",
        required: true,
      },
      {
        email: "",
        fieldKey: "mother_signature",
        fieldLabel: "חתימת האם",
        required: true,
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("בכל שורה");
    }
  });

  it("names the principal row when principal_sign email is missing (TZ-215)", () => {
    const result = collectSignatureAssignments([
      {
        email: "dad@example.com",
        fieldKey: "parent1_sign",
        fieldLabel: "חתימת הורה 1",
        required: true,
      },
      {
        email: "mom@example.com",
        fieldKey: "parent2_sign",
        fieldLabel: "חתימת הורה 2",
        required: true,
      },
      {
        email: "",
        fieldKey: "principal_sign",
        fieldLabel: "חתימת מנהל בית הספר",
        required: true,
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        "יש להזין כתובת מייל תקינה עבור «חתימת מנהל בית הספר»"
      );
    }
  });

  it("maps student parent emails onto parent1_sign and parent2_sign keys", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: ["principal_sign", "parent1_sign", "parent2_sign"],
      parentEmails: [],
      parentEmailByFieldKey: {
        parent1_sign: "dad@moe.example",
        parent2_sign: "mom@moe.example",
      },
      staffEmailByFieldKey: { principal_sign: "principal@school.example" },
    });
    expect(rows).toEqual([
      {
        fieldKey: "principal_sign",
        email: "principal@school.example",
        required: true,
      },
      { fieldKey: "parent1_sign", email: "dad@moe.example", required: true },
      { fieldKey: "parent2_sign", email: "mom@moe.example", required: true },
    ]);
  });
});

import {
  getSingleParentWaiverTemplateError,
  resolveSimpleSignSignerPlan,
  shouldUseSingleSignerSimpleSign,
  SINGLE_PARENT_WAIVER_TEMPLATE_ERROR,
} from "@/lib/simplesign/signer-plan";
import {
  findSignerByFieldKey,
  getSimpleSignDocumentTokenForStudent,
  getSimpleSignFormConfig,
  isUsingSingleParentTemplate,
} from "@/lib/simplesign/config";
import type { Student } from "@/lib/supabase/types";

describe("TZ-30: resolveVisibleParentSignerKeys / hidden fields", () => {
  const parentSignerKeys = ["father_signature", "mother_signature"];

  it("single-parent + mother email: only mother key", () => {
    expect(
      resolveVisibleParentSignerKeys({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        parentSignerKeys,
        filledParentKeys: ["mother_signature"],
      })
    ).toEqual(["mother_signature"]);
  });

  it("two-parent: both keys even when only mother is filled", () => {
    expect(
      resolveVisibleParentSignerKeys({
        formId: "waiver-confidentiality",
        singleResponsibleParty: false,
        parentSignerKeys,
        filledParentKeys: ["mother_signature"],
      })
    ).toEqual(parentSignerKeys);
  });

  it("hides the unused parent name/id/signature fields", () => {
    expect(
      isHiddenSingleParentWaiverField("father_name", ["mother_signature"])
    ).toBe(true);
    expect(
      isHiddenSingleParentWaiverField("father_signature", ["mother_signature"])
    ).toBe(true);
    expect(
      isHiddenSingleParentWaiverField("mother_name", ["mother_signature"])
    ).toBe(false);
    expect(isHiddenSingleParentWaiverField("father_name", null)).toBe(false);
  });
});

/**
 * TZ-30: Single responsible party tests for resolveSimpleSignSignerPlan
 *
 * These tests verify the signer plan resolution for create-submissions
 * when a student has single_responsible_party=true for confidentiality waivers.
 */
describe("TZ-30: resolveSimpleSignSignerPlan", () => {
  const WAIVER_FORM_ID = "waiver-confidentiality";
  const OTHER_FORM_ID = "other-form";
  const parentSignerKeys = ["father_signature", "mother_signature"];

  it("waiver + flagged + one parent: passes with that parent as primary", () => {
    const result = resolveSimpleSignSignerPlan({
      formId: WAIVER_FORM_ID,
      singleResponsibleParty: true,
      parentSignerKeys,
      assignments: [{ fieldKey: "father_signature", email: "dad@example.com" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toEqual([
        { fieldKey: "father_signature", email: "dad@example.com" },
      ]);
      expect(result.extras).toEqual([]);
    }
  });

  it("waiver + flagged + zero parents: rejected", () => {
    const result = resolveSimpleSignSignerPlan({
      formId: WAIVER_FORM_ID,
      singleResponsibleParty: true,
      parentSignerKeys,
      assignments: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("לפחות הורה אחד");
    }
  });

  it("waiver + flagged + only non-parent key: rejected", () => {
    const result = resolveSimpleSignSignerPlan({
      formId: WAIVER_FORM_ID,
      singleResponsibleParty: true,
      parentSignerKeys,
      assignments: [{ fieldKey: "staff_signature", email: "teacher@school.com" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("לפחות הורה אחד");
    }
  });

  it("waiver + unflagged + one parent: rejected", () => {
    const result = resolveSimpleSignSignerPlan({
      formId: WAIVER_FORM_ID,
      singleResponsibleParty: false,
      parentSignerKeys,
      assignments: [{ fieldKey: "father_signature", email: "dad@example.com" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("לכל החותמים");
    }
  });

  it("waiver + unflagged + two parents: passes", () => {
    const result = resolveSimpleSignSignerPlan({
      formId: WAIVER_FORM_ID,
      singleResponsibleParty: false,
      parentSignerKeys,
      assignments: [
        { fieldKey: "father_signature", email: "dad@example.com" },
        { fieldKey: "mother_signature", email: "mom@example.com" },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toHaveLength(2);
      expect(result.extras).toEqual([]);
    }
  });

  it("non-waiver + flag: still requires both parents", () => {
    const result = resolveSimpleSignSignerPlan({
      formId: OTHER_FORM_ID,
      singleResponsibleParty: true,
      parentSignerKeys,
      assignments: [{ fieldKey: "father_signature", email: "dad@example.com" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("לכל החותמים");
    }
  });

  it("waiver + flagged + staff assignment: keeps the staff signer", () => {
    const result = resolveSimpleSignSignerPlan({
      formId: WAIVER_FORM_ID,
      singleResponsibleParty: true,
      parentSignerKeys,
      assignments: [
        { fieldKey: "homeroom_signature", email: "teacher@school.com" },
        { fieldKey: "mother_signature", email: "mom@example.com" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toEqual([
        { fieldKey: "homeroom_signature", email: "teacher@school.com" },
        { fieldKey: "mother_signature", email: "mom@example.com" },
      ]);
    }
  });
});

describe("TZ-30: single-signer SimpleSign path", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("does not use the single-signer API on a multi-signer document without a dedicated template", () => {
    delete process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT;
    expect(
      shouldUseSingleSignerSimpleSign({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        documentIsMultiSigner: true,
      })
    ).toBe(false);
    expect(
      getSingleParentWaiverTemplateError({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        documentIsMultiSigner: true,
      })
    ).toBe(SINGLE_PARENT_WAIVER_TEMPLATE_ERROR);
  });

  it("keeps multi-signer API for a two-parent waiver", () => {
    expect(
      shouldUseSingleSignerSimpleSign({
        formId: "waiver-confidentiality",
        singleResponsibleParty: false,
        documentIsMultiSigner: true,
      })
    ).toBe(false);
  });

  it("waiver template has no staff signer fields", () => {
    const config = getSimpleSignFormConfig("waiver-confidentiality");
    expect(config?.requiredStaffSignatureKeys).toEqual([]);
  });

  it("mother assignment uses the mother's name, never האב", () => {
    const config = getSimpleSignFormConfig("waiver-confidentiality");
    expect(config).toBeTruthy();
    const signer = findSignerByFieldKey(config!, "mother_signature");
    const student = {
      mother_name: "דקלה",
      father_name: "",
    } as Student;
    expect(signer?.defaultSignerName(student, { mother_name: "דקלה" })).toBe(
      "דקלה"
    );
    expect(signer?.defaultSignerName(student, {})).toBe("דקלה");
    expect(signer?.defaultSignerName(student, {})).not.toBe("האב");
  });
});

describe("TZ-30: dedicated single-parent template selection", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("config has singleParentDocumentTokenEnv for waiver-confidentiality", () => {
    const config = getSimpleSignFormConfig("waiver-confidentiality");
    expect(config?.singleParentDocumentTokenEnv).toBe(
      "SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT"
    );
  });

  it("isUsingSingleParentTemplate returns false when env var is not set", () => {
    delete process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT;
    expect(
      isUsingSingleParentTemplate("waiver-confidentiality", true)
    ).toBe(false);
  });

  it("isUsingSingleParentTemplate returns false for two-parent students", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    expect(
      isUsingSingleParentTemplate("waiver-confidentiality", false)
    ).toBe(false);
    expect(
      isUsingSingleParentTemplate("waiver-confidentiality", null)
    ).toBe(false);
  });

  it("isUsingSingleParentTemplate returns true when env var is set and student is single-parent", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    expect(
      isUsingSingleParentTemplate("waiver-confidentiality", true)
    ).toBe(true);
  });

  it("isUsingSingleParentTemplate returns false for non-waiver forms", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    expect(
      isUsingSingleParentTemplate("referral-questionnaire", true)
    ).toBe(false);
  });

  it("getSimpleSignDocumentTokenForStudent returns single-parent template when available", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_BASIC = "basic-token";
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    expect(
      getSimpleSignDocumentTokenForStudent("waiver-confidentiality", true)
    ).toBe("single-parent-token");
  });

  it("getSimpleSignDocumentTokenForStudent falls back to basic template for two-parent students", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_BASIC = "basic-token";
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    expect(
      getSimpleSignDocumentTokenForStudent("waiver-confidentiality", false)
    ).toBe("basic-token");
  });

  it("getSimpleSignDocumentTokenForStudent falls back to basic template when single-parent env not set", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_BASIC = "basic-token";
    delete process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT;
    expect(
      getSimpleSignDocumentTokenForStudent("waiver-confidentiality", true)
    ).toBe("basic-token");
  });

  it("shouldUseSingleSignerSimpleSign returns true when using dedicated single-parent template", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    expect(
      shouldUseSingleSignerSimpleSign({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        documentIsMultiSigner: false,
      })
    ).toBe(true);
  });

  it("without dedicated template, single-parent + multi_signer is an error (not a workaround)", () => {
    delete process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT;
    expect(
      shouldUseSingleSignerSimpleSign({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        documentIsMultiSigner: true,
      })
    ).toBe(false);
    expect(
      getSingleParentWaiverTemplateError({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
      })
    ).toBe(SINGLE_PARENT_WAIVER_TEMPLATE_ERROR);
    expect(
      getSingleParentWaiverTemplateError({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        documentIsMultiSigner: true,
      })
    ).toBe(SINGLE_PARENT_WAIVER_TEMPLATE_ERROR);
  });

  it("dedicated template detected as multi_signer returns the same clear error", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    expect(
      shouldUseSingleSignerSimpleSign({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        documentIsMultiSigner: true,
      })
    ).toBe(true);
    expect(
      getSingleParentWaiverTemplateError({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        documentIsMultiSigner: true,
      })
    ).toBe(SINGLE_PARENT_WAIVER_TEMPLATE_ERROR);
  });

  it("dedicated single-signer template has no template error", () => {
    process.env.SIMPLESIGN_DOC_WAIVER_SINGLE_PARENT = "single-parent-token";
    expect(
      getSingleParentWaiverTemplateError({
        formId: "waiver-confidentiality",
        singleResponsibleParty: true,
        documentIsMultiSigner: false,
      })
    ).toBeNull();
  });
});

describe("TZ-165: resolveInstitutionManagerSignatureEmail", () => {
  const staff = [
    {
      full_name: "רות מנהלת",
      email: "principal@school.il",
      user_profile_id: "owner-1",
      role: "מנהלת",
    },
    {
      full_name: "דנה מומחית",
      email: "expert@school.il",
      user_profile_id: null,
      role: "מומחית תחום",
    },
    {
      full_name: "רחל מחנכת",
      email: "homeroom@school.il",
      user_profile_id: "teacher-1",
      role: "מחנכת",
    },
  ];

  it("prefers principal_name match like MOE forms", () => {
    expect(
      resolveInstitutionManagerSignatureEmail({
        staff,
        principalName: "רות מנהלת",
      })
    ).toBe("principal@school.il");
  });

  it("uses staff role מנהל/ת when principal name is missing", () => {
    expect(
      resolveInstitutionManagerSignatureEmail({
        staff,
      })
    ).toBe("principal@school.il");
  });

  it("uses linked staff email for a managing session user", () => {
    const staffWithoutPrincipal = staff.filter(
      (row) => !row.role?.includes("מנהל")
    );
    expect(
      resolveInstitutionManagerSignatureEmail({
        staff: staffWithoutPrincipal,
        sessionUser: {
          id: "teacher-1",
          full_name: "רחל מחנכת",
          email: "wrong@school.il",
        },
        canManageStudents: true,
      })
    ).toBe("homeroom@school.il");
  });

  it("returns empty for linked session user without canManageStudents", () => {
    const staffWithoutPrincipal = staff.filter(
      (row) => !row.role?.includes("מנהל")
    );
    expect(
      resolveInstitutionManagerSignatureEmail({
        staff: staffWithoutPrincipal,
        sessionUser: {
          id: "teacher-1",
          full_name: "רחל מחנכת",
          email: "homeroom@school.il",
        },
        canManageStudents: false,
      })
    ).toBe("");
  });

  it("returns empty when no manager email is known", () => {
    expect(
      resolveInstitutionManagerSignatureEmail({
        staff: [{ full_name: "רחל", email: "", user_profile_id: null, role: "מחנכת" }],
        sessionUser: {
          id: "member-1",
          full_name: "חברת צוות",
          email: "",
        },
        canManageStudents: false,
      })
    ).toBe("");
  });

  it("prefills accommodations student_signature via buildSignerEmailRows", () => {
    const rows = buildSignerEmailRows({
      signatureKeys: ["student_signature"],
      parentEmails: [],
      staffEmailByFieldKey: {
        student_signature: resolveInstitutionManagerSignatureEmail({ staff }),
      },
    });
    expect(rows).toEqual([
      {
        fieldKey: "student_signature",
        email: "principal@school.il",
        required: true,
      },
    ]);
  });
});
