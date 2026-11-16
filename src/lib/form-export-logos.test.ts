import { describe, expect, it } from "vitest";
import {
  applyInstitutionLogosToSnapshotHtml,
  prepareFormSnapshotHtmlForWordExport,
  stripSnapshotInstitutionHeaderLogos,
} from "./form-export-logos";
import { buildFormSnapshotHtml } from "./form-snapshot";
import { getFormSchema } from "./form-schemas";
import { protocolLogoPublicUrl } from "./document-branding";

describe("form-export-logos (TZ-208)", () => {
  it("strips baked institution logos from archived snapshot HTML", () => {
    const html = `<html><body>
      <header class="doc-header-fixed">
        <img class="logo-school" src="data:image/png;base64,FIXED" alt="לוגו בית הספר" />
      </header>
      <p>תוכן</p>
    </body></html>`;
    const next = stripSnapshotInstitutionHeaderLogos(html);
    expect(next).not.toContain("data:image/png;base64,FIXED");
    expect(next).not.toContain("doc-header-fixed");
    expect(next).toContain("תוכן");
  });

  it("strips nested moe-official-side institution logos", () => {
    const html = `<header class="moe-official-header">
      <div class="moe-official-brand">משרד</div>
      <div class="moe-official-side">
        <div class="wrap"><div class="inner"><img class="logo-school" src="OLD" alt="" /></div></div>
      </div>
    </header>`;
    const next = stripSnapshotInstitutionHeaderLogos(html);
    expect(next).not.toContain("logo-school");
    expect(next).not.toContain("OLD");
    expect(next).not.toContain("moe-official-side");
  });

  it("prepareFormSnapshotHtmlForWordExport drops fixed logo when none saved", () => {
    const html = `<header class="doc-header">
      <img class="logo-association" src="data:image/png;base64,OLD_ASSOC" alt="לוגו עמותה" />
    </header><footer class="doc-footer"><img class="logo-protocol" src="/brand/protocol-logo.png" alt="" /></footer><p>תח״י</p>`;
    const next = prepareFormSnapshotHtmlForWordExport(html, {});
    expect(next).not.toContain("OLD_ASSOC");
    expect(next).not.toMatch(/<img[^>]*\blogo-(?:school|association|protocol)\b/);
    expect(next).not.toContain("/brand/protocol-logo");
  });

  it("re-applies only the institution logos provided for export", () => {
    const html = `<header class="doc-header">
      <img class="logo-school" src="data:image/png;base64,OLD" alt="לוגו בית הספר" />
    </header><footer class="doc-footer"><img class="logo-protocol" src="/brand/protocol-logo.png" /></footer>`;
    const next = applyInstitutionLogosToSnapshotHtml(html, {
      schoolLogoUrl: "data:image/png;base64,SAVED",
    });
    expect(next).not.toContain("OLD");
    expect(next).not.toMatch(/<img[^>]*\blogo-protocol\b/);
    expect(next).toContain("data:image/png;base64,SAVED");
    expect(next).toContain("doc-header-fixed");
  });

  it("fresh תח״י snapshot has no institution logo without saved logos", () => {
    const schema = getFormSchema("tachi");
    expect(schema).toBeTruthy();
    const html = buildFormSnapshotHtml(schema!, { student_name: "דנה" }, "דנה");
    expect(html).not.toMatch(
      /<img[^>]*class="[^"]*logo-(?:school|association)\b[^"]*"[^>]*src="/i
    );
  });

  it("prepareFormSnapshotHtmlForWordExport removes protocol logo from fresh snapshot", () => {
    const schema = getFormSchema("tachi");
    expect(schema).toBeTruthy();
    const raw = buildFormSnapshotHtml(
      schema!,
      { student_name: "דנה" },
      "דנה",
      { protocolLogoUrl: protocolLogoPublicUrl("https://app.example") }
    );
    expect(raw).toMatch(/<img[^>]*\blogo-protocol\b/);
    const next = prepareFormSnapshotHtmlForWordExport(raw, {}, {
      formId: "tachi",
    });
    expect(next).not.toMatch(/<img[^>]*\blogo-protocol\b/);
    expect(next).not.toContain("/brand/protocol-logo");
  });

  it("תח״י Word export ignores institution logos even when provided", () => {
    const schema = getFormSchema("tachi");
    expect(schema).toBeTruthy();
    const raw = buildFormSnapshotHtml(
      schema!,
      { student_name: "דנה" },
      "דנה",
      {
        schoolLogoUrl: "data:image/png;base64,SCHOOL",
        associationLogoUrl: "data:image/png;base64,ASSOC",
      }
    );
    const next = prepareFormSnapshotHtmlForWordExport(
      raw,
      { schoolLogoUrl: "data:image/png;base64,NEW" },
      { formId: "tachi" }
    );
    expect(next).not.toContain("data:image/png;base64,NEW");
    expect(next).not.toMatch(/<img[^>]*\blogo-(?:school|association|protocol|moe)\b/);
    expect(next).toContain("direction: rtl");
  });
});