import { describe, expect, it } from "vitest";
import { SHARED_PRINT_LAYOUT_CSS } from "@/lib/print-layout-css";
import { getFormSchema } from "@/lib/form-schemas";
import { tableCellKey } from "@/lib/form-table-grids";
import { buildFormSnapshotHtml } from "@/lib/form-snapshot";

function cssRules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!.trim(),
    body: match[2]!.trim(),
  }));
}

describe("shared print layout CSS (TZ-81 / TZ-83)", () => {
  it("fits data-grid / homeroom-grid to the page and wraps value-cell text", () => {
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(/overflow-x:\s*visible\s*!important/);
    const rules = cssRules(SHARED_PRINT_LAYOUT_CSS);

    const fixedRules = rules.filter((rule) =>
      /table-layout:\s*fixed\s*!important/.test(rule.body)
    );
    expect(fixedRules.length).toBeGreaterThan(0);
    for (const rule of fixedRules) {
      expect(rule.selector).toMatch(
        /\.data-grid|\.homeroom-grid|\.print-doc-schedule/
      );
      expect(rule.selector).not.toMatch(/\.doc-body\s+table/);
      expect(rule.selector).not.toMatch(/table:not\(/);
    }

    const preWrapRules = rules.filter((rule) =>
      /white-space:\s*pre-wrap/.test(rule.body)
    );
    expect(preWrapRules.length).toBeGreaterThan(0);
    for (const rule of preWrapRules) {
      expect(rule.selector).toMatch(/\.data-grid td|\.homeroom-grid td/);
      expect(rule.selector).not.toMatch(/\bth\b/);
      expect(rule.selector).not.toMatch(/table\s+td/);
      expect(rule.selector).not.toMatch(/\.doc-body\s+table/);
    }

    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(/overflow-wrap:\s*anywhere/);
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(/word-break:\s*break-word/);
  });

  it("does not retarget original-look tables with fixed layout or pre-wrap", () => {
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(
      /\.doc-body\s+table:not\(\.schedule-grid\)/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(/print-original-look/);
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(/\.rq-grid/);
  });

  it("restores main's splittable print tables so label:value blocks do not jump", () => {
    expect(SHARED_PRINT_LAYOUT_CSS).toContain(
      "טבלאות ארוכות — אפשרות פיצול בין עמודים במקום חיתוך"
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /table,\s*\n\s*\.homeroom-grid,\s*\n\s*\.holistic-grid,\s*\n\s*\.cluster-card,\s*\n\s*\.schedule-grid,\s*\n\s*\.data-grid\s*\{[\s\S]*page-break-inside:\s*auto/
    );
  });

  it("keeps printed boxes/cards/rows together without forcing empty pages", () => {
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.holistic-cell[\s\S]*break-inside:\s*avoid/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.cluster-card[\s\S]*page-break-inside:\s*avoid/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.data-grid tr[\s\S]*break-inside:\s*avoid/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(/\n\s*tr\s*\{/);
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.data-grid[\s\S]*break-inside:\s*auto/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.holistic-grid[\s\S]*page-break-inside:\s*auto/
    );
  });

  it("is included in form snapshots (tachi-prep boxes and accommodations table)", () => {
    const tachi = getFormSchema("tachi-prep");
    expect(tachi).toBeTruthy();
    const tachiHtml = buildFormSnapshotHtml(
      tachi!,
      {
        full_name: "יוכבד דה לאון",
        strengths: "קריאה שוטפת",
        areas_to_strengthen: "מוקדים לחיזוק — חשבון",
      },
      "יוכבד דה לאון"
    );
    expect(tachiHtml).toContain(".holistic-cell");
    expect(tachiHtml).toContain("break-inside: avoid");
    expect(tachiHtml).toContain(
      "טבלאות ארוכות — אפשרות פיצול בין עמודים במקום חיתוך"
    );
    expect(tachiHtml).toContain("מוקדים לחיזוק");
    expect(tachiHtml).toMatch(/@media screen\s*\{[\s\S]*overflow-x:\s*hidden/);
    const htmlBodyRule = tachiHtml.match(/html,\s*body\s*\{[^}]+\}/)?.[0] ?? "";
    expect(htmlBodyRule).not.toContain("overflow-x: hidden");

    const accommodations = getFormSchema("accommodations");
    expect(accommodations).toBeTruthy();
    const html = buildFormSnapshotHtml(
      accommodations!,
      {
        full_name: "יוכבד",
        [tableCellKey("accommodations", 0, "domain")]: "קשיים במתמטיקה",
        [tableCellKey("accommodations", 0, "classroom")]:
          "הוראת אסטרטגיות · שימוש במחשבון · הפחתת כמות התרגילים",
        [tableCellKey("accommodations", 0, "exams")]:
          "הארכת זמן 25% · מבחן מותאם",
        [tableCellKey("accommodations", 0, "subject")]: "חשבון",
        [tableCellKey("accommodations", 0, "responsible")]: "המורה מורה דמו",
      },
      "יוכבד"
    );
    expect(html).toContain('class="data-grid"');
    expect(html).not.toContain('class="data-grid data-grid-date-summary"');
    expect(html).toContain("data-grid-col-wide");
    expect(html).toContain("קשיים במתמטיקה");
    expect(html).toContain("המורה מורה דמו");
    expect(html).toContain("max-width: 100% !important");
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toMatch(/\.data-grid td[\s\S]*white-space:\s*pre-wrap/);
  });

  it("keeps Ministry original-look tables off the shared fixed/pre-wrap rules", () => {
    const schema = getFormSchema("referral-questionnaire");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        first_name: "אורי",
        last_name: "לוי",
        student_description: "שורה ראשונה\nשורה שנייה",
      },
      "אורי לוי"
    );
    expect(html).toContain('body class="print-original-look"');
    expect(html).toContain('class="rq-grid');
    expect(html).toContain(SHARED_PRINT_LAYOUT_CSS);
    expect(html).not.toMatch(
      /\.doc-body\s+table:not\(\.schedule-grid\):not\(\.page-sheet\)[\s\S]*table-layout:\s*fixed\s*!important/
    );
  });

  it("keeps תל\"א generic field tables off the shared fixed layout", () => {
    const schema = getFormSchema("tla");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "יעל כהן",
        class_name: "ג1",
        current_status: "מצב נוכחי\nשורה שנייה",
      },
      "יעל כהן"
    );
    expect(html).not.toContain("print-original-look");
    expect(html).toContain("<table>");
    expect(html).toContain("מצב נוכחי");
    expect(html).not.toMatch(
      /\.doc-body\s+table:not\(\.schedule-grid\)[\s\S]*table-layout:\s*fixed\s*!important/
    );
  });

  it("overrides the 22% wide-column rule for two-column date+summary grids (TZ-86)", () => {
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.data-grid \.data-grid-col-wide\s*\{[\s\S]*width:\s*22%/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.data-grid\.data-grid-date-summary \.data-grid-col-date\s*\{[\s\S]*width:\s*16%\s*!important/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.data-grid\.data-grid-date-summary \.data-grid-col-wide\s*\{[\s\S]*width:\s*84%\s*!important/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /tr\.data-grid-row-empty td[\s\S]*height:\s*11mm/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(/\.rq-grid/);
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(/#084e76/);
  });

  it("gives ישיבות צוות a narrow date column and two readable text columns (TZ-90)", () => {
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.data-grid\.data-grid-date-notes \.data-grid-col-date\s*\{[\s\S]*width:\s*16%\s*!important/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.data-grid\.data-grid-date-notes \.data-grid-col-participants\s*\{[\s\S]*width:\s*30%\s*!important/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.data-grid\.data-grid-date-notes \.data-grid-col-summary\s*\{[\s\S]*width:\s*54%\s*!important/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(
      /\.data-grid\.data-grid-date-notes td:nth-child/
    );
  });

  it("scopes TZ-103 h1/h2 polish to the schedule wrapper only", () => {
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.print-doc-schedule \.print-doc-body h1/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).toMatch(
      /\.print-doc-schedule \.print-doc-body h2/
    );
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(
      /^\s*\.print-doc-body h1/m
    );
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(
      /^\s*\.print-doc-form \.print-doc-body h1/m
    );
    expect(SHARED_PRINT_LAYOUT_CSS).not.toMatch(
      /^\s*\.print-doc-body h2/m
    );
  });
});
