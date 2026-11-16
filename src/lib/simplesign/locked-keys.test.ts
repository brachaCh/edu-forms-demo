import { describe, expect, it } from "vitest";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { getFormLockedKeys } from "@/lib/form-schema-loader";
import {
  simplesignLockedKeysHint,
  listSimpleSignLockErrors,
} from "@/lib/simplesign/locked-keys";
import { SIMPLESIGN_FORM_CONFIGS } from "@/lib/simplesign/config";

describe("SimpleSign locked field keys", () => {
  it("uses the fixed Hebrew hint that names the template env var", () => {
    expect(
      simplesignLockedKeysHint("waiver-confidentiality", "SIMPLESIGN_DOC_WAIVER_BASIC")
    ).toBe(
      "המפתחות הנעולים של waiver-confidentiality השתנו. עדכנו את אותם שמות שדות בתבנית SimpleSign (SIMPLESIGN_DOC_WAIVER_BASIC), ואז עדכנו את simplesign.lockedKeys ב-src/content/forms/waiver-confidentiality.json."
    );
  });

  it("requires lockedKeys on every SimpleSign form, including parent signatures", () => {
    expect(listSimpleSignLockErrors()).toEqual([]);
    for (const config of SIMPLESIGN_FORM_CONFIGS) {
      const locked = getFormLockedKeys(config.formId);
      expect(locked?.length).toBeGreaterThan(0);
      const schema = getFormSchema(config.formId);
      expect(schema).toBeDefined();
      const keys = new Set(listFormFields(schema!).map((field) => field.key));
      for (const signer of config.parentSigners) {
        expect(locked).toContain(signer.signatureFieldKey);
        expect(keys.has(signer.signatureFieldKey)).toBe(true);
      }
    }
  });

  it("does not attach a simplesign lock to forms outside the mapping", () => {
    expect(getFormLockedKeys("student-info")).toBeNull();
    expect(getFormLockedKeys("schedule")).toBeNull();
    expect(getFormLockedKeys("moe-inclusion-plan")).toBeNull();
    expect(getFormLockedKeys("moe-eligibility-renewal")).toBeNull();
  });
});
