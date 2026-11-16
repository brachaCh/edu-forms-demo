import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachSandboxedHtmlPreview,
  buildSandboxedHtmlPreviewShell,
  canPreviewDocument,
  decodeDocumentDataUrlToText,
  DOCUMENT_MISSING_DOWNLOAD_MESSAGE,
  DOCUMENT_MISSING_OPEN_MESSAGE,
  DOCUMENT_TOO_LARGE_OPEN_MESSAGE,
  downloadStudentDocument,
  HTML_PREVIEW_IFRAME_ID,
  HTML_PREVIEW_SANDBOX,
  isHtmlStudentDocument,
  isSandboxedPreviewDocument,
  openStudentDocument,
  studentDocumentLoadFailureMessage,
} from "./student-document-open";
import { blobMimeForDataUrl } from "./data-url";
import { StudentDocumentDataError } from "./supabase-db";
import type { StudentDocument } from "@/lib/supabase/types";

function doc(partial: Partial<StudentDocument>): StudentDocument {
  return {
    id: "d1",
    student_id: "s1",
    name: "report.pdf",
    mime_type: "application/pdf",
    size: 20,
    data_url: "data:application/pdf;base64,JVBERi0=",
    folder: "כללי",
    uploaded_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("student document open errors (TZ-90)", () => {
  it("maps DOCUMENT_TOO_LARGE to a browser-open message", () => {
    const error = new StudentDocumentDataError("DOCUMENT_TOO_LARGE", 413);
    expect(studentDocumentLoadFailureMessage(error, "open")).toBe(
      DOCUMENT_TOO_LARGE_OPEN_MESSAGE
    );
    expect(studentDocumentLoadFailureMessage(error, "download")).toBe(
      DOCUMENT_TOO_LARGE_OPEN_MESSAGE
    );
    expect(DOCUMENT_TOO_LARGE_OPEN_MESSAGE).toBe(
      "הקובץ גדול מדי לפתיחה בדפדפן"
    );
  });

  it("keeps the missing-content copy for other failures", () => {
    expect(studentDocumentLoadFailureMessage(new Error("boom"), "open")).toBe(
      DOCUMENT_MISSING_OPEN_MESSAGE
    );
    expect(
      studentDocumentLoadFailureMessage(new Error("boom"), "download")
    ).toBe(DOCUMENT_MISSING_DOWNLOAD_MESSAGE);
  });
});

describe("isHtmlStudentDocument", () => {
  it("detects html by mime and extension", () => {
    expect(
      isHtmlStudentDocument({ name: "a.pdf", mime_type: "text/html" })
    ).toBe(true);
    expect(
      isHtmlStudentDocument({
        name: "כרטיס תלמיד סל אישי.html",
        mime_type: "application/octet-stream",
      })
    ).toBe(true);
    expect(isHtmlStudentDocument({ name: "note.htm", mime_type: "text/plain" })).toBe(
      true
    );
    expect(
      isHtmlStudentDocument({ name: "a.pdf", mime_type: "application/pdf" })
    ).toBe(false);
  });
});

describe("canPreviewDocument with corrected MIME types (#108 follow-up)", () => {
  it("cannot preview HEIC/HEIF/RTF — they always download cleanly (#108 follow-up)", () => {
    expect(
      canPreviewDocument(
        doc({
          name: "photo.jpg",
          mime_type: "image/heic",
          data_url: "data:image/heic;base64,AAAA",
        })
      )
    ).toBe(false);
    expect(
      canPreviewDocument(
        doc({
          name: "camera.heic",
          mime_type: "image/heic",
          data_url: "data:image/heic;base64,AAAA",
        })
      )
    ).toBe(false);
    expect(
      canPreviewDocument(
        doc({
          name: "photo.jpg",
          mime_type: "image/heif",
          data_url: "data:image/heif;base64,AAAA",
        })
      )
    ).toBe(false);
    expect(
      canPreviewDocument(
        doc({
          name: "letter.doc",
          mime_type: "application/rtf",
          data_url: "data:application/rtf;base64,e1xydGYx",
        })
      )
    ).toBe(false);
  });

  it("previews a storage-backed PDF from the stored MIME (TZ-139)", () => {
    expect(
      canPreviewDocument(
        doc({
          name: "scan.pdf",
          mime_type: "application/pdf",
          size: 12 * 1024 * 1024,
          data_url:
            "storage://student-documents/inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf",
        })
      )
    ).toBe(true);
  });

  it("creates proper blob types for HEIC/HEIF/RTF downloads (#108 follow-up)", () => {
    expect(blobMimeForDataUrl("data:image/heic;base64,AAAA")).toBe("image/heic");
    expect(blobMimeForDataUrl("data:image/heif;base64,AAAA")).toBe("image/heif");
    expect(blobMimeForDataUrl("data:application/rtf;base64,e1xydGYx")).toBe(
      "application/rtf"
    );
  });
});

describe("isSandboxedPreviewDocument", () => {
  it("sandboxes HTML/SVG by the real data-URL type even when name looks like a PDF", () => {
    expect(
      isSandboxedPreviewDocument({
        name: "report.pdf",
        mime_type: "application/pdf",
        data_url: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      })
    ).toBe(true);
    expect(
      isSandboxedPreviewDocument({
        name: "report.pdf",
        mime_type: "application/pdf",
        data_url: `data:image/svg+xml;base64,${btoa(
          `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`
        )}`,
      })
    ).toBe(true);
    expect(
      isSandboxedPreviewDocument({
        name: "report.pdf",
        mime_type: "application/pdf",
        data_url: "data:application/pdf;base64,JVBERi0=",
      })
    ).toBe(false);
  });

  it("does not treat a .pdf name as a PDF preview when the payload type is missing", () => {
    const stored = {
      name: "report.pdf",
      mime_type: "application/rss+xml",
      data_url: `data:;base64,${btoa(
        `<html xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></html>`
      )}`,
    };
    expect(isSandboxedPreviewDocument(stored)).toBe(true);
    expect(canPreviewDocument(doc(stored))).toBe(true);
    expect(blobMimeForDataUrl(stored.data_url)).toBe("application/octet-stream");
    expect(
      canPreviewDocument(
        doc({
          mime_type: "application/pdf",
          data_url: "data:;base64,JVBERi0=",
        })
      )
    ).toBe(false);
    expect(
      canPreviewDocument(
        doc({
          mime_type: "application/pdf",
          data_url: "data:application/pdf;base64,JVBERi0=",
        })
      )
    ).toBe(true);
  });

  it("sandboxes text/xsl and application/xslt+xml instead of creating a typed blob", () => {
    expect(
      isSandboxedPreviewDocument({
        name: "report.pdf",
        mime_type: "application/pdf",
        data_url: "data:text/xsl;base64,PHhzbA==",
      })
    ).toBe(true);
    expect(
      isSandboxedPreviewDocument({
        name: "report.pdf",
        mime_type: "application/xslt+xml",
        data_url: "data:application/xslt+xml;base64,PHhzbA==",
      })
    ).toBe(true);
    expect(blobMimeForDataUrl("data:text/xsl;base64,PHhzbA==")).toBe(
      "application/octet-stream"
    );
    expect(blobMimeForDataUrl("data:application/xslt+xml;base64,PHhzbA==")).toBe(
      "application/octet-stream"
    );
  });
});

describe("sandboxed HTML preview", () => {
  it("builds a trusted shell with an empty sandbox iframe and no untrusted html", () => {
    const shell = buildSandboxedHtmlPreviewShell('כותרת <script>alert(1)</script>');
    expect(shell).toContain(`id="${HTML_PREVIEW_IFRAME_ID}"`);
    expect(shell).toMatch(/<iframe[^>]*\ssandbox(?:=""|>|\s)/);
    expect(shell).not.toMatch(/allow-scripts/);
    expect(shell).not.toMatch(/allow-same-origin/);
    expect(shell).not.toContain("<script>alert(1)</script>");
    expect(shell).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(HTML_PREVIEW_SANDBOX).toBe("");
  });

  it("puts untrusted HTML only in iframe srcdoc and forces sandbox=\"\"", () => {
    const evil = `<!DOCTYPE html><html><body><script>document.cookie</script></body></html>`;
    let written = "";
    const iframe = {
      attrs: {} as Record<string, string>,
      srcdoc: "",
      setAttribute(name: string, value: string) {
        this.attrs[name] = value;
      },
    };
    attachSandboxedHtmlPreview(
      {
        write(html) {
          written = html;
        },
        getElementById(id) {
          return id === HTML_PREVIEW_IFRAME_ID ? iframe : null;
        },
      },
      evil,
      "עותק טופס"
    );
    expect(written).toBe(buildSandboxedHtmlPreviewShell("עותק טופס"));
    expect(written).not.toContain("document.cookie");
    expect(iframe.srcdoc).toBe(evil);
    expect(iframe.attrs.sandbox).toBe("");
    expect(iframe.attrs.sandbox).not.toContain("allow-scripts");
    expect(iframe.attrs.sandbox).not.toContain("allow-same-origin");
  });

  it("decodes snapshot data URLs as text for the sandboxed path (not blob:text/html)", () => {
    const html = "<!DOCTYPE html><html lang=\"he\" dir=\"rtl\"><body>שלום</body></html>";
    const bytes = new TextEncoder().encode(html);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const dataUrl = `data:text/html;base64,${btoa(binary)}`;
    expect(decodeDocumentDataUrlToText(dataUrl)).toBe(html);
  });

  it("keeps sandbox=\"\" on the new-tab shell and escaped title text", () => {
    const shell = buildSandboxedHtmlPreviewShell('x "onclick=alert(1)"');
    expect(shell).toContain(`sandbox`);
    expect(shell).not.toMatch(/allow-scripts|allow-same-origin/);
    expect(shell).toContain("&quot;onclick=alert(1)&quot;");
    expect(HTML_PREVIEW_SANDBOX).toBe("");
  });
});

describe("downloadStudentDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never falls back to data:text/html when the text/plain blob fails", async () => {
    const alerts: string[] = [];
    const hrefs: string[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const el = {
          href: "",
          rel: "",
          target: "",
          download: "",
          click() {
            hrefs.push(el.href);
          },
          remove() {},
        };
        return el;
      },
      body: { appendChild() {}, removeChild() {} },
    });
    vi.stubGlobal("window", {
      alert: (message: string) => {
        alerts.push(message);
      },
    });
    vi.stubGlobal("URL", {
      createObjectURL: () => {
        throw new Error("blob failed");
      },
    });

    const doc: StudentDocument = {
      id: "d1",
      student_id: "s1",
      name: "כרטיס תלמיד סל אישי.html",
      mime_type: "text/html",
      size: 20,
      data_url: "data:text/html;base64,PGh0bWw+",
      folder: "כללי",
      uploaded_at: "2026-01-01T00:00:00Z",
    };
    await downloadStudentDocument(doc);
    expect(hrefs.some((href) => href.startsWith("data:text/html"))).toBe(false);
    expect(hrefs).toEqual([]);
    expect(alerts.some((message) => message.includes("לא ניתן להוריד"))).toBe(
      true
    );
  });

  it("alerts instead of navigating a non-data URL on download", async () => {
    const alerts: string[] = [];
    const hrefs: string[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const el = {
          href: "",
          rel: "",
          target: "",
          download: "",
          click() {
            hrefs.push(el.href);
          },
          remove() {},
        };
        return el;
      },
      body: { appendChild() {}, removeChild() {} },
    });
    vi.stubGlobal("window", {
      alert: (message: string) => {
        alerts.push(message);
      },
    });

    await downloadStudentDocument(
      doc({
        name: "report.pdf",
        mime_type: "application/pdf",
        data_url: "https://evil.example/payload.pdf",
      })
    );
    expect(hrefs).toEqual([]);
    expect(alerts.some((message) => message.includes("לא ניתן להוריד"))).toBe(
      true
    );

    alerts.length = 0;
    await downloadStudentDocument(
      doc({
        data_url: "javascript:alert(1)",
      })
    );
    expect(hrefs).toEqual([]);
    expect(alerts.some((message) => message.includes("לא ניתן להוריד"))).toBe(
      true
    );
  });

  it("decodes a case-insensitive DATA: prefix", () => {
    expect(decodeDocumentDataUrlToText("DATA:text/plain;base64,YQ==")).toBe("a");
  });

  it("downloads tachi html archives as Word without fixed protocol logo", async () => {
    const downloads: string[] = [];
    const blobTexts: string[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const el = {
          href: "",
          rel: "",
          download: "",
          click() {
            downloads.push(el.download);
          },
          remove() {},
        };
        return el;
      },
      body: { appendChild() {}, removeChild() {} },
    });
    vi.spyOn(URL, "createObjectURL").mockImplementation((obj) => {
      if (obj instanceof Blob) {
        void (obj as Blob).text().then((text) => blobTexts.push(text));
      }
      return "blob:archive";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const { formSnapshotFileName } = await import("@/lib/form-snapshot-filename");
    const { getFormSchema } = await import("@/lib/form-schemas");
    const tachi = getFormSchema("tachi")!;
    const htmlBody =
      '<html><body><footer class="doc-footer"><img class="logo-protocol" src="/brand/protocol-logo.png" alt="" /></footer>תוכנית</body></html>';
    const b64 = Buffer.from(htmlBody, "utf8").toString("base64");
    await downloadStudentDocument(
      doc({
        name: formSnapshotFileName(tachi.title),
        mime_type: "text/html",
        data_url: `data:text/html;base64,${b64}`,
      })
    );
    expect(downloads[0]).toMatch(/\.doc$/);
    expect(downloads[0]).toContain("תח");
    await vi.waitFor(() => {
      expect(blobTexts.length).toBeGreaterThan(0);
    });
    expect(blobTexts[0]).not.toMatch(/<img[^>]*\blogo-protocol\b/);
    expect(blobTexts[0]).not.toContain("/brand/protocol-logo");
    expect(blobTexts[0]).toContain("תוכנית");
  });

  it("downloads other html archives unchanged as html", async () => {
    const downloads: string[] = [];
    const blobTypes: string[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const el = {
          href: "",
          rel: "",
          download: "",
          click() {
            downloads.push(el.download);
          },
          remove() {},
        };
        return el;
      },
      body: { appendChild() {}, removeChild() {} },
    });
    vi.spyOn(URL, "createObjectURL").mockImplementation((obj) => {
      if (obj instanceof Blob) blobTypes.push(obj.type);
      return "blob:html";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const { formSnapshotFileName } = await import("@/lib/form-snapshot-filename");
    const htmlBody = "<html><body>x</body></html>";
    const b64 = Buffer.from(htmlBody, "utf8").toString("base64");
    await downloadStudentDocument(
      doc({
        name: formSnapshotFileName("כרטיס תלמיד סל אישי"),
        mime_type: "text/html",
        data_url: `data:text/html;base64,${b64}`,
      })
    );
    expect(downloads[0]).toMatch(/\.html$/);
    expect(blobTypes[0]).toContain("text/plain");
  });
});

