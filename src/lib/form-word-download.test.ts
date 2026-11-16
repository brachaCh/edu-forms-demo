import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLOB_URL_REVOKE_DELAY_MS,
} from "./blob-download";
import {
  createFormWordBlob,
  formWordDownloadFileName,
  FORM_WORD_DOWNLOAD_TOO_LARGE,
  downloadFormSnapshotAsWord,
  downloadFormWordBlob,
} from "./form-word-download";

describe("formWordDownloadFileName", () => {
  it("uses .doc extension for Hebrew titles", () => {
    expect(formWordDownloadFileName('תח"י (בקובץ נפרד)')).toBe(
      "תח-י (בקובץ נפרד).doc"
    );
  });
});

describe("createFormWordBlob", () => {
  it("prefixes UTF-8 BOM for Word", () => {
    const blob = createFormWordBlob("<html><body>בדיקה</body></html>");
    expect(blob).not.toBeNull();
    expect(blob?.type).toContain("msword");
  });

  it("rejects empty html", () => {
    expect(createFormWordBlob("   ")).toBeNull();
  });
});

describe("downloadFormWordBlob", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not revoke blob URL immediately", () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:word");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
    vi.stubGlobal("document", {
      createElement: () => ({
        href: "",
        rel: "",
        download: "",
        click() {},
        remove() {},
      }),
      body: { appendChild: () => {}, removeChild: () => {} },
    });
    downloadFormWordBlob(new Blob(["a"]), "plan.doc");
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BLOB_URL_REVOKE_DELAY_MS);
    expect(revoke).toHaveBeenCalledWith("blob:word");
  });
});

describe("downloadFormSnapshotAsWord", () => {
  it("word export html does not include fixed protocol branding", async () => {
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { protocolLogoPublicUrl } = await import("@/lib/document-branding");
    const { prepareFormSnapshotHtmlForWordExport } = await import(
      "@/lib/form-export-logos"
    );
    const schema = getFormSchema("tachi")!;
    const raw = buildFormSnapshotHtml(
      schema,
      { student_name: "דנה" },
      "דנה",
      { protocolLogoUrl: protocolLogoPublicUrl("https://app.example") }
    );
    const html = prepareFormSnapshotHtmlForWordExport(raw, {}, {
      formId: "tachi",
    });
    expect(html).not.toMatch(/<img[^>]*\blogo-protocol\b/);
    expect(html).not.toContain("/brand/protocol-logo");
    const blob = createFormWordBlob(html);
    expect(blob).not.toBeNull();
    downloadFormSnapshotAsWord(html, schema.title);
  });

  it("reports oversize html without claiming site is down", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const result = downloadFormSnapshotAsWord(
      "x".repeat(5_000_000),
      'תח"י'
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe(FORM_WORD_DOWNLOAD_TOO_LARGE);
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });
});