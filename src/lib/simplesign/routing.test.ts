import { describe, expect, it } from "vitest";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { getFormLockedKeys } from "@/lib/form-schema-loader";
import {
  SIMPLESIGN_FORM_CONFIGS,
  formMayUseSimpleSign,
  isSimpleSignSignerField,
} from "@/lib/simplesign/config";

const ALLOWLIST = [
  "waiver-confidentiality",
  "waiver-multidisciplinary-team",
  "waiver-appeal-committee",
  "waiver-eligibility-characterization",
  "moe-psychologist-recommendation",
  "moe-exhaust-options",
  "referral-questionnaire-multidisciplinary",
  "referral-questionnaire-kindergarten",
  "referral-questionnaire",
  "moe-psychologist-code-change",
  "moe-parent-approval-committee-no-presence",
] as const;

describe("SimpleSign routing allowlist", () => {
  it("includes only the allowlisted forms", () => {
    expect(SIMPLESIGN_FORM_CONFIGS.map((c) => c.formId).sort()).toEqual(
      [...ALLOWLIST].sort()
    );
  });

  it("keeps tachi in Matoah", () => {
    expect(formMayUseSimpleSign("tachi")).toBe(false);
    expect(formMayUseSimpleSign("tachi-integrative")).toBe(false);
    expect(getFormLockedKeys("tachi")).toBeNull();
    expect(getFormLockedKeys("tachi-integrative")).toBeNull();
    expect(isSimpleSignSignerField("tachi", "parents_signature")).toBe(false);
  });

  it("keeps the inclusion plan in Matoah", () => {
    expect(formMayUseSimpleSign("moe-inclusion-plan")).toBe(false);
    expect(getFormLockedKeys("moe-inclusion-plan")).toBeNull();
    expect(isSimpleSignSignerField("moe-inclusion-plan", "teacher_sign")).toBe(
      false
    );
    expect(isSimpleSignSignerField("moe-inclusion-plan", "principal_sign")).toBe(
      false
    );
  });

  it("keeps eligibility renewal (appendix 6.11) in Matoah", () => {
    expect(formMayUseSimpleSign("moe-eligibility-renewal")).toBe(false);
    expect(getFormLockedKeys("moe-eligibility-renewal")).toBeNull();
    expect(
      isSimpleSignSignerField("moe-eligibility-renewal", "principal_sign")
    ).toBe(false);
    expect(
      isSimpleSignSignerField("moe-eligibility-renewal", "parent1_sign")
    ).toBe(false);
  });

  it("keeps school website photo consent in Matoah", () => {
    expect(formMayUseSimpleSign("moe-school-website-photo-consent")).toBe(false);
    expect(getFormLockedKeys("moe-school-website-photo-consent")).toBeNull();
    expect(
      isSimpleSignSignerField("moe-school-website-photo-consent", "parent_sign")
    ).toBe(false);
  });

  it("maps SimpleSign signers onto form signature fields and requires no Matoah staff gate", () => {
    for (const config of SIMPLESIGN_FORM_CONFIGS) {
      expect(config.requiredStaffSignatureKeys).toEqual([]);
      const schema = getFormSchema(config.formId);
      expect(schema).toBeDefined();
      const signatureKeys = listFormFields(schema!)
        .filter((field) => field.type === "signature")
        .map((field) => field.key);
      for (const signer of config.parentSigners) {
        expect(signatureKeys).toContain(signer.signatureFieldKey);
      }
    }
  });
});