describe("openStudentDocument stored bypass", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never opens a typeless rss-as-pdf as a same-origin rendered blob", async () => {
    const blobTypes: string[] = [];
    const hrefs: string[] = [];
    const iframe = {
      attrs: {} as Record<string, string>,
      srcdoc: "",
      setAttribute(name: string, value: string) {
        this.attrs[name] = value;
      },
    };
    const previewDoc = {
      title: "",
      body: { innerHTML: "" },
      open() {},
      close() {},
      write() {},
      getElementById(id: string) {
        return id === HTML_PREVIEW_IFRAME_ID ? iframe : null;
      },
    };
    vi.stubGlobal("document", {
      createElement: () => {
        const el = {
          href: "",
          rel: "",
          target: "",
          download: "",
          click() {
            hrefs.push(el.href);
          },
          remove() {},
        };
        return el;
      },
      body: { appendChild() {}, removeChild() {} },
      getElementById() {
        return null;
      },
    });
    vi.stubGlobal("window", {
      open: () => ({
        closed: false,
        document: previewDoc,
      }),
      alert() {},
    });
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        blobTypes.push(blob.type);
        return "blob:http://localhost/x";
      },
    });

    await openStudentDocument(
      doc({
        name: "report.pdf",
        mime_type: "application/rss+xml",
        data_url: `data:;base64,${btoa(
          `<html xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></html>`
        )}`,
      })
    );

    expect(iframe.attrs.sandbox).toBe("");
    expect(iframe.srcdoc).toContain("<script>alert(1)</script>");
    expect(blobTypes.every((type) => !type.includes("xml") && !type.includes("html"))).toBe(
      true
    );
    expect(hrefs.some((href) => href.startsWith("blob:"))).toBe(false);
  });
});
