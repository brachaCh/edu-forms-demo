import { describe, expect, it } from "vitest";
import type { StudentFormFill } from "@/lib/supabase/types";
import {
  FORM_FILL_SIGNED_DELETE_BLOCKED,
  formFillDeleteErrorMessage,
  formFillDeletionBlocked,
  formFillIsLegallySigned,
  isDeletablePortfolioFormId,
  isSignedArchiveDocumentName,
  portfolioFormFillListLabel,
  simpleSignBlocksFormFillDelete,
} from "./form-fill-delete";

function fill(
  partial: Partial<StudentFormFill> & Pick<StudentFormFill, "form_id" | "data">
): StudentFormFill {
  return {
    id: "fill-1",
    student_id: "student-1",
    status: "draft",
    document_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("form-fill-delete", () => {
  it("allows delete targets for תח״י variants and תל״א", () => {
    expect(isDeletablePortfolioFormId("tachi")).toBe(true);
    expect(isDeletablePortfolioFormId("tachi-integrative")).toBe(true);
    expect(isDeletablePortfolioFormId("tla")).toBe(true);
    expect(isDeletablePortfolioFormId("tla-integrative")).toBe(true);
    expect(isDeletablePortfolioFormId("waiver-confidentiality")).toBe(false);
  });

  it("blocks delete when SimpleSign stored a signed PDF for the fill", () => {
    expect(
      simpleSignBlocksFormFillDelete([
        { status: "pending", signed_pdf_document_id: null },
      ])
    ).toBe(false);
    expect(
      simpleSignBlocksFormFillDelete([
        { status: "signed", signed_pdf_document_id: null },
      ])
    ).toBe(true);
    expect(
      simpleSignBlocksFormFillDelete([
        { status: "pending", signedPdfDocumentId: "doc-1" },
      ])
    ).toBe(true);
    const draft = fill({ form_id: "tachi", data: { homeroom_signature: "" } });
    expect(
      formFillDeletionBlocked(draft, {
        simpleSignRows: [{ status: "signed", signed_pdf_document_id: "pdf-1" }],
      })
    ).toBe(true);
  });

  it("labels portfolio fills including אינטגרטיבי", () => {
    expect(
      portfolioFormFillListLabel("tachi-integrative", { ordinal: 2 })
    ).toBe("תח״י אינטגרטיבי 2");
    expect(portfolioFormFillListLabel("tla-integrative", { ordinal: 1 })).toBe(
      "תל״א אינטגרטיבי 1"
    );
  });

  it("detects signed archive filenames", () => {
    expect(isSignedArchiveDocumentName("תח״י — נועה — חתום.pdf")).toBe(true);
    expect(isSignedArchiveDocumentName("טיוטה.html")).toBe(false);
  });

  it("blocks legally signed תח״י when every signature field is filled", () => {
    const unsigned = fill({
      form_id: "tachi",
      data: { homeroom_signature: "" },
    });
    expect(formFillIsLegallySigned(unsigned)).toBe(false);

    const signed = fill({
      form_id: "tachi",
      data: {
        homeroom_signature: "data:image/png;base64,abc",
        integration_teacher_signature: "data:image/png;base64,abc",
        parents_signature: "data:image/png;base64,abc",
      },
    });
    expect(formFillIsLegallySigned(signed)).toBe(true);
  });

  it("returns Hebrew client messages", () => {
    expect(formFillDeleteErrorMessage(FORM_FILL_SIGNED_DELETE_BLOCKED)).toMatch(
      /חתום/
    );
  });
});
