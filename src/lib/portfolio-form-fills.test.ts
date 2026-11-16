import { describe, expect, it } from "vitest";
import {
  fillsForPortfolioCreateNew,
  formAllowsMultipleFills,
  formBelongsToPortfolioFolder,
  listPortfolioFolderFormFills,
  portfolioFormsAllowsAnotherFill,
  portfolioStructuredFillHref,
} from "./portfolio-form-fills";
import type { StudentFormFill } from "@/lib/supabase/types";
import type { FormSchema } from "./form-schemas";

function schema(partial: Partial<FormSchema> & Pick<FormSchema, "id" | "title" | "folder">): FormSchema {
  return {
    categoryFolder: "אינפורמציה כללית",
    sections: [],
    ...partial,
  };
}

describe("portfolio-form-fills", () => {
  it("detects multi-fill forms", () => {
    expect(formAllowsMultipleFills("tachi")).toBe(true);
    expect(formAllowsMultipleFills("tachi-integrative")).toBe(true);
    expect(formAllowsMultipleFills("tla")).toBe(false);
    expect(formAllowsMultipleFills("waiver-confidentiality")).toBe(false);
  });

  it("fillsForPortfolioCreateNew drops only the current form", () => {
    const fills = [
      {
        id: "1",
        student_id: "s1",
        form_id: "tla",
        data: {},
        status: "draft",
        document_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "2",
        student_id: "s1",
        form_id: "tla-prep",
        data: {},
        status: "draft",
        document_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ] satisfies StudentFormFill[];
    expect(fillsForPortfolioCreateNew("tla", fills, true)).toHaveLength(1);
    expect(fillsForPortfolioCreateNew("tla", fills, true)[0]?.form_id).toBe(
      "tla-prep"
    );
    expect(fillsForPortfolioCreateNew("tla", fills, false)).toEqual(fills);
  });

  it("forms page: tla keeps add-another / open-latest actions", () => {
    expect(portfolioFormsAllowsAnotherFill("tla")).toBe(true);
    expect(portfolioFormsAllowsAnotherFill("tachi")).toBe(true);
    expect(portfolioFormsAllowsAnotherFill("tachi-integrative")).toBe(true);
    expect(portfolioFormsAllowsAnotherFill("waiver-confidentiality")).toBe(
      false
    );
  });

  it("TZ-205: routes to forms page when a saved תח״י exists", () => {
    const schema = {
      id: "tachi",
      folder: 'תח"י (בקובץ נפרד)',
    };
    const href = portfolioStructuredFillHref({
      studentId: "s1",
      schema,
      parentFolder: 'תח"י',
      existingFills: [
        {
          id: "fill-1",
          student_id: "s1",
          form_id: "tachi",
          data: { domain: "שפה" },
          status: "draft",
          document_id: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    expect(href).toContain("/personal-area/students/forms/s1/");
    expect(href).not.toContain("/fill/");
  });

  it("matches forms by category folder or action label", () => {
    const waiver = schema({
      id: "waiver-confidentiality",
      title: "טופס ויתור סודיות",
      folder: "טופס ויתור סודיות",
      categoryFolder: "אינפורמציה כללית",
    });
    expect(
      formBelongsToPortfolioFolder(waiver, "אינפורמציה כללית", [])
    ).toBe(true);
    expect(
      formBelongsToPortfolioFolder(waiver, "טיפול", ["טופס ויתור סודיות"])
    ).toBe(true);
    expect(formBelongsToPortfolioFolder(waiver, "טיפול", [])).toBe(false);
  });

  it("lists latest single-fill forms in a portfolio folder", () => {
    const fills = listPortfolioFolderFormFills(
      "demo-student-1",
      "אינפורמציה כללית",
      "integration"
    );
    expect(Array.isArray(fills)).toBe(true);
  });
});
