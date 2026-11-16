import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import type { StudentDocument } from "@/lib/supabase/types";

const docsByStudent = new Map<string, StudentDocument[]>();
const slots = new Map<string, string>();
const buttonsByFolder = new Map<string, string[]>();
const fillsByStudent = new Map<
  string,
  import("@/lib/supabase/types").StudentFormFill[]
>();

vi.mock("@/lib/mock-store", () => ({
  getStudentDocuments: (studentId: string) =>
    docsByStudent.get(studentId) ?? [],
  getStudents: () => [
    {
      id: "s1",
      status: "personal-basket",
      calendar_year: 2026,
      full_name: "יעל כהן",
    },
  ],
  getStudentFormFills: (studentId: string) =>
    fillsByStudent.get(studentId) ?? [],
  loadStudentFormFills: async (studentId: string) =>
    fillsByStudent.get(studentId) ?? [],
  getUser: () => null,
}));

vi.mock("@/lib/folder-actions", () => ({
  getDocumentSlot: (documentId: string) => slots.get(documentId) ?? null,
  getFolderActionButtons: (_studentId: string, folderName: string) =>
    buttonsByFolder.get(folderName) ?? [],
}));

import {
  augmentPrintGroupsWithFilledForms,
  buildUploadedPdfPrintHtml,
  collectDocumentsForFolders,
  collectFolderPrintGroups,
  isSignedArchiveDocForForm,
  printFolderMatchNames,
} from "./student-document-print";
import {
  bytesStartWithPdfMagic,
  detectPrintEmbedKind,
  looksLikePdfDataUrl,
  PDF_MAGIC_BASE64_PREFIX_CHARS,
  PDF_WORKER_SRC,
} from "./student-document-print-embed";
import { buildMinimalPdfBytes } from "./print-fixtures";

function doc(
  id: string,
  name: string,
  folder: string,
  uploaded_at: string,
  extra?: Partial<StudentDocument>
): StudentDocument {
  return {
    id,
    student_id: "s1",
    name,
    folder,
    mime_type: "application/pdf",
    size: 10,
    data_url: "data:application/pdf;base64,JVBERi0=",
    uploaded_at,
    archived_at: null,
    calendar_year: 2026,
    ...extra,
  };
}

const PDF_HEADER_B64 = Buffer.from("%PDF-1.4\n").toString("base64");
const PDF_DATA_URL = `data:application/octet-stream;base64,${PDF_HEADER_B64}`;

