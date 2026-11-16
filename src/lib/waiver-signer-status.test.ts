import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mock-store", () => ({
  getStudentFormFill: vi.fn(),
  getStudentDocuments: vi.fn(() => []),
  getStudents: vi.fn(() => []),
  loadStudentFormFill: vi.fn(async () => null),
}));

vi.mock("@/lib/folder-actions", () => ({
  getDocumentRole: vi.fn(() => "upload"),
  getDocumentSlot: vi.fn(() => null),
}));

vi.mock("@/lib/free-access", () => ({
  isFreeAccessMode: vi.fn(() => false),
}));

import { getStudentFormFill, getStudents } from "@/lib/mock-store";
import type { Student } from "@/lib/supabase/types";
import {
  expiredWaiverSignerKeys,
  FATHER_SIGNATURE_KEY,
  MOTHER_SIGNATURE_KEY,
  WAIVER_SAME_EMAIL_WARNING,
  formatWaiverSignerStatusMessage,
  getWaiverSignerProgress,
  missingWaiverSignerKeys,
  resendableWaiverSignerKeys,
  sameParentSignerInboxWarning,
  shouldShowPersonalBasketWaiverUploadNote,
  waiverSignerResendLabel,
} from "@/lib/waiver-signer-status";

const mockedGetFill = vi.mocked(getStudentFormFill);
const mockedGetStudents = vi.mocked(getStudents);

function fillWith(data: Record<string, string>, id = "fill-1") {
  return {
    id,
    student_id: "s1",
    form_id: "waiver-confidentiality",
    data,
    status: "draft" as const,
    document_id: null,
    created_at: "",
    updated_at: "",
  };
}

