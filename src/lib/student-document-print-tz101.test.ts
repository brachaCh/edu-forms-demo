import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentDocument } from "@/lib/supabase/types";
import { AUTO_PRINT_SCRIPT } from "@/lib/detached-print";
import {
  detectPrintEmbedKind,
  mapWithConcurrency,
  PRINT_DOC_CONCURRENCY,
} from "@/lib/student-document-print-embed";
import {
  PRINT_FIXTURE_DOCX_NAME,
  PRINT_FIXTURE_PDF_NAME,
  PRINT_FIXTURE_IMAGE_NAME,
  buildPrintFixtureUploads,
  buildPersonalScheduleFillData,
  buildPrintFixtureStudent,
} from "@/lib/print-fixtures";
import { getFormSchema } from "@/lib/form-schemas";
import { buildFormSnapshotHtml } from "@/lib/form-snapshot";
import { mergePrintFormDataWithStudent } from "@/lib/print-form-data";

const docsByStudent = new Map<string, StudentDocument[]>();
const fillsByStudent = new Map<
  string,
  import("@/lib/supabase/types").StudentFormFill[]
>();

vi.mock("@/lib/mock-store", () => ({
  getStudentDocuments: (studentId: string) =>
    docsByStudent.get(studentId) ?? [],
  getStudents: () => [buildPrintFixtureStudent()],
  getStudentFormFills: (studentId: string) =>
    fillsByStudent.get(studentId) ?? [],
  loadStudentFormFills: async (studentId: string) =>
    fillsByStudent.get(studentId) ?? [],
  getUser: () => null,
}));

vi.mock("@/lib/folder-actions", () => ({
  getDocumentSlot: () => null,
  getFolderActionButtons: () => [],
}));

vi.mock("@/lib/student-document-print-embed", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/student-document-print-embed")>();
  return {
    ...actual,
    renderPdfDataUrlToImages: vi.fn(async () => [
      "data:image/jpeg;base64,AAA",
    ]),
  };
});

import {
  augmentPrintGroupsWithFilledForms,
  buildPrintableBlock,
  collectFolderPrintGroups,
  printStudentDocuments,
} from "./student-document-print";