describe("detectPrintEmbedKind — uploaded PDFs (TZ-87)", () => {
  it("detects pdf by extension even with a charset on the mime", () => {
    expect(
      detectPrintEmbedKind("hearing.pdf", "application/pdf;charset=utf-8")
    ).toBe("pdf");
  });

  it("detects pdf from application/x-pdf and trailing whitespace on the name", () => {
    expect(detectPrintEmbedKind("scan.PDF ", "application/x-pdf")).toBe("pdf");
  });

  it("detects a Hebrew filename without .pdf when the payload starts with %PDF", () => {
    expect(
      detectPrintEmbedKind(
        "בדיקת שמיעה וראיה",
        "application/octet-stream",
        PDF_DATA_URL
      )
    ).toBe("pdf");
  });

  it("does not treat a Word file as pdf", () => {
    expect(
      detectPrintEmbedKind(
        "מיצוי אפשרויות.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("docx");
  });

  it("does not treat a filled-form HTML snapshot as pdf (TZ-89)", () => {
    const htmlUrl = `data:text/html;charset=utf-8,${encodeURIComponent("<!DOCTYPE html><p>טופס</p>")}`;
    expect(
      detectPrintEmbedKind("מיצוי אפשרויות", "text/html", htmlUrl)
    ).toBe("html");
    expect(looksLikePdfDataUrl(htmlUrl)).toBe(false);
  });
});

describe("minimal PDF fixtures", () => {
  it("builds a small one-page PDF and a three-page PDF", () => {
    const one = buildMinimalPdfBytes("letter", 1);
    const three = buildMinimalPdfBytes("scan", 3);
    expect(new TextDecoder().decode(one)).toContain("/Count 1");
    expect(new TextDecoder().decode(three)).toContain("/Count 3");
    expect(three.byteLength).toBeGreaterThan(one.byteLength);
    expect(one.byteLength).toBeLessThan(2_000);
  });
});

describe("PDF magic sniffing", () => {
  it("recognizes %PDF at byte 0", () => {
    expect(bytesStartWithPdfMagic(Buffer.from("%PDF-1.4\n"))).toBe(true);
    expect(bytesStartWithPdfMagic(Buffer.from("not a pdf"))).toBe(false);
    expect(bytesStartWithPdfMagic(null)).toBe(false);
  });

  it("reads magic from a data URL without fetching", () => {
    expect(looksLikePdfDataUrl(PDF_DATA_URL)).toBe(true);
    expect(looksLikePdfDataUrl("data:application/pdf;base64,AAAA")).toBe(true);
    expect(looksLikePdfDataUrl("data:text/plain,hello")).toBe(false);
  });

  it("does not decode the full base64 payload to sniff %PDF", () => {
    const huge = `${PDF_HEADER_B64}${"A".repeat(400_000)}`;
    const dataUrl = `data:application/octet-stream;base64,${huge}`;
    const spy = vi.spyOn(globalThis, "atob");
    expect(looksLikePdfDataUrl(dataUrl)).toBe(true);
    expect(spy).toHaveBeenCalled();
    for (const [arg] of spy.mock.calls) {
      expect(String(arg).length).toBeLessThanOrEqual(
        PDF_MAGIC_BASE64_PREFIX_CHARS + 3
      );
    }
    spy.mockRestore();
  });
});

describe("pdf.js worker src (TZ-87 / TZ-102)", () => {
  it("registers the bundled worker on the main thread and allows blob workers in CSP", () => {
    expect(PDF_WORKER_SRC).toBe("/pdf.worker.min.mjs");
    const src = readFileSync(
      new URL("./student-document-print-embed.ts", import.meta.url),
      "utf8"
    );
    expect(src).toContain("workerSrc = PDF_WORKER_SRC");
    expect(src).toContain('"/pdf.worker.min.mjs"');
    expect(src).toContain("pdfjs-dist/build/pdf.worker.min.mjs");
    expect(src).toContain("registerPdfJsMainThreadWorker");
    expect(src).toContain("pdfjsWorker");
    expect(src).not.toContain("disableWorker");
    expect(src).toContain("isPdfWorkerLoadError");
    const nextConfig = readFileSync(
      new URL("../../next.config.ts", import.meta.url),
      "utf8"
    );
    expect(nextConfig).toContain("worker-src 'self' blob:");
    expect(nextConfig).toContain("/pdf.worker.min.mjs");
    expect(nextConfig).toContain("text/javascript");
    expect(nextConfig).toContain("max-age=86400");
    expect(nextConfig).toContain("must-revalidate");
    expect(nextConfig).not.toContain("max-age=31536000");
    expect(nextConfig).not.toMatch(/pdf\.worker\.min\.mjs[\s\S]{0,400}immutable/);
  });
});

describe("buildUploadedPdfPrintHtml", () => {
  it("renders each page as an <img>, never iframe/embed/object", () => {
    const html = buildUploadedPdfPrintHtml("בדיקת שמיעה וראיה.pdf", [
      "data:image/jpeg;base64,AAA",
      "data:image/jpeg;base64,BBB",
    ]);
    expect(html).toContain('class="print-doc print-doc-upload print-doc-pdf"');
    expect(html).toContain("print-doc-pdf-page");
    expect(html).toContain("print-doc-pdf-caption");
    expect(html).toContain("בדיקת שמיעה וראיה.pdf");
    expect(html).toContain("data:image/jpeg;base64,AAA");
    expect(html).toContain("data:image/jpeg;base64,BBB");
    expect(html).not.toMatch(/<(iframe|embed|object)\b/i);
    expect(html.match(/print-doc-pdf/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("puts the filename caption only on the first page so later pages stay full-bleed", () => {
    const html = buildUploadedPdfPrintHtml("scan.pdf", [
      "data:image/jpeg;base64,A",
      "data:image/jpeg;base64,B",
    ]);
    expect((html.match(/print-doc-pdf-caption/g) || []).length).toBe(1);
  });
});

describe("מיצוי אפשרויות / extra-documents folder print (TZ-87)", () => {
  beforeEach(() => {
    docsByStudent.clear();
    slots.clear();
    buttonsByFolder.clear();
    fillsByStudent.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("expands מסמכים נוספים to include מיצוי אפשרויות from the portfolio template", () => {
    const names = printFolderMatchNames(
      "s1",
      "מסמכים נוספים",
      "personal-basket"
    );
    expect(names).toContain("מסמכים נוספים");
    expect(names).toContain("מיצוי אפשרויות");
  });

  it("includes a PDF uploaded into מיצוי אפשרויות when printing מסמכים נוספים", () => {
    docsByStudent.set("s1", [
      doc(
        "hearing-pdf",
        "בדיקת שמיעה וראיה.pdf",
        "מיצוי אפשרויות",
        "2026-10-01T00:00:00.000Z"
      ),
    ]);
    slots.set("hearing-pdf", "מיצוי אפשרויות");

    const ordered = collectDocumentsForFolders("s1", ["מסמכים נוספים"]);
    expect(ordered.map((item) => item.id)).toEqual(["hearing-pdf"]);
  });

  it("includes that PDF in a whole-file personal-basket folder list", () => {
    docsByStudent.set("s1", [
      doc(
        "hearing-pdf",
        "בדיקת שמיעה וראיה.pdf",
        "מיצוי אפשרויות",
        "2026-10-01T00:00:00.000Z"
      ),
    ]);

    const ordered = collectDocumentsForFolders("s1", [
      "אינפורמציה כללית",
      "תיעוד תהליך למידה",
      'תח"י',
      "אינטגרציה טיפולית",
      "מעקב אחרי הישגי התלמיד",
      "מסמכים נוספים",
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["hearing-pdf"]);
  });

  it("does not treat an independent hearing/vision PDF as the exhaust-options signed archive", () => {
    const uploaded = doc(
      "hearing-pdf",
      "בדיקת שמיעה וראיה.pdf",
      "מיצוי אפשרויות",
      "2026-10-01T00:00:00.000Z"
    );
    expect(
      isSignedArchiveDocForForm(uploaded, {
        formTitle: "מיצוי אפשרויות התערבות בבית הספר",
        label: "מיצוי אפשרויות",
        formFolder: "מיצוי אפשרויות",
        linkedDocumentId: null,
      })
    ).toBe(false);
  });

  it("keeps the uploaded PDF next to a filled exhaust-options form", async () => {
    docsByStudent.set("s1", [
      doc(
        "hearing-pdf",
        "בדיקת שמיעה וראיה.pdf",
        "מיצוי אפשרויות",
        "2026-10-01T00:00:00.000Z"
      ),
    ]);
    slots.set("hearing-pdf", "מיצוי אפשרויות");
    fillsByStudent.set("s1", [
      {
        id: "fill-exhaust",
        student_id: "s1",
        form_id: "moe-exhaust-options",
        data: { student_name: "יעל כהן", school_name: "ביס" },
        status: "completed",
        document_id: null,
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-02T00:00:00.000Z",
      },
    ]);

    const groups = collectFolderPrintGroups("s1", ["מסמכים נוספים"]);
    const augmented = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));

    expect(ids).toContain("hearing-pdf");
    expect(ids.some((id) => id.startsWith("fill-print-"))).toBe(true);
  });
});

describe("folder-print CSS for rasterized PDF pages", () => {
  it("prints PDF page images without break-inside:avoid", () => {
    const src = readFileSync(
      new URL("./student-document-print.ts", import.meta.url),
      "utf8"
    );
    const start = src.indexOf(".print-doc-pdf-page {");
    expect(start).toBeGreaterThan(-1);
    const chunk = src.slice(start, start + 450);
    expect(chunk).toContain("page-break-inside: auto");
    expect(chunk).toContain("break-inside: auto");
    expect(chunk).not.toContain("break-inside: avoid");
    expect(src).toContain('class="print-doc-pdf-page"');
    expect(src).not.toMatch(/<(iframe|embed|object)[^>]*(pdf|application\/pdf)/i);
  });
});