describe("TZ-93: waiver signer status", () => {
  beforeEach(() => {
    mockedGetFill.mockReset();
    mockedGetStudents.mockReset();
    mockedGetStudents.mockReturnValue([]);
    mockedGetFill.mockReturnValue(null);
  });

  it("reports father-only progress without treating the waiver as complete", () => {
    mockedGetFill.mockReturnValue(fillWith({ father_signature: "חתימת אב" }));
    const progress = getWaiverSignerProgress("s1");
    expect(progress).toEqual({
      fatherSigned: true,
      motherSigned: false,
      formFillId: "fill-1",
      singleResponsibleParty: false,
    });
    expect(formatWaiverSignerStatusMessage(progress)).toBe(
      "נחתם על ידי האב, ממתין לחתימת האם"
    );
    expect(missingWaiverSignerKeys(progress)).toEqual([MOTHER_SIGNATURE_KEY]);
  });

  it("reports mother-only progress", () => {
    mockedGetFill.mockReturnValue(fillWith({ mother_signature: "simplesign:signed:t|tok" }));
    const progress = getWaiverSignerProgress("s1");
    expect(formatWaiverSignerStatusMessage(progress)).toBe(
      "נחתם על ידי האם, ממתין לחתימת האב"
    );
    expect(missingWaiverSignerKeys(progress)).toEqual([FATHER_SIGNATURE_KEY]);
  });

  it("reports neither signed, and a single-party waiting message", () => {
    expect(
      formatWaiverSignerStatusMessage({
        fatherSigned: false,
        motherSigned: false,
        singleResponsibleParty: false,
      })
    ).toBe("ממתין לחתימת האב והאם");
    expect(
      formatWaiverSignerStatusMessage({
        fatherSigned: false,
        motherSigned: false,
        singleResponsibleParty: true,
      })
    ).toBe("ממתין לחתימה");
  });

  it("does not list a leftover slot as missing for a single responsible party", () => {
    mockedGetStudents.mockReturnValue([
      { id: "s1", single_responsible_party: true } as Student,
    ]);
    mockedGetFill.mockReturnValue(fillWith({ father_signature: "חתימת אב" }));
    const progress = getWaiverSignerProgress("s1");
    expect(progress.singleResponsibleParty).toBe(true);
    expect(missingWaiverSignerKeys(progress)).toEqual([]);
  });

  it("offers resend only for the missing signer with a pending SimpleSign row", () => {
    const missing = missingWaiverSignerKeys({
      fatherSigned: true,
      motherSigned: false,
      singleResponsibleParty: false,
    });
    expect(
      resendableWaiverSignerKeys(missing, [
        { signatureFieldKey: FATHER_SIGNATURE_KEY, status: "signed" },
        { signatureFieldKey: MOTHER_SIGNATURE_KEY, status: "pending" },
      ])
    ).toEqual([MOTHER_SIGNATURE_KEY]);
    expect(
      resendableWaiverSignerKeys(missing, [
        { signatureFieldKey: MOTHER_SIGNATURE_KEY, status: "signed" },
      ])
    ).toEqual([]);
    expect(waiverSignerResendLabel(MOTHER_SIGNATURE_KEY)).toBe(
      "שליחת קישור חתימה לאם"
    );
    expect(waiverSignerResendLabel(FATHER_SIGNATURE_KEY)).toBe(
      "שליחת קישור חתימה לאב"
    );
  });

  it("TZ-153: offers resend for expired submissions with a different label", () => {
    const missing = missingWaiverSignerKeys({
      fatherSigned: false,
      motherSigned: false,
      singleResponsibleParty: false,
    });
    expect(
      resendableWaiverSignerKeys(missing, [
        { signatureFieldKey: FATHER_SIGNATURE_KEY, status: "expired" },
        { signatureFieldKey: MOTHER_SIGNATURE_KEY, status: "pending" },
      ])
    ).toEqual([FATHER_SIGNATURE_KEY, MOTHER_SIGNATURE_KEY]);
    expect(
      expiredWaiverSignerKeys(missing, [
        { signatureFieldKey: FATHER_SIGNATURE_KEY, status: "expired" },
        { signatureFieldKey: MOTHER_SIGNATURE_KEY, status: "pending" },
      ])
    ).toEqual([FATHER_SIGNATURE_KEY]);
    expect(waiverSignerResendLabel(FATHER_SIGNATURE_KEY, true)).toBe(
      "הקישור פג – שליחת קישור חדש לאב"
    );
    expect(waiverSignerResendLabel(MOTHER_SIGNATURE_KEY, true)).toBe(
      "הקישור פג – שליחת קישור חדש לאם"
    );
  });

  it("TZ-153: includes renewing submissions in resendable and expired lists", () => {
    const missing = missingWaiverSignerKeys({
      fatherSigned: false,
      motherSigned: false,
      singleResponsibleParty: false,
    });
    expect(
      resendableWaiverSignerKeys(missing, [
        { signatureFieldKey: FATHER_SIGNATURE_KEY, status: "renewing" },
        { signatureFieldKey: MOTHER_SIGNATURE_KEY, status: "pending" },
      ])
    ).toEqual([FATHER_SIGNATURE_KEY, MOTHER_SIGNATURE_KEY]);
    expect(
      expiredWaiverSignerKeys(missing, [
        { signatureFieldKey: FATHER_SIGNATURE_KEY, status: "renewing" },
        { signatureFieldKey: MOTHER_SIGNATURE_KEY, status: "expired" },
      ])
    ).toEqual([FATHER_SIGNATURE_KEY, MOTHER_SIGNATURE_KEY]);
  });

  it("warns when father and mother signing emails are the same inbox", () => {
    expect(
      sameParentSignerInboxWarning([
        { fieldKey: FATHER_SIGNATURE_KEY, email: " Parent@School.com " },
        { fieldKey: MOTHER_SIGNATURE_KEY, email: "parent@school.com" },
      ])
    ).toBe(WAIVER_SAME_EMAIL_WARNING);
    expect(
      sameParentSignerInboxWarning([
        { fieldKey: FATHER_SIGNATURE_KEY, email: "dad@school.com" },
        { fieldKey: MOTHER_SIGNATURE_KEY, email: "mom@school.com" },
      ])
    ).toBeNull();
    expect(
      sameParentSignerInboxWarning([
        { fieldKey: FATHER_SIGNATURE_KEY, email: "same@school.com" },
      ])
    ).toBeNull();
  });

  it("warns when parent1_sign and parent2_sign share the same inbox", () => {
    expect(
      sameParentSignerInboxWarning([
        { fieldKey: "parent1_sign", email: "shared@family.com" },
        { fieldKey: "parent2_sign", email: "shared@family.com" },
      ])
    ).toBe(WAIVER_SAME_EMAIL_WARNING);
    expect(
      sameParentSignerInboxWarning([
        { fieldKey: "parent1_sign", email: "a@family.com" },
        { fieldKey: "parent2_sign", email: "b@family.com" },
      ])
    ).toBeNull();
  });

  it("shows the upload note only on the personal-basket waiver folder", () => {
    expect(
      shouldShowPersonalBasketWaiverUploadNote({
        folderName: "טופס ויתור סודיות",
        studentStatus: "personal-basket",
      })
    ).toBe(true);
    expect(
      shouldShowPersonalBasketWaiverUploadNote({
        folderName: "ויתור סודיות",
        studentStatus: "personal-basket",
      })
    ).toBe(true);
    expect(
      shouldShowPersonalBasketWaiverUploadNote({
        folderName: "טופס ויתור סודיות",
        studentStatus: "integration",
      })
    ).toBe(false);
    expect(
      shouldShowPersonalBasketWaiverUploadNote({
        folderName: "מידע על התלמיד",
        studentStatus: "personal-basket",
      })
    ).toBe(false);
  });
});
