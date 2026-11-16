import { describe, expect, it, vi, beforeEach } from "vitest";

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

vi.mock("@/lib/data-cache", () => ({
  ensureStudentDocuments: vi.fn(async () => undefined),
}));

import { ensureStudentDocuments } from "@/lib/data-cache";

import {
  getStudentFormFill,
  getStudentDocuments,
  getStudents,
  loadStudentFormFill,
} from "@/lib/mock-store";
import { getDocumentRole, getDocumentSlot } from "@/lib/folder-actions";
import { isFreeAccessMode } from "@/lib/free-access";
import {
  canAccessPortfolioForm,
  countWaiverSignatures,
  hasAllRequiredWaiverSignatures,
  isConfidentialityWaiverCompleted,
  isConfidentialityWaiverExempt,
  isNonConfidentialStaffDetailsTarget,
  loadCanAccessPortfolioForm,
  loadConfidentialityWaiverCompleted,
  canAccessPortfolioDocuments,
  officialStaffDetailsFormIdForAccess,
  requiredWaiverSignatureCount,
} from "@/lib/confidentiality-waiver-gate";
import type { Student, StudentStatus } from "@/lib/supabase/types";

const mockedGetFill = vi.mocked(getStudentFormFill);
const mockedGetDocs = vi.mocked(getStudentDocuments);
const mockedGetStudents = vi.mocked(getStudents);
const mockedGetRole = vi.mocked(getDocumentRole);
const mockedGetSlot = vi.mocked(getDocumentSlot);
const mockedLoadFill = vi.mocked(loadStudentFormFill);
const mockedFreeAccess = vi.mocked(isFreeAccessMode);
const mockedEnsureDocs = vi.mocked(ensureStudentDocuments);

function studentWithStatus(status: StudentStatus, extras: Partial<Student> = {}): Student {
  return {
    id: "s1",
    status,
    full_name: "תלמיד בדיקה",
    notes: null,
    ...extras,
  } as Student;
}

