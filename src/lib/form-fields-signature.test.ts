import { describe, expect, it } from "vitest";
import {
  companionIdFieldForSignature,
  isParentSignatureField,
  isSignaturePadField,
  isThirdPartySignatureField,
  preserveParentSignatures,
  resolveParentSignatureRequestLabel,
  resolveSignatureRequestLabel,
} from "@/lib/form-fields";

describe("isParentSignatureField", () => {
  it("marks parent, father and mother signature keys", () => {
    expect(isParentSignatureField("father_signature")).toBe(true);
    expect(isParentSignatureField("mother_signature")).toBe(true);
    expect(isParentSignatureField("parents_signature")).toBe(true);
    expect(isParentSignatureField("parent_signature")).toBe(true);
    expect(isParentSignatureField("parent_sign")).toBe(true);
    expect(isParentSignatureField("parent1_sign")).toBe(true);
    expect(isParentSignatureField("parent2_sign")).toBe(true);
    expect(isParentSignatureField("parent1_signature")).toBe(true);
    expect(isParentSignatureField("parent2_signature")).toBe(true);
  });

  it("does not mark staff or student signatures", () => {
    expect(isParentSignatureField("homeroom_signature")).toBe(false);
    expect(isParentSignatureField("principal_signature")).toBe(false);
    expect(isParentSignatureField("teacher_sign")).toBe(false);
    expect(isParentSignatureField("signer_signature")).toBe(false);
    expect(isParentSignatureField("student_signature")).toBe(false);
    expect(isParentSignatureField("report_author")).toBe(false);
  });
});

describe("isThirdPartySignatureField", () => {
  it("locks parent, principal and supervisor signatures (send-for-signature only)", () => {
    expect(isThirdPartySignatureField("parents_signature")).toBe(true);
    expect(isThirdPartySignatureField("parent_sign")).toBe(true);
    expect(isThirdPartySignatureField("father_signature")).toBe(true);
    expect(isThirdPartySignatureField("principal_sign")).toBe(true);
    expect(isThirdPartySignatureField("principal_signature")).toBe(true);
    expect(isThirdPartySignatureField("supervisor_sign")).toBe(true);
    expect(isThirdPartySignatureField("supervisor_signature")).toBe(true);
    expect(isThirdPartySignatureField("inspector_sign")).toBe(true);
  });

  it("keeps the filler's own (staff) signatures drawable", () => {
    expect(isThirdPartySignatureField("homeroom_signature")).toBe(false);
    expect(isThirdPartySignatureField("teacher_sign")).toBe(false);
    expect(isThirdPartySignatureField("integration_teacher_signature")).toBe(false);
    expect(isThirdPartySignatureField("support_teacher_signature")).toBe(false);
    expect(isThirdPartySignatureField("psychologist_sign")).toBe(false);
    expect(isThirdPartySignatureField("signer_signature")).toBe(false);
    expect(isThirdPartySignatureField("student_signature")).toBe(false);
    expect(isThirdPartySignatureField("principal_name")).toBe(false);
  });
});

describe("isSignaturePadField", () => {
  it("locks every signature pad including staff", () => {
    expect(isSignaturePadField("parents_signature")).toBe(true);
    expect(isSignaturePadField("homeroom_signature")).toBe(true);
    expect(isSignaturePadField("integration_teacher_signature")).toBe(true);
    expect(isSignaturePadField("teacher_sign")).toBe(true);
    expect(isSignaturePadField("principal_name")).toBe(false);
  });
});

describe("resolveSignatureRequestLabel", () => {
  it("distinguishes parent 1 and parent 2 even when both fields are labeled חתימה", () => {
    expect(
      resolveParentSignatureRequestLabel({
        key: "parent1_signature",
        label: "חתימה",
      })
    ).toBe("הורה / אפוטרופוס 1");
    expect(
      resolveParentSignatureRequestLabel({
        key: "parent2_signature",
        label: "חתימה",
      })
    ).toBe("הורה / אפוטרופוס 2");
  });

  it("maps father/mother signature keys to parent 1/2", () => {
    expect(
      resolveParentSignatureRequestLabel({
        key: "father_signature",
        label: "חתימת האב",
      })
    ).toBe("חתימת האב");
    expect(
      resolveParentSignatureRequestLabel({
        key: "mother_signature",
        label: "חתימת האם",
      })
    ).toBe("חתימת האם");
  });

  it("falls back to parent 1/2 when the field label is generic חתימה", () => {
    expect(
      resolveSignatureRequestLabel({
        key: "father_signature",
        label: "חתימה",
      })
    ).toBe("הורה / אפוטרופוס 1");
    expect(
      resolveSignatureRequestLabel({
        key: "mother_signature",
        label: "חתימה",
      })
    ).toBe("הורה / אפוטרופוס 2");
  });

  it("keeps staff and other signature labels for email send selection", () => {
    expect(
      resolveSignatureRequestLabel({
        key: "homeroom_signature",
        label: "חתימת המחנכת",
      })
    ).toBe("חתימת המחנכת");
    expect(
      resolveSignatureRequestLabel({
        key: "principal_signature",
        label: "חתימת מנהל/ת ביה״ס",
      })
    ).toBe("חתימת מנהל/ת ביה״ס");
    expect(
      resolveSignatureRequestLabel(
        { key: "psychologist_sign", label: "חתימה" },
        "חתימות"
      )
    ).toBe("חתימות");
  });
});

describe("companionIdFieldForSignature", () => {
  it("maps father/mother signatures to ID fields", () => {
    expect(companionIdFieldForSignature("father_signature")).toEqual({
      key: "father_id",
      label: "ת.ז האב",
    });
    expect(companionIdFieldForSignature("mother_signature")).toEqual({
      key: "mother_id",
      label: "ת.ז האם",
    });
    expect(companionIdFieldForSignature("homeroom_signature")).toBeNull();
  });
});

describe("preserveParentSignatures", () => {
  it("keeps a parent signature that already returned from the server", () => {
    expect(
      preserveParentSignatures(
        { father_signature: "", notes: "חדש" },
        { father_signature: "data:image/png;base64,ABC", notes: "ישן" }
      )
    ).toEqual({
      father_signature: "data:image/png;base64,ABC",
      notes: "חדש",
    });
  });

  it("does not copy staff signatures from the stored fill", () => {
    expect(
      preserveParentSignatures(
        { homeroom_signature: "" },
        { homeroom_signature: "data:image/png;base64,STAFF" }
      )
    ).toEqual({ homeroom_signature: "" });
  });

  it("keeps parent ID numbers returned from signature link", () => {
    expect(
      preserveParentSignatures(
        { father_id: "", mother_id: "222222222" },
        { father_id: "111111111", mother_id: "333333333" }
      )
    ).toEqual({
      father_id: "111111111",
      mother_id: "222222222",
    });
  });
});