function fakePrintWindow(delivered: string[], failed: string[]) {
  return {
    key: "tz-101",
    whenReady: async () => true,
    setProgress: () => {},
    deliver: (html: string) => {
      delivered.push(html);
    },
    fail: (message: string) => {
      failed.push(message);
    },
    close: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("TZ-101 / TZ-102 / TZ-103 print fixtures", () => {
  beforeEach(() => {
    docsByStudent.clear();
    fillsByStudent.clear();
    vi.stubGlobal("window", {
      alert: vi.fn(),
      setTimeout,
      clearTimeout,
      location: { origin: "http://localhost" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("detects an uploaded PDF whose name has spaces and parentheses", () => {
    expect(detectPrintEmbedKind(PRINT_FIXTURE_PDF_NAME, "application/pdf")).toBe(
      "pdf"
    );
    expect(
      detectPrintEmbedKind(PRINT_FIXTURE_DOCX_NAME, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    ).toBe("docx");
    expect(
      detectPrintEmbedKind(PRINT_FIXTURE_IMAGE_NAME, "image/png")
    ).toBe("image");
  });

  it("prints uploaded PDF / Word / image plus a filled personal schedule", async () => {
    const fixtures = await buildPrintFixtureUploads();
    docsByStudent.set(fixtures.student.id, [
      fixtures.pdf,
      fixtures.docx,
      fixtures.image,
    ]);
    fillsByStudent.set(fixtures.student.id, [fixtures.scheduleFill]);

    const groups = collectFolderPrintGroups(fixtures.student.id, [
      "תיעוד תהליך למידה",
      "מסמכים נוספים",
    ]);
    const augmented = await augmentPrintGroupsWithFilledForms(
      fixtures.student.id,
      groups,
      {}
    );
    const ids = augmented.flatMap((group) => group.docs.map((doc) => doc.id));
    expect(ids).toContain("fixture-pdf-adhd");
    expect(ids).toContain("fixture-docx-committee");
    expect(ids).toContain("fixture-image-approval");
    expect(ids.some((id) => id.startsWith("fill-print-"))).toBe(true);

    const imageBlock = await buildPrintableBlock(fixtures.image);
    expect(imageBlock?.html).toContain(PRINT_FIXTURE_IMAGE_NAME);
    expect(imageBlock?.html).toContain("print-doc-image");
    expect(imageBlock?.html).not.toContain("לא ניתן היה לטעון");

    const delivered: string[] = [];
    const failed: string[] = [];
    const ok = await printStudentDocuments(
      augmented.flatMap((group) => group.docs),
      "הדפסת תיק סל אישי — בדיקה",
      { printWindow: fakePrintWindow(delivered, failed), groups: augmented }
    );
    expect(ok).toBe(true);
    expect(failed).toEqual([]);
    expect(delivered).toHaveLength(1);
    const html = delivered[0]!;
    expect(html).toContain(PRINT_FIXTURE_PDF_NAME);
    expect(html).toContain("print-doc-pdf-page");
    expect(html).toContain("data:image/jpeg;base64,AAA");
    expect(html).toContain(PRINT_FIXTURE_DOCX_NAME);
    expect(html).toContain(PRINT_FIXTURE_IMAGE_NAME);
    expect(html).toContain("print-doc-schedule");
    expect(html).toContain("נועה דמו");
    expect(html).toContain("ד׳2");
    expect(html).toContain("12/10/2026");
    expect(html).toContain("חשבון");
    expect(html).toContain("sched-cell-empty");
    expect(html).not.toContain("לא ניתן היה לטעון את הקובץ להדפסה");
    expect(html).toContain(AUTO_PRINT_SCRIPT);
    expect(html).toContain("@page schedule-landscape");
    expect(html).not.toMatch(/setTimeout\(function \(\) \{\s*try \{ window\.focus\(\); window\.print/);
  });

  it("pipelines load+convert so ready HTML does not wait for a slow upload (TZ-101)", async () => {
    const schema = getFormSchema("personal-schedule")!;
    const student = buildPrintFixtureStudent();
    const html = buildFormSnapshotHtml(
      schema,
      mergePrintFormDataWithStudent(
        schema,
        buildPersonalScheduleFillData(student.full_name),
        student,
        { created_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-10-12T00:00:00.000Z" }
      ),
      student.full_name
    );
    const ready: StudentDocument = {
      id: "ready-html",
      student_id: student.id,
      name: "מערכת שעות אישית",
      folder: "תיעוד תהליך למידה",
      mime_type: "text/html",
      size: html.length,
      data_url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      uploaded_at: "2026-10-01T00:00:00.000Z",
      archived_at: "2026-10-01T00:00:00.000Z",
      calendar_year: 2026,
    };
    const pending: StudentDocument = {
      id: "pending-pdf",
      student_id: student.id,
      name: PRINT_FIXTURE_PDF_NAME,
      folder: "מסמכים נוספים",
      mime_type: "application/pdf",
      size: 20_000,
      data_url: "",
      uploaded_at: "2026-10-02T00:00:00.000Z",
      archived_at: null,
      calendar_year: 2026,
    };

    const order: string[] = [];
    let resolveLoad: ((doc: StudentDocument) => void) | undefined;
    const loadStarted = new Promise<void>((resolve) => {
      const delivered: string[] = [];
      const failed: string[] = [];
      void printStudentDocuments([ready, pending], "pipeline", {
        printWindow: fakePrintWindow(delivered, failed),
        loadDoc: async (doc) => {
          order.push(`load:${doc.id}`);
          resolve();
          await new Promise<StudentDocument>((ok) => {
            resolveLoad = ok;
          });
          order.push(`loaded:${doc.id}`);
          return {
            ...doc,
            data_url: "data:application/pdf;base64,JVBERi0=",
          };
        },
      }).then((ok) => {
        expect(ok).toBe(true);
        expect(failed).toEqual([]);
        expect(delivered[0]).toContain("print-doc-schedule");
        expect(delivered[0]).toContain(PRINT_FIXTURE_PDF_NAME);
      });
    });

    await loadStarted;
    expect(order).toEqual(["load:pending-pdf"]);
    resolveLoad?.({
      ...pending,
      data_url: "data:application/pdf;base64,JVBERi0=",
    });
    await vi.waitFor(() => {
      expect(order).toContain("loaded:pending-pdf");
    });
  });

  it("keeps print-doc concurrency above the legacy sequential default", () => {
    expect(PRINT_DOC_CONCURRENCY).toBeGreaterThanOrEqual(4);
  });

  it("mapWithConcurrency overlaps work instead of running one-by-one", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3, 4], 3, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return n;
    });
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});