describe("confidentiality waiver gate", () => {
  beforeEach(() => {
    mockedGetFill.mockReset();
    mockedGetDocs.mockReset();
    mockedGetStudents.mockReset();
    mockedGetRole.mockReset();
    mockedGetSlot.mockReset();
    mockedLoadFill.mockReset();
    mockedFreeAccess.mockReset();
    mockedEnsureDocs.mockReset();
    mockedFreeAccess.mockReturnValue(false);
    mockedGetDocs.mockReturnValue([]);
    mockedGetStudents.mockReturnValue([]);
    mockedGetRole.mockReturnValue("upload");
    mockedGetSlot.mockReturnValue(null);
    mockedLoadFill.mockResolvedValue(null);
    mockedEnsureDocs.mockResolvedValue(undefined);
  });

  it("allows browsing without waiver signatures in free access mode", () => {
    mockedFreeAccess.mockReturnValue(true);
    mockedGetFill.mockReturnValue(null);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(true);
  });

  it("allows the main waiver form without a completed fill", () => {
    mockedGetFill.mockReturnValue(null);
    expect(
      isConfidentialityWaiverExempt({ targetLabel: "ויתור סודיות" })
    ).toBe(true);
    expect(
      isConfidentialityWaiverExempt({ targetLabel: "טופס ויתור סודיות" })
    ).toBe(true);
    expect(
      isConfidentialityWaiverExempt({
        targetLabel: "טופס ויתור סודיות חתום",
      })
    ).toBe(true);
    expect(
      isConfidentialityWaiverExempt({ formId: "waiver-confidentiality" })
    ).toBe(true);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "טופס ויתור סודיות" })
    ).toBe(true);
  });

  it("does not treat ministry extra-document waivers as the required gate form", () => {
    mockedGetFill.mockReturnValue(null);
    expect(
      isConfidentialityWaiverExempt({
        targetLabel: "ויתור סודיות לוועדת אפיון וזכאות",
      })
    ).toBe(false);
    expect(
      isConfidentialityWaiverExempt({
        formId: "waiver-eligibility-characterization",
      })
    ).toBe(false);
    expect(
      isConfidentialityWaiverExempt({
        formId: "waiver-multidisciplinary-team",
      })
    ).toBe(false);
    expect(
      isConfidentialityWaiverExempt({ formId: "waiver-appeal-committee" })
    ).toBe(false);
  });

  it("blocks other forms until the waiver is signed in special-ed class, personal basket, and integration", () => {
    mockedGetFill.mockReturnValue(null);
    for (const status of [
      "special-ed-class",
      "personal-basket",
      "integration",
    ] as const) {
      mockedGetStudents.mockReturnValue([studentWithStatus(status)]);
      expect(
        canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
      ).toBe(false);
    }
  });

  it("blocks other forms until the waiver is completed", () => {
    mockedGetFill.mockReturnValue(null);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(false);
    expect(
      canAccessPortfolioForm("s1", {
        targetLabel: "התאמות",
      })
    ).toBe(false);
  });

  it("TZ-73: official tile and folder page open the table without a waiver", () => {
    mockedGetFill.mockReturnValue(null);
    const tileFormId = officialStaffDetailsFormIdForAccess({
      targetLabel: "פרטי צוות תלמיד",
    });
    const folderFormId = officialStaffDetailsFormIdForAccess({
      targetLabel: "פרטי צוות תלמיד",
    });
    expect(tileFormId).toBe("student-team-details");
    expect(folderFormId).toBe("student-team-details");
    expect(
      canAccessPortfolioForm("s1", {
        targetLabel: "פרטי צוות תלמיד",
        formId: tileFormId,
      })
    ).toBe(true);
    expect(
      canAccessPortfolioForm("s1", {
        targetLabel: "פרטי צוות תלמיד",
        formId: folderFormId,
      })
    ).toBe(true);
    expect(
      officialStaffDetailsFormIdForAccess({
        targetLabel: "פרטי צוות תלמיד (תפקיד וטלפון)",
      })
    ).toBe("student-team-details");
    expect(
      isNonConfidentialStaffDetailsTarget({
        formId: "student-team-details",
      })
    ).toBe(true);
    expect(
      isNonConfidentialStaffDetailsTarget({
        targetLabel: "פרטי צוות תלמיד",
      })
    ).toBe(false);
  });

  it("TZ-73: uploaded documents in the staff-details folder stay behind the waiver", () => {
    mockedGetFill.mockReturnValue(null);
    const formId = officialStaffDetailsFormIdForAccess({
      targetLabel: "פרטי צוות תלמיד",
    });
    expect(formId).toBe("student-team-details");
    expect(
      canAccessPortfolioDocuments("s1", {
        targetLabel: "פרטי צוות תלמיד",
        formId,
      })
    ).toBe(false);
  });

  it("TZ-73: a custom or renamed form or folder with the same label stays locked", () => {
    mockedGetFill.mockReturnValue(null);
    expect(
      officialStaffDetailsFormIdForAccess({
        targetLabel: "פרטי צוות תלמיד",
        formId: "custom-staff-folder",
      })
    ).toBeUndefined();
    expect(
      canAccessPortfolioForm("s1", {
        targetLabel: "פרטי צוות תלמיד",
        formId: "custom-staff-folder",
      })
    ).toBe(false);
    expect(
      officialStaffDetailsFormIdForAccess({
        targetLabel: "פרטי צוות תלמיד — מותאם",
      })
    ).toBeUndefined();
    expect(
      canAccessPortfolioForm("s1", {
        targetLabel: "פרטי צוות תלמיד — מותאם",
      })
    ).toBe(false);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(false);
  });

  it("does not unlock other forms when only a ministry extra-document waiver is completed", () => {
    mockedGetFill.mockImplementation((_studentId, formId) => {
      if (formId === "waiver-multidisciplinary-team") {
        return {
          id: "f2",
          student_id: "s1",
          form_id: "waiver-multidisciplinary-team",
          data: {},
          status: "completed",
          document_id: null,
          created_at: "",
          updated_at: "",
        };
      }
      return null;
    });
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(false);
  });

  it("blocks other forms when only one parent signed", () => {
    mockedGetFill.mockReturnValue({
      id: "f1",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: { father_signature: "חתימת אב" },
      status: "completed",
      document_id: null,
      created_at: "",
      updated_at: "",
    });
    expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(false);
    // TZ-162: מסמכים נוספים is now exempt from waiver requirement
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מסמכים נוספים" })
    ).toBe(true);
  });

  it("allows other forms only after both parent signatures exist", () => {
    mockedGetFill.mockReturnValue({
      id: "f1",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: {
        father_signature: "חתימת אב",
        mother_signature: "חתימת אם",
      },
      status: "draft",
      document_id: null,
      created_at: "",
      updated_at: "",
    });
    expect(isConfidentialityWaiverCompleted("s1")).toBe(true);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(true);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מסמכים נוספים" })
    ).toBe(true);
    expect(
      canAccessPortfolioForm("s1", {
        targetLabel: "ויתור סודיות לצוות רב מקצועי",
      })
    ).toBe(true);
  });

  // TZ-162: מסמכים נוספים is always accessible without waiver
  it("allows מסמכים נוספים without any waiver signatures", () => {
    mockedGetFill.mockReturnValue(null);
    expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מסמכים נוספים" })
    ).toBe(true);
  });

  // TZ-162 blocker 1: form not in extra-documents stays blocked even if label matches a button
  it("blocks referral-questionnaire-kindergarten even when targetLabel matches an extra-documents button", () => {
    mockedGetFill.mockReturnValue(null);
    expect(
      canAccessPortfolioForm("s1", {
        formId: "referral-questionnaire-kindergarten",
        targetLabel: "שאלון הפנייה לוועדת אפיון וזכאות",
      })
    ).toBe(false);
  });

  // TZ-162 blocker 2: label without formId still stays blocked when not inside extra-documents
  it("blocks label 'שאלון הפנייה לוועדת אפיון וזכאות' without formId when no signatures exist", () => {
    mockedGetFill.mockReturnValue(null);
    expect(
      canAccessPortfolioForm("s1", {
        targetLabel: "שאלון הפנייה לוועדת אפיון וזכאות",
      })
    ).toBe(false);
  });

  // TZ-162 blocker 2: numbered extra-documents slot (2) is allowed
  it("allows מסמכים נוספים (2) without waiver", () => {
    mockedGetFill.mockReturnValue(null);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מסמכים נוספים (2)" })
    ).toBe(true);
  });

  it("does not exempt via spoofed parentFolder query (מידע על התלמיד)", () => {
    mockedGetFill.mockReturnValue(null);
    expect(
      canAccessPortfolioForm("s1", {
        targetLabel: "מידע על התלמיד",
        parentFolder: "מסמכים נוספים",
      })
    ).toBe(false);
  });

  it("does not unlock when waiver is marked completed without both signatures", () => {
    mockedGetFill.mockReturnValue({
      id: "f1",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: {},
      status: "completed",
      document_id: null,
      created_at: "",
      updated_at: "",
    });
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(false);
  });

  it("does not unlock from a fill/archive document alone without both signatures", () => {
    mockedGetFill.mockReturnValue(null);
    mockedGetDocs.mockReturnValue([
      {
        id: "d1",
        student_id: "s1",
        name: "waiver.pdf",
        mime_type: "application/pdf",
        size: 10,
        data_url: "data:,",
        folder: "טופס ויתור סודיות",
        uploaded_at: "",
        archived_at: "2026-01-01",
      },
    ]);
    mockedGetRole.mockReturnValue("fill");
    expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(false);
  });

  it("TZ-99: unlocks personal-basket and integration after a paper waiver scan", () => {
    mockedGetFill.mockReturnValue(null);
    mockedGetDocs.mockReturnValue([
      {
        id: "paper-1",
        student_id: "s1",
        name: "signed-waiver.pdf",
        mime_type: "application/pdf",
        size: 20,
        data_url: "data:application/pdf,abc",
        folder: "ויתור סודיות",
        uploaded_at: "2026-01-01T00:00:00.000Z",
        archived_at: null,
        is_paper_waiver: true,
      },
    ]);
    for (const status of ["personal-basket", "integration"] as const) {
      mockedGetStudents.mockReturnValue([studentWithStatus(status)]);
      expect(isConfidentialityWaiverCompleted("s1")).toBe(true);
      expect(
        canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
      ).toBe(true);
      expect(
        canAccessPortfolioDocuments("s1", { targetLabel: "מסמכים נוספים" })
      ).toBe(true);
    }
  });

  it("TZ-99: a generic folder upload without the paper-waiver flag does not unlock personal-basket", () => {
    mockedGetFill.mockReturnValue(null);
    mockedGetStudents.mockReturnValue([studentWithStatus("personal-basket")]);
    mockedGetDocs.mockReturnValue([
      {
        id: "d-upload",
        student_id: "s1",
        name: "signed-waiver.pdf",
        mime_type: "application/pdf",
        size: 20,
        data_url: "data:application/pdf,abc",
        folder: "טופס ויתור סודיות",
        uploaded_at: "2026-01-01T00:00:00.000Z",
        archived_at: null,
        is_paper_waiver: false,
      },
    ]);
    mockedGetRole.mockReturnValue("upload");
    expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(false);
  });

  it("TZ-99: removing the scan re-locks only when digital signatures are also missing", () => {
    mockedGetStudents.mockReturnValue([studentWithStatus("integration")]);
    mockedGetDocs.mockReturnValue([]);
    mockedGetFill.mockReturnValue({
      id: "f1",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: {
        father_signature: "חתימת אב",
        mother_signature: "חתימת אם",
      },
      status: "draft",
      document_id: null,
      created_at: "",
      updated_at: "",
    });
    expect(isConfidentialityWaiverCompleted("s1")).toBe(true);

    mockedGetFill.mockReturnValue({
      id: "f1",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: { father_signature: "חתימת אב" },
      status: "draft",
      document_id: null,
      created_at: "",
      updated_at: "",
    });
    expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
  });

  it("TZ-99: a pending digital request plus a paper scan still satisfies the gate", () => {
    mockedGetFill.mockReturnValue({
      id: "f1",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: {},
      status: "saved",
      document_id: null,
      created_at: "",
      updated_at: "",
    });
    mockedGetStudents.mockReturnValue([studentWithStatus("personal-basket")]);
    mockedGetDocs.mockReturnValue([
      {
        id: "paper-pending",
        student_id: "s1",
        name: "paper-scan.jpg",
        mime_type: "image/jpeg",
        size: 12,
        data_url: "data:image/jpeg,abc",
        folder: "ויתור סודיות",
        uploaded_at: "2026-01-01T00:00:00.000Z",
        archived_at: null,
        is_paper_waiver: true,
      },
    ]);
    expect(hasAllRequiredWaiverSignatures("s1")).toBe(false);
    expect(isConfidentialityWaiverCompleted("s1")).toBe(true);
    expect(
      canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).toBe(true);
  });

  it("TZ-99: an archived paper scan does not unlock", () => {
    mockedGetFill.mockReturnValue(null);
    mockedGetStudents.mockReturnValue([studentWithStatus("integration")]);
    mockedGetDocs.mockReturnValue([
      {
        id: "paper-archived",
        student_id: "s1",
        name: "signed-waiver.pdf",
        mime_type: "application/pdf",
        size: 20,
        data_url: "data:application/pdf,abc",
        folder: "ויתור סודיות",
        uploaded_at: "2026-01-01T00:00:00.000Z",
        archived_at: "2026-01-02T00:00:00.000Z",
        is_paper_waiver: true,
      },
    ]);
    expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
  });

  it("allows other forms when a signed upload exists in special-ed waiver folder", () => {
    mockedGetFill.mockReturnValue(null);
    mockedGetStudents.mockReturnValue([
      studentWithStatus("special-ed-class"),
    ]);
    mockedGetDocs.mockReturnValue([
      {
        id: "d2",
        student_id: "s1",
        name: "signed-waiver.pdf",
        mime_type: "application/pdf",
        size: 20,
        data_url: "data:application/pdf,abc",
        folder: "טופס ויתור סודיות חתום",
        uploaded_at: "2026-01-01",
        archived_at: null,
      },
    ]);
    mockedGetRole.mockReturnValue("upload");
    expect(isConfidentialityWaiverCompleted("s1")).toBe(true);
  });

  it("does not unlock from a fill slot under general-info without both signatures", () => {
    mockedGetFill.mockReturnValue(null);
    mockedGetDocs.mockReturnValue([
      {
        id: "d3",
        student_id: "s1",
        name: "waiver-fill.pdf",
        mime_type: "application/pdf",
        size: 10,
        data_url: "data:,",
        folder: "אינפורמציה כללית",
        uploaded_at: "",
        archived_at: "2026-01-01",
      },
    ]);
    mockedGetSlot.mockReturnValue("טופס ויתור סודיות חתום");
    mockedGetRole.mockReturnValue("fill");
    expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
  });

  it("awaits form fill load before deciding access", async () => {
    mockedGetFill.mockReturnValue(null);
    mockedLoadFill.mockImplementation(async () => {
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: {
          father_signature: "חתימת אב",
          mother_signature: "חתימת אם",
        },
        status: "completed",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      return mockedGetFill("s1", "waiver-confidentiality");
    });
    await expect(
      loadCanAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
    ).resolves.toBe(true);
    expect(mockedLoadFill).toHaveBeenCalled();
  });

  it("TZ-99: returns true when documents fetch fails but digital signatures are complete", async () => {
    mockedGetFill.mockReturnValue(null);
    mockedEnsureDocs.mockRejectedValue(new Error("network error"));
    mockedLoadFill.mockImplementation(async () => {
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: {
          father_signature: "חתימת אב",
          mother_signature: "חתימת אם",
        },
        status: "completed",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      return mockedGetFill("s1", "waiver-confidentiality");
    });
    await expect(loadConfidentialityWaiverCompleted("s1")).resolves.toBe(true);
    expect(mockedEnsureDocs).toHaveBeenCalledWith("s1");
  });

  it("TZ-99: returns false when documents fetch fails and digital signatures are incomplete", async () => {
    mockedGetFill.mockReturnValue(null);
    mockedEnsureDocs.mockRejectedValue(new Error("network error"));
    mockedLoadFill.mockImplementation(async () => {
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: { father_signature: "חתימת אב" },
        status: "draft",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      return mockedGetFill("s1", "waiver-confidentiality");
    });
    await expect(loadConfidentialityWaiverCompleted("s1")).resolves.toBe(false);
  });

  describe("TZ-30: single responsible party", () => {
    it("requires only one signature when single_responsible_party is true", () => {
      mockedGetStudents.mockReturnValue([
        studentWithStatus("integration", { single_responsible_party: true }),
      ]);
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: { father_signature: "חתימת אב" },
        status: "draft",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      expect(isConfidentialityWaiverCompleted("s1")).toBe(true);
      expect(
        canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
      ).toBe(true);
    });

    it("requires two signatures when single_responsible_party is false", () => {
      mockedGetStudents.mockReturnValue([
        studentWithStatus("integration", { single_responsible_party: false }),
      ]);
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: { father_signature: "חתימת אב" },
        status: "draft",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
      expect(
        canAccessPortfolioForm("s1", { targetLabel: "מידע על התלמיד" })
      ).toBe(false);
    });

    it("requires two signatures when single_responsible_party is null (default)", () => {
      mockedGetStudents.mockReturnValue([
        studentWithStatus("integration", { single_responsible_party: null }),
      ]);
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: { father_signature: "חתימת אב" },
        status: "draft",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      expect(isConfidentialityWaiverCompleted("s1")).toBe(false);
    });

    it("allows access when single_responsible_party student has mother signature only", () => {
      mockedGetStudents.mockReturnValue([
        studentWithStatus("integration", { single_responsible_party: true }),
      ]);
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: { mother_signature: "חתימת אם" },
        status: "draft",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      expect(isConfidentialityWaiverCompleted("s1")).toBe(true);
    });

    it("marks the waiver signed after the single parent signs once via SimpleSign", () => {
      mockedGetStudents.mockReturnValue([
        studentWithStatus("integration", { single_responsible_party: true }),
      ]);
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: {
          mother_signature: "simplesign:signed:2026-01-02T00:00:00Z|tok-mom",
        },
        status: "draft",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      expect(hasAllRequiredWaiverSignatures("s1")).toBe(true);
      expect(isConfidentialityWaiverCompleted("s1")).toBe(true);
      expect(countWaiverSignatures("s1")).toBe(1);
      expect(requiredWaiverSignatureCount("s1")).toBe(1);
    });

    it("completes waiver with two signatures even for single_responsible_party", () => {
      mockedGetStudents.mockReturnValue([
        studentWithStatus("integration", { single_responsible_party: true }),
      ]);
      mockedGetFill.mockReturnValue({
        id: "f1",
        student_id: "s1",
        form_id: "waiver-confidentiality",
        data: {
          father_signature: "חתימת אב",
          mother_signature: "חתימת אם",
        },
        status: "draft",
        document_id: null,
        created_at: "",
        updated_at: "",
      });
      expect(isConfidentialityWaiverCompleted("s1")).toBe(true);
    });
  });
});
