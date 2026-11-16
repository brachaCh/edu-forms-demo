import { describe, expect, it } from "vitest";
import { buildFormSnapshotHtml } from "@/lib/form-snapshot";
import { getFormSchema } from "@/lib/form-schemas";
import { prepareFormSnapshotHtmlForWordExport } from "@/lib/form-export-logos";
import {
  INTEGRATIVE_COL_OTHER_KEY,
  INTEGRATIVE_COL_TEACHER_KEY,
} from "@/lib/integrative-tachi-defs";
import { optimizeTachiSnapshotHtmlForWord } from "@/lib/tachi-word-export";

describe("tachi word export layout", () => {
  it("word layout css uses direct page-sheet children and preserves data-grid table display", () => {
    const html = optimizeTachiSnapshotHtmlForWord(
      "<html><head></head><body></body></html>"
    );
    expect(html).not.toMatch(/table\.page-sheet (thead|tbody|tfoot|tr|td)/);
    expect(html).toMatch(/\.page-sheet > tbody > tr > td/);
    expect(html).toMatch(/\.data-grid\s*\{[\s\S]*display:\s*table/);
    expect(html).toMatch(/\.data-grid tr\s*\{[\s\S]*display:\s*table-row/);
    expect(html).toMatch(
      /\.data-grid td\s*\{[\s\S]*display:\s*table-cell[\s\S]*border:\s*1pt solid/
    );
  });
  it("integrative goals table keeps custom אחר headers in Word html", () => {
    const schema = getFormSchema("tachi-integrative")!;
    const raw = buildFormSnapshotHtml(
      schema,
      {
        [INTEGRATIVE_COL_TEACHER_KEY]: "מחנך",
        [INTEGRATIVE_COL_OTHER_KEY]: "קבוצה קטנה",
      },
      "תלמיד"
    );
    const html = prepareFormSnapshotHtmlForWordExport(raw, {}, {
      formId: "tachi-integrative",
    });
    expect(html).toContain("מחנך");
    expect(html).toContain("קבוצה קטנה");
    expect(html).toContain("integrative-goals");
    expect(html).not.toMatch(/<img[^>]*\blogo-/);
  });
});