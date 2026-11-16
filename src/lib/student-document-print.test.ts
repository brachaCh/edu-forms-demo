/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import JSZip from "jszip";
import type { StudentDocument } from "@/lib/supabase/types";

const docsByStudent = new Map<string, StudentDocument[]>();
const slots = new Map<string, string>();
const buttonsByFolder = new Map<string, string[]>();
const fillsByStudent = new Map<string, import("@/lib/supabase/types").StudentFormFill[]>();

const mockStudent = {
  id: "s1",
  status: "personal-basket" as const,
  calendar_year: 2026,
  full_name: "יעל כהן",
  class_name: "ה1",
  id_number: "000000018",
  notes: "CARD-NOTES-SHOULD-STAY-BLANK",
  father_name: "CARD-FATHER-SHOULD-STAY-BLANK",
  mother_name: "CARD-MOTHER-SHOULD-STAY-BLANK",
  father_mobile: "0500000000",
  mother_mobile: "0500000001",
  birth_date: "2014-03-03",
  home_address: "רחוב דמו 1",
  phone: "03-0000000",
  email: "demo@example.com",
  family_status: "נשואים" as const,
};

vi.mock("@/lib/mock-store", () => ({
  getStudentDocuments: (studentId: string) => docsByStudent.get(studentId) ?? [],
  getStudents: () => [mockStudent],
  getStudentFormFills: (studentId: string) => fillsByStudent.get(studentId) ?? [],
  loadStudentFormFills: async (studentId: string) => fillsByStudent.get(studentId) ?? [],
  getUser: () => null,
}));

vi.mock("@/lib/folder-actions", () => ({
  getDocumentSlot: (documentId: string) => slots.get(documentId) ?? null,
  getFolderActionButtons: (_studentId: string, folderName: string) =>
    buttonsByFolder.get(folderName) ?? [],
}));

import {
  collectDocumentsForFolders,
  buildPortfolioCoverHtml,
  buildFolderCoverHtml,
  buildWaiverPrintDocumentFromFill,
  portfolioCoverKindLabel,
  printFolderMatchNames,
  resolvePortfolioCoverFields,
  sanitizeEmbeddedStyles,
  shouldIncludePortfolioCover,
  shouldSkipFolderCovers,
  augmentPrintGroupsWithWaiver,
  augmentPrintGroupsWithFilledForms,
  collectFolderPrintGroups,
  ensureEmbeddedFormHeaderLogos,
  hydratePrintGroupPayloads,
  isVisuallyEmptyPrintHtml,
  isSignedArchiveDocForForm,
  buildPrintableBlock,
  isSchoolConfidentialityWaiverPrintItem,
  printStudentDocuments,
  PRINT_NO_CONTENT_MESSAGE,
  printUploadUnavailableNote,
  withAbortTimeout,
  selectedFoldersIncludeSchoolWaiver,
  shouldAutoAddSchoolWaiver,
} from "./student-document-print";
import { detectPrintEmbedKind } from "./student-document-print-embed";
import { peekPrintBytes, rememberPrintBytes } from "./print-payload";
import { StudentDocumentDataError } from "./supabase-db";

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
    mime_type: "text/html",
    size: 10,
    data_url: "data:text/html,hi",
    uploaded_at,
    archived_at: null,
    calendar_year: 2026,
    ...extra,
  };
}

describe("collectDocumentsForFolders", () => {
  beforeEach(() => {
    docsByStudent.clear();
    slots.clear();
    buttonsByFolder.clear();
    fillsByStudent.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prints oldest documents first within a folder", () => {
    docsByStudent.set("s1", [
      doc("d3", "ג", "אינפורמציה כללית", "2026-03-01T00:00:00.000Z"),
      doc("d1", "א", "אינפורמציה כללית", "2026-01-01T00:00:00.000Z"),
      doc("d2", "ב", "אינפורמציה כללית", "2026-02-01T00:00:00.000Z"),
    ]);

    const ordered = collectDocumentsForFolders("s1", ["אינפורמציה כללית"]);
    expect(ordered.map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
  });

  it("follows folder list order then slot button order", () => {
    buttonsByFolder.set("תח\"י", ["טופס א", "טופס ב"]);
    docsByStudent.set("s1", [
      doc("b", "ב", 'תח"י', "2026-01-02T00:00:00.000Z"),
      doc("a", "א", 'תח"י', "2026-01-01T00:00:00.000Z"),
      doc("g", "כללי", "אינפורמציה כללית", "2026-06-01T00:00:00.000Z"),
    ]);
    slots.set("b", "טופס ב");
    slots.set("a", "טופס א");

    const ordered = collectDocumentsForFolders("s1", [
      "אינפורמציה כללית",
      'תח"י',
    ]);
    expect(ordered.map((d) => d.id)).toEqual(["g", "a", "b"]);
  });

  it("includes independently uploaded nested slots like hearing tests and diagnoses", () => {
    buttonsByFolder.set("אינפורמציה כללית", [
      "אבחונים ודוחות פורמליים (פסיכולוגי, רפואי וכו')",
      "בדיקות שמיעה וראיה",
    ]);
    buttonsByFolder.set("בדיקות שמיעה וראיה", [
      "בדיקת שמיעה",
      "בדיקת ראיה",
    ]);
    docsByStudent.set("s1", [
      // כמו בהעלאה אמיתית — התיקייה היא שם כפתור המשנה
      // זמני העלאה הפוכים לסדר הכפתורים — הסדר חייב להיות לפי הטפסים, לא לפי זמן
      doc("v", "vision.pdf", "בדיקת ראיה", "2026-01-01T00:00:00.000Z"),
      doc("h", "hearing.pdf", "בדיקת שמיעה", "2026-06-01T00:00:00.000Z"),
      doc(
        "d",
        "diag.pdf",
        "אבחונים ודוחות פורמליים (פסיכולוגי, רפואי וכו')",
        "2026-12-01T00:00:00.000Z"
      ),
    ]);
    slots.set("h", "בדיקת שמיעה");
    slots.set("v", "בדיקת ראיה");
    slots.set("d", "אבחונים ודוחות פורמליים (פסיכולוגי, רפואי וכו')");

    const ordered = collectDocumentsForFolders("s1", ["אינפורמציה כללית"]);
    expect(ordered.map((item) => item.id)).toEqual(["d", "h", "v"]);
  });

  it("keeps selected folders in portfolio order and forms in button order across folders", () => {
    buttonsByFolder.set("אינפורמציה כללית", ["טופס א", "טופס ב"]);
    buttonsByFolder.set('תח"י', ["סיכום", "מעקב"]);
    docsByStudent.set("s1", [
      doc("t2", "מעקב", 'תח"י', "2026-01-01T00:00:00.000Z"),
      doc("g2", "ב", "אינפורמציה כללית", "2026-01-01T00:00:00.000Z"),
      doc("t1", "סיכום", 'תח"י', "2026-06-01T00:00:00.000Z"),
      doc("g1", "א", "אינפורמציה כללית", "2026-06-01T00:00:00.000Z"),
    ]);
    slots.set("g1", "טופס א");
    slots.set("g2", "טופס ב");
    slots.set("t1", "סיכום");
    slots.set("t2", "מעקב");

    // סדר בחירה הפוך — חייב להישאר לפי סדר התיקיות בתיק
    const ordered = collectDocumentsForFolders("s1", [
      "אינפורמציה כללית",
      'תח"י',
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["g1", "g2", "t1", "t2"]);
  });

  it("includes current-year archived uploads and completed forms in portfolio print", () => {
    docsByStudent.set("s1", [
      doc("active", "scan.pdf", "בדיקת שמיעה", "2026-02-01T00:00:00.000Z"),
      doc("arch", "diag.pdf", "אבחונים ודוחות פורמליים (פסיכולוגי, רפואי וכו')", "2026-01-15T00:00:00.000Z", {
        archived_at: "2026-01-16T00:00:00.000Z",
        calendar_year: 2026,
      }),
      doc("old", "old.pdf", "בדיקת ראיה", "2024-01-01T00:00:00.000Z", {
        archived_at: "2024-01-02T00:00:00.000Z",
        calendar_year: 2024,
      }),
    ]);

    const ordered = collectDocumentsForFolders("s1", ["אינפורמציה כללית"]);
    expect(ordered.map((item) => item.id)).toEqual(["arch", "active"]);
  });

  it("expands hearing/vision nested labels from the real portfolio template", () => {
    const names = printFolderMatchNames("s1", "אינפורמציה כללית", "integration");
    expect(names).toContain("בדיקות שמיעה וראיה");
    expect(names).toContain("בדיקת שמיעה");
    expect(names).toContain("בדיקת ראיה");
    expect(names).toContain("אבחונים ודוחות פורמליים (פסיכולוגי, רפואי וכו')");
    expect(names).toContain("שאלון הפניה ופרוטוקול");
    expect(names).toContain("לדיון בצוות רב מקצועי");
    expect(names).toContain("לדיון בוועדת אפיון וזכאות");
  });

  it("skips empty folders and still prints documents from the others", () => {
    docsByStudent.set("s1", [
      doc("only", "טופס.html", 'תח"י', "2026-01-01T00:00:00.000Z"),
    ]);

    const ordered = collectDocumentsForFolders("s1", [
      "מעקב הישגים",
      'תח"י',
      "אינטגרציה טיפולית",
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["only"]);
  });

  it("matches folder names across Hebrew quote variants", () => {
    docsByStudent.set("s1", [
      doc("t", "tachi.html", "תח״י", "2026-01-01T00:00:00.000Z"),
    ]);

    const ordered = collectDocumentsForFolders("s1", ['תח"י']);
    expect(ordered.map((item) => item.id)).toEqual(["t"]);
  });

  const completedWaiverFill = {
    id: "fill-waiver",
    student_id: "s1",
    form_id: "waiver-confidentiality",
    data: {
      student_name: "יעל כהן",
      father_signature: "data:image/png;base64,AAA",
      mother_signature: "data:image/png;base64,BBB",
    },
    status: "completed" as const,
    document_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  it("does not auto-add a fill-based waiver to a personal-basket / whole-file print (TZ-81)", async () => {
    docsByStudent.set("s1", [
      doc("card", "כרטיס.html", "אינפורמציה כללית", "2026-02-01T00:00:00.000Z"),
    ]);
    fillsByStudent.set("s1", [completedWaiverFill]);

    const groups = collectFolderPrintGroups("s1", [
      "אינפורמציה כללית",
      'תח"י',
    ]);
    const filled = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const augmented = await augmentPrintGroupsWithWaiver("s1", filled, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));

    expect(ids).toContain("card");
    expect(ids.some((id) => id.startsWith("waiver-fill-"))).toBe(false);
    expect(ids.some((id) => id.startsWith("fill-print-"))).toBe(false);
  });

  it("still prints an uploaded school waiver in a personal-basket whole-file print", async () => {
    docsByStudent.set("s1", [
      doc("card", "כרטיס.html", "אינפורמציה כללית", "2026-02-01T00:00:00.000Z"),
      doc(
        "waiver-arch",
        "טופס ויתור סודיות.html",
        "אינפורמציה כללית",
        "2026-01-15T00:00:00.000Z"
      ),
    ]);
    fillsByStudent.set("s1", [completedWaiverFill]);

    const groups = collectFolderPrintGroups("s1", [
      "אינפורמציה כללית",
      'תח"י',
    ]);
    const filled = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const augmented = await augmentPrintGroupsWithWaiver("s1", filled, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));

    expect(ids).toContain("card");
    expect(ids).toContain("waiver-arch");
    expect(ids.some((id) => id.startsWith("waiver-fill-"))).toBe(false);
  });

  it("still prints the school waiver when that form folder is selected", async () => {
    docsByStudent.set("s1", [
      doc("card", "כרטיס.html", "אינפורמציה כללית", "2026-02-01T00:00:00.000Z"),
    ]);
    fillsByStudent.set("s1", [completedWaiverFill]);

    const groups = collectFolderPrintGroups("s1", ["טופס ויתור סודיות"]);
    const augmented = await augmentPrintGroupsWithWaiver("s1", groups, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));

    expect(ids[0]).toBe("waiver-fill-fill-waiver");
    expect(augmented[0]?.docs[0]?.name).toContain("ויתור סודיות");
  });

  it("does not treat ministry extra-document waivers as the school waiver", () => {
    const moe = doc(
      "moe",
      "ויתור סודיות לוועדת אפיון וזכאות.html",
      "מסמכים נוספים",
      "2026-01-01T00:00:00.000Z"
    );
    expect(isSchoolConfidentialityWaiverPrintItem(moe)).toBe(false);
    expect(
      isSchoolConfidentialityWaiverPrintItem(
        doc("school", "טופס ויתור סודיות.html", "אינפורמציה כללית", "2026-01-01T00:00:00.000Z")
      )
    ).toBe(true);
    expect(selectedFoldersIncludeSchoolWaiver(["אינפורמציה כללית", 'תח"י'])).toBe(
      false
    );
    expect(selectedFoldersIncludeSchoolWaiver(["טופס ויתור סודיות"])).toBe(true);
    expect(
      selectedFoldersIncludeSchoolWaiver([
        "אינפורמציה כללית",
        "תיעוד תהליך למידה",
        'תח"י',
        "אינטגרציה טיפולית",
        "מעקב הישגים",
      ])
    ).toBe(false);
    expect(
      shouldAutoAddSchoolWaiver(["אינפורמציה כללית", 'תח"י'])
    ).toBe(false);
    expect(shouldAutoAddSchoolWaiver(["אינפורמציה כללית"])).toBe(true);
    expect(shouldAutoAddSchoolWaiver(["טופס ויתור סודיות"])).toBe(true);
  });

  it("prints an uploaded school waiver when printing the general-info folder", async () => {
    docsByStudent.set("s1", [
      doc("card", "כרטיס.html", "אינפורמציה כללית", "2026-02-01T00:00:00.000Z"),
      doc(
        "waiver-arch",
        "טופס ויתור סודיות.html",
        "אינפורמציה כללית",
        "2026-01-15T00:00:00.000Z"
      ),
    ]);
    fillsByStudent.set("s1", [completedWaiverFill]);

    const groups = collectFolderPrintGroups("s1", ["אינפורמציה כללית"]);
    const filled = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const augmented = await augmentPrintGroupsWithWaiver("s1", filled, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));

    expect(ids).toContain("card");
    expect(ids).toContain("waiver-arch");
  });

  it("auto-adds the school waiver from a fill when printing general-info with no uploaded copy", async () => {
    docsByStudent.set("s1", [
      doc("card", "כרטיס.html", "אינפורמציה כללית", "2026-02-01T00:00:00.000Z"),
    ]);
    fillsByStudent.set("s1", [completedWaiverFill]);

    const groups = collectFolderPrintGroups("s1", ["אינפורמציה כללית"]);
    const filled = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const augmented = await augmentPrintGroupsWithWaiver("s1", filled, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));

    expect(ids).toContain("card");
    expect(
      ids.some(
        (id) => id.startsWith("waiver-fill-") || id.startsWith("fill-print-")
      )
    ).toBe(true);
  });

  it("prefers digital inclusion form over signed PDF archive in portfolio print", async () => {
    buttonsByFolder.set("מסמכים נוספים", ["הכלה"]);
    docsByStudent.set("s1", [
      doc(
        "signed-incl",
        "הכלה — תכנית הכלה והשתלבות — אסתר דמו — חתום.pdf",
        "מסמכים נוספים",
        "2026-01-01T00:00:00.000Z",
        {
          mime_type: "application/pdf",
          data_url: "data:application/pdf;base64,AAA",
          archived_at: "2026-01-02T00:00:00.000Z",
        }
      ),
    ]);
    slots.set("signed-incl", "הכלה");
    fillsByStudent.set("s1", [
      {
        id: "fill-incl",
        student_id: "s1",
        form_id: "moe-inclusion-plan",
        data: {
          full_name: "אסתר דמו",
          class_seat_physical: "true",
          teacher_signature: "data:image/png;base64,AAA",
        },
        status: "completed",
        document_id: "signed-incl",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ]);

    const groups = collectFolderPrintGroups("s1", ["מסמכים נוספים"]);
    const augmented = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const names = augmented.flatMap((group) =>
      group.docs.map((item) => item.name)
    );
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));

    expect(ids).not.toContain("signed-incl");
    expect(ids.some((id) => id.startsWith("fill-print-"))).toBe(true);
    expect(names.some((name) => /חתום\.pdf$/i.test(name))).toBe(false);
  });
});

describe("isSignedArchiveDocForForm", () => {
  it("matches SimpleSign archive naming for inclusion", () => {
    const signed = doc(
      "x",
      "הכלה — תכנית הכלה והשתלבות — אסתר דמו — חתום.pdf",
      "מסמכים נוספים",
      "2026-01-01T00:00:00.000Z",
      { mime_type: "application/pdf" }
    );
    expect(
      isSignedArchiveDocForForm(signed, {
        formTitle: "הכלה — תכנית הכלה והשתלבות",
        label: "הכלה",
        formFolder: "הכלה",
        linkedDocumentId: "x",
      })
    ).toBe(true);
  });

  it("does not treat a linked HTML form snapshot as a signed PDF (TZ-89)", () => {
    const archived = doc(
      "html-arch",
      "דף הכנה לתח\"י.html",
      'תח"י',
      "2026-01-01T00:00:00.000Z",
      { mime_type: "text/html" }
    );
    expect(
      isSignedArchiveDocForForm(archived, {
        formTitle: "דף הכנה לתח\"י (היעזרי במחוון)",
        label: "דף הכנה לתח\"י",
        formFolder: "דף הכנה לתח\"י",
        linkedDocumentId: "html-arch",
      })
    ).toBe(false);
  });
});

describe("portfolio cover page", () => {
  it("builds cover with student name and year blanks filled", () => {
    const html = buildPortfolioCoverHtml({
      studentName: "יעל כהן",
      yearLabel: 'תשפ"ו',
      kindLabel: "תיק שילוב",
      className: "ג1",
    });
    expect(html).toContain("תיק שילוב");
    expect(html).toContain("יעל כהן");
    expect(html).toContain("תשפ&quot;ו");
    expect(html).toContain("ג1");
    expect(html).toContain("לתלמיד/ה");
    expect(html).toContain("לשנה");
    expect(html).toContain("print-cover-page");
    expect(html).toContain("print-cover-logos");
  });

  it("includes school and association logos when provided", () => {
    const html = buildPortfolioCoverHtml({
      studentName: "יעל",
      yearLabel: 'תשפ"ו',
      kindLabel: "תיק שילוב",
      logos: {
        schoolLogoUrl: "data:image/png;base64,SCHOOL",
        associationLogoUrl: "data:image/png;base64,ASSOC",
        protocolLogoUrl: "data:image/png;base64,PROTO",
      },
    });
    expect(html).toContain('src="data:image/png;base64,SCHOOL"');
    expect(html).toContain('src="data:image/png;base64,ASSOC"');
    expect(html).toContain("לוגו בית הספר");
    expect(html).toContain("לוגו עמותה");
    expect(html).not.toContain("לוגו פרוטוקל");
    expect(html).not.toContain("print-cover-footer");
  });

  it("labels portfolio kind by student status", () => {
    expect(portfolioCoverKindLabel("integration")).toBe("תיק שילוב");
    expect(portfolioCoverKindLabel("personal-basket")).toBe("תיק סל אישי");
    expect(portfolioCoverKindLabel("special-ed-class")).toBe("תיק תלמיד כיתה");
    expect(portfolioCoverKindLabel(null)).toBe("תיק שילוב / סל אישי");
    expect(
      portfolioCoverKindLabel("special-ed-class", { classCurriculum: true })
    ).toBe('תל"כ');
  });

  it("builds a class-curriculum cover without student wording", () => {
    const html = buildPortfolioCoverHtml({
      studentName: "ג1",
      yearLabel: 'תשפ"ו',
      kindLabel: 'תל"כ',
      recipientLabel: "לכיתה",
      className: "ג1",
      logos: {
        schoolLogoUrl: "data:image/png;base64,SCHOOL",
        associationLogoUrl: "data:image/png;base64,ASSOC",
        protocolLogoUrl: "data:image/png;base64,PROTO",
      },
    });
    expect(html).toContain("תל&quot;כ");
    expect(html).toContain("לכיתה");
    expect(html).toContain("ג1");
    expect(html).toContain("לשנה");
    expect(html).not.toContain("לתלמיד/ה");
    expect(html).toContain("print-cover-page");
    expect(html).toContain("print-cover-logos");
    expect(html).not.toContain("print-cover-footer");
  });

  it("includes a cover for class curriculum even with one folder", () => {
    expect(shouldIncludePortfolioCover(1, false)).toBe(false);
    expect(shouldIncludePortfolioCover(2, false)).toBe(true);
    expect(shouldIncludePortfolioCover(1, true)).toBe(true);
    expect(shouldIncludePortfolioCover(0, true)).toBe(false);
  });

  it("resolves cover fields for a class-curriculum owner", () => {
    const fields = resolvePortfolioCoverFields({
      full_name: 'תל"כ — ג1',
      class_name: "ג1",
      teacher_name: "ג1",
      status: "special-ed-class",
      notes: "__matoah_class_curriculum__",
    });
    expect(fields.kindLabel).toBe('תל"כ');
    expect(fields.recipientLabel).toBe("לכיתה");
    expect(fields.displayName).toBe("ג1");
    expect(fields.className).toBeNull();
  });
});

describe("shouldSkipFolderCovers", () => {
  it("skips folder covers when includeCover is true and there is exactly one folder", () => {
    expect(shouldSkipFolderCovers(true, 1)).toBe(true);
  });

  it("does not skip folder covers when includeCover is true but there are multiple folders", () => {
    expect(shouldSkipFolderCovers(true, 2)).toBe(false);
    expect(shouldSkipFolderCovers(true, 5)).toBe(false);
  });

  it("does not skip folder covers when includeCover is false with a single folder", () => {
    expect(shouldSkipFolderCovers(false, 1)).toBe(false);
  });

  it("does not skip folder covers when includeCover is false with multiple folders", () => {
    expect(shouldSkipFolderCovers(false, 2)).toBe(false);
    expect(shouldSkipFolderCovers(false, 3)).toBe(false);
  });

  it("handles edge case of zero folders", () => {
    expect(shouldSkipFolderCovers(true, 0)).toBe(false);
    expect(shouldSkipFolderCovers(false, 0)).toBe(false);
  });
});

describe("folder cover page", () => {
  it("builds a per-folder cover with folder name and student details", () => {
    const html = buildFolderCoverHtml({
      folderName: 'תח"י',
      studentName: "יעל כהן",
      yearLabel: 'תשפ"ו',
      className: "ג1",
    });
    expect(html).toContain("print-folder-cover");
    expect(html).toContain("תח&quot;י");
    expect(html).toContain("יעל כהן");
    expect(html).toContain("ג1");
    expect(html).toContain("print-cover-page");
  });

  it("shows empty-folder note on folder cover when requested", () => {
    const html = buildFolderCoverHtml({
      folderName: "מעקב אחרי הישגי התלמיד",
      studentName: "יעל",
      yearLabel: 'תשפ"ו',
      emptyNote: true,
    });
    expect(html).toContain("מעקב אחרי הישגי התלמיד");
    expect(html).toContain("אין מסמכים בתיקייה זו");
    expect(html).not.toContain("print-folder-empty");
  });
});

describe("sanitizeEmbeddedStyles", () => {
  it("strips @page and full-page min-height that cause blank pages", () => {
    const css = `
      @page { size: A4 portrait; margin: 2.5cm; }
      .page { min-height: 297mm; width: 210mm; }
    `;
    const cleaned = sanitizeEmbeddedStyles(css);
    expect(cleaned).not.toMatch(/@page/);
    expect(cleaned).toContain("min-height:auto");
    expect(cleaned).not.toContain("min-height: 297mm");
  });

  it("strips calc-based full-page heights that cause blank pages", () => {
    const css = `
      .page { min-height: calc(297mm - 3cm); height: calc(297mm - 12mm); }
    `;
    const cleaned = sanitizeEmbeddedStyles(css);
    expect(cleaned).toContain("min-height:auto");
    expect(cleaned).toContain("height:auto");
    expect(cleaned).not.toContain("297mm");
  });

  it("strips landscape A4 heights and disables embedded page-frame", () => {
    const css = `
      body.print-schedule .page { min-height: 210mm; }
      body.print-schedule .page-frame { height: calc(210mm - 2cm); }
      .page-frame { position: fixed; inset: 0; border: 1.5pt solid #000; }
    `;
    const cleaned = sanitizeEmbeddedStyles(css);
    expect(cleaned).toContain("min-height:auto");
    expect(cleaned).toContain("height:auto");
    expect(cleaned).not.toContain("210mm");
    expect(cleaned).toContain(".page-frame{display:none!important}");
    expect(cleaned).not.toContain("position: fixed");
  });

  it("strips forced page breaks from embedded forms that cause blank pages", () => {
    const css = `
      .rq-exhaust-form { page-break-before: always; break-before: page; }
      .rq-incl-doc { page-break-before: always; break-before: page; }
      .rq-rm-parents-page { page-break-before: always; break-before: page; }
      .some-section { page-break-after: always; break-after: page; }
    `;
    const cleaned = sanitizeEmbeddedStyles(css);
    expect(cleaned).not.toContain("page-break-before: always");
    expect(cleaned).not.toContain("page-break-after: always");
    expect(cleaned).not.toContain("break-before: page");
    expect(cleaned).not.toContain("break-after: page");
    expect(cleaned).toContain("page-break-before:auto");
    expect(cleaned).toContain("page-break-after:auto");
    expect(cleaned).toContain("break-before:auto");
    expect(cleaned).toContain("break-after:auto");
  });
});

describe("detectPrintEmbedKind", () => {
  it("treats uploaded scans and office files as printable kinds", () => {
    expect(detectPrintEmbedKind("hearing.pdf", "application/pdf")).toBe("pdf");
    expect(detectPrintEmbedKind("vision.PDF")).toBe("pdf");
    expect(
      detectPrintEmbedKind(
        "diag.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("docx");
    expect(detectPrintEmbedKind("scan.jpg", "image/jpeg")).toBe("image");
  });
});

describe("buildPrintableBlock", () => {
  it("embeds an uploaded image without the fallback note", async () => {
    const image = doc("img1", "scan.jpg", "מיצוי אפשרויות", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/jpeg",
      data_url: "data:image/jpeg;base64,/9j/4AAQ",
    });
    const block = await buildPrintableBlock(image);
    expect(block?.html).toContain("print-doc-image");
    expect(block?.html).toContain("data:image/jpeg;base64,/9j/4AAQ");
    expect(block?.html).not.toContain("לא ניתן היה להציג");
  });

  it("renders converted Word HTML for an uploaded .docx", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
    );
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>מיצוי אפשרויות לפני ועדת זכאות ואפיון</w:t></w:r></w:p><w:sectPr/></w:body>
</w:document>`
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const word = doc(
      "w-ok",
      "מיצוי אפשרויות לפני ועדת זכאות ואפיון יוכבד דילאון (1).docx",
      "מיצוי אפשרויות",
      "2026-10-19T00:00:00.000Z",
      {
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data_url: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${Buffer.from(bytes).toString("base64")}`,
      }
    );
    const block = await buildPrintableBlock(word);
    expect(block?.html).toContain("print-doc-word");
    expect(block?.html).toContain("מיצוי אפשרויות לפני ועדת זכאות ואפיון");
    expect(block?.html).toContain('dir="rtl"');
    expect(block?.html).not.toContain("לא ניתן היה להציג");
  });

  it("shows the fallback note when a docx cannot be converted", async () => {
    const broken = doc(
      "w1",
      "מיצוי אפשרויות לפני ועדת זכאות ואפיון יוכבד דילאון (1).docx",
      "מיצוי אפשרויות",
      "2026-10-19T00:00:00.000Z",
      {
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data_url: "data:application/octet-stream;base64,UEsDBA==",
      }
    );
    const block = await buildPrintableBlock(broken);
    expect(block?.html).toContain(printUploadUnavailableNote("docx"));
    expect(block?.html).toContain("יוכבד דילאון");
  });

  it("leaves legacy .doc on the fallback path", async () => {
    const legacy = doc("old", "old.doc", "מיצוי אפשרויות", "2026-10-01T00:00:00.000Z", {
      mime_type: "application/msword",
      data_url: "data:application/msword;base64,0M8R4KGx",
    });
    const block = await buildPrintableBlock(legacy);
    expect(block?.html).toContain("לא ניתן היה להציג את תוכן הקובץ בהדפסה זו");
  });

  it("prints data:image/jpg (legacy non-canonical type) (#108 follow-up P1)", async () => {
    const jpg = doc("jpg1", "photo.jpg", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/jpeg",
      data_url: "data:image/jpg;base64,/9j/4AAQ",
    });
    const block = await buildPrintableBlock(jpg);
    expect(block?.html).toContain("print-doc-image");
    expect(block?.html).toContain("data:image/jpg;base64,/9j/4AAQ");
  });

  it("prints data:IMAGE/JPEG (case-insensitive) (#108 follow-up P1)", async () => {
    const jpeg = doc("jpeg1", "photo.jpeg", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/jpeg",
      data_url: "DATA:IMAGE/JPEG;base64,/9j/4AAQ",
    });
    const block = await buildPrintableBlock(jpeg);
    expect(block?.html).toContain("print-doc-image");
    expect(block?.html).toContain("DATA:IMAGE/JPEG;base64,/9j/4AAQ");
  });

  it("prints data:application/octet-stream with JPEG bytes (#108 follow-up P1)", async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    let binary = "";
    for (const byte of jpegBytes) binary += String.fromCharCode(byte);
    const dataUrl = `data:application/octet-stream;base64,${btoa(binary)}`;
    const octet = doc("octet1", "photo.jpg", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/jpeg",
      data_url: dataUrl,
    });
    const block = await buildPrintableBlock(octet);
    expect(block?.html).toContain("print-doc-image");
    expect(block?.html).toContain(dataUrl.replace(/&/g, "&amp;"));
  });

  it("prints data:image/bmp (#108 follow-up P1)", async () => {
    const bmp = doc("bmp1", "image.bmp", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/bmp",
      data_url: "data:image/bmp;base64,Qk0=",
    });
    const block = await buildPrintableBlock(bmp);
    expect(block?.html).toContain("print-doc-image");
    expect(block?.html).toContain("data:image/bmp;base64,Qk0=");
  });

  it("shows HEIC placeholder for data:application/octet-stream with HEIC bytes (#108 follow-up P1)", async () => {
    const heicBytes = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    let binary = "";
    for (const byte of heicBytes) binary += String.fromCharCode(byte);
    const dataUrl = `data:application/octet-stream;base64,${btoa(binary)}`;
    const heic = doc("heic-octet", "photo.jpg", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/jpeg",
      data_url: dataUrl,
    });
    const block = await buildPrintableBlock(heic);
    expect(block?.html).toContain("פורמט התמונה אינו נתמך בדפדפן");
    expect(block?.html).toContain("HEIC וכדומה");
    expect(block?.html).not.toContain("print-doc-image");
  });

  it("shows Hebrew placeholder for declared image/heic MIME (#108 follow-up)", async () => {
    const heic = doc("heic1", "iphone.jpg", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/heic",
      data_url: "data:image/heic;base64,AAAA",
    });
    const block = await buildPrintableBlock(heic);
    expect(block?.html).toContain("print-doc-upload");
    expect(block?.html).toContain("iphone.jpg");
    expect(block?.html).toContain("פורמט התמונה אינו נתמך בדפדפן");
    expect(block?.html).toContain("HEIC וכדומה");
    expect(block?.html).not.toContain("print-doc-image");
    expect(block?.html).not.toContain("data:image/heic");
  });

  it("shows Hebrew placeholder for declared image/heif MIME (#108 follow-up)", async () => {
    const heif = doc("heif1", "camera.heif", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/heif",
      data_url: "data:image/heif;base64,BBBB",
    });
    const block = await buildPrintableBlock(heif);
    expect(block?.html).toContain("פורמט התמונה אינו נתמך בדפדפן");
    expect(block?.html).not.toContain("data:image/heif");
  });

  it("escapes image src attribute to prevent injection (#108 follow-up)", async () => {
    const safeImage = doc("safe1", "safe.png", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/png",
      data_url: "data:image/png;base64,iVBORw0KGgo=",
    });
    const block = await buildPrintableBlock(safeImage);
    expect(block?.html).toContain("print-doc-image");
    expect(block?.html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(block?.html).toContain("safe.png");
  });

  it("does not inline javascript: URLs (#108 follow-up)", async () => {
    const malicious = doc("mal1", "evil.jpg", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/jpeg",
      data_url: "javascript:alert(1)",
    });
    const block = await buildPrintableBlock(malicious);
    expect(block?.html).toContain("לא ניתן היה לטעון את התמונה להדפסה");
    expect(block?.html).not.toContain("javascript:");
    expect(block?.html).not.toContain("print-doc-image");
  });

  it("does not inline http: URLs (#108 follow-up)", async () => {
    const httpUrl = doc("http1", "remote.jpg", "מסמכים נוספים", "2026-10-01T00:00:00.000Z", {
      mime_type: "image/jpeg",
      data_url: "http://evil.example/image.jpg",
    });
    const block = await buildPrintableBlock(httpUrl);
    expect(block?.html).toContain("לא ניתן היה לטעון את התמונה להדפסה");
    expect(block?.html).not.toContain("http://evil.example");
    expect(block?.html).not.toContain("print-doc-image");
  });
});

describe("ensureEmbeddedFormHeaderLogos", () => {
  it("injects institution logos into a form body that has an empty header", () => {
    const body = `<table class="page-sheet"><thead><tr><td><header class="doc-header"></header></td></tr></thead><tbody><tr><td>תוכן</td></tr></tbody></table>`;
    const next = ensureEmbeddedFormHeaderLogos(body, {
      schoolLogoUrl: "data:image/png;base64,SCHOOL",
      associationLogoUrl: "data:image/png;base64,ASSOC",
    });
    expect(next).toContain('src="data:image/png;base64,SCHOOL"');
    expect(next).toContain('src="data:image/png;base64,ASSOC"');
    expect(next).toContain("לוגו עמותה");
  });

  it("does not duplicate logos when the form already has them", () => {
    const body = `<header class="doc-header"><img class="logo-school" src="data:image/png;base64,OLD" alt="לוגו בית הספר" /></header>`;
    const next = ensureEmbeddedFormHeaderLogos(body, {
      associationLogoUrl: "data:image/png;base64,ASSOC",
    });
    expect(next).toBe(body);
  });
});

describe("print payload hydration (TZ-88)", () => {
  beforeEach(() => {
    docsByStudent.clear();
    slots.clear();
    buttonsByFolder.clear();
    fillsByStudent.clear();
  });

  it("keeps uploaded files without data_url in print groups so they can be loaded per-file", () => {
    docsByStudent.set("s1", [
      doc("empty", "scan.pdf", "אינפורמציה כללית", "2026-01-01T00:00:00.000Z", {
        mime_type: "application/pdf",
        data_url: "",
      }),
    ]);
    expect(
      collectDocumentsForFolders("s1", ["אינפורמציה כללית"]).map((item) => item.id)
    ).toEqual([]);
    const groups = collectFolderPrintGroups("s1", ["אינפורמציה כללית"]);
    expect(groups[0]?.docs.map((item) => item.id)).toEqual(["empty"]);
  });

  it("loads one file at a time and keeps going when a single upload fails", async () => {
    const groups = [
      {
        folder: "אינפורמציה כללית",
        docs: [
          doc("ok", "a.pdf", "אינפורמציה כללית", "2026-01-01T00:00:00.000Z", {
            mime_type: "application/pdf",
            data_url: "",
          }),
          doc("bad", "b.pdf", "אינפורמציה כללית", "2026-01-02T00:00:00.000Z", {
            mime_type: "application/pdf",
            data_url: "",
          }),
          doc("ready", "c.html", "אינפורמציה כללית", "2026-01-03T00:00:00.000Z"),
        ],
      },
    ];
    const ticks: Array<[number, number]> = [];
    const hydrated = await hydratePrintGroupPayloads(groups, {
      onProgress: (done, total) => ticks.push([done, total]),
      load: async (item) => {
        if (item.id === "bad") throw new Error("boom");
        if (item.id === "ok") {
          return { ...item, data_url: "data:application/pdf;base64,AAA" };
        }
        return item;
      },
    });
    const byId = new Map(hydrated[0]!.docs.map((item) => [item.id, item]));
    expect(byId.get("ok")?.data_url).toContain("AAA");
    expect(byId.get("bad")?.data_url).toBe("");
    expect(byId.get("ready")?.data_url).toBe("data:text/html,hi");
    expect(ticks.at(-1)).toEqual([2, 2]);
  });

  it("still hydrates a large upload after the small ones (TZ-90)", async () => {
    const groups = [
      {
        folder: "מסמכים נוספים",
        docs: [
          doc("small", "a.pdf", "מסמכים נוספים", "2026-01-01T00:00:00.000Z", {
            mime_type: "application/pdf",
            data_url: "",
            size: 20_000,
          }),
          doc("large", "hearing.pdf", "מסמכים נוספים", "2026-01-02T00:00:00.000Z", {
            mime_type: "application/pdf",
            data_url: "",
            size: 2_000_000,
          }),
        ],
      },
    ];
    const order: string[] = [];
    const hydrated = await hydratePrintGroupPayloads(groups, {
      load: async (item) => {
        order.push(item.id);
        return { ...item, data_url: `data:application/pdf;base64,${item.id}` };
      },
    });
    expect(order).toEqual(["small", "large"]);
    expect(hydrated[0]?.docs.map((item) => item.data_url)).toEqual([
      "data:application/pdf;base64,small",
      "data:application/pdf;base64,large",
    ]);
  });

  it("hydrates storage https URLs, not only empty data_url", async () => {
    const storageUrl =
      "https://proj.supabase.co/storage/v1/object/public/docs/a.pdf";
    const groups = [
      {
        folder: "מסמכים נוספים",
        docs: [
          doc("stored", "a.pdf", "מסמכים נוספים", "2026-01-01T00:00:00.000Z", {
            mime_type: "application/pdf",
            data_url: storageUrl,
          }),
        ],
      },
    ];
    const loadedIds: string[] = [];
    const hydrated = await hydratePrintGroupPayloads(groups, {
      load: async (item) => {
        loadedIds.push(item.id);
        return { ...item, data_url: "data:application/pdf;base64,AAA" };
      },
    });
    expect(loadedIds).toEqual(["stored"]);
    expect(hydrated[0]?.docs[0]?.data_url).toBe(
      "data:application/pdf;base64,AAA"
    );
  });

  it("tags a 413 payload so print can show the too-large note", async () => {
    const groups = [
      {
        folder: "מסמכים נוספים",
        docs: [
          doc("huge", "scan.pdf", "מסמכים נוספים", "2026-01-01T00:00:00.000Z", {
            mime_type: "application/pdf",
            data_url: "",
            size: 5_000_000,
          }),
        ],
      },
    ];
    const hydrated = await hydratePrintGroupPayloads(groups, {
      load: async () => {
        throw new StudentDocumentDataError("DOCUMENT_TOO_LARGE", 413);
      },
    });
    expect(hydrated[0]?.docs[0]?.mime_type).toBe(
      "application/x-matoah-too-large"
    );
  });

  it("rejects when the per-file abort deadline fires", async () => {
    vi.useFakeTimers();
    const pending = withAbortTimeout(() => new Promise(() => {}), 10);
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(15);
    await assertion;
    vi.useRealTimers();
  });

  it("drops whitespace-only print sections so they do not become header-only pages", () => {
    expect(isVisuallyEmptyPrintHtml("   ")).toBe(true);
    expect(isVisuallyEmptyPrintHtml("<section class='print-doc'>  </section>")).toBe(
      true
    );
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><h1>בדיקת שמיעה.pdf</h1><p>לא ניתן</p></section>`
      )
    ).toBe(false);
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><img src="data:image/jpeg;base64,AAA" alt="" /></section>`
      )
    ).toBe(false);
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><svg viewBox="0 0 10 10"><path d="M0 0"/></svg></section>`
      )
    ).toBe(false);
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><canvas width="20" height="10"></canvas></section>`
      )
    ).toBe(false);
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><object data="file.pdf"></object></section>`
      )
    ).toBe(false);
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><embed src="file.pdf" /></section>`
      )
    ).toBe(false);
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><iframe src="about:blank"></iframe></section>`
      )
    ).toBe(false);
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><input type="checkbox" checked /></section>`
      )
    ).toBe(false);
    expect(
      isVisuallyEmptyPrintHtml(
        `<section class="print-doc"><div style="background-image:url(data:image/png;base64,AAA)"></div></section>`
      )
    ).toBe(false);
  });

  it("describes why an uploaded file could not print without blocking the rest", () => {
    expect(printUploadUnavailableNote("missing")).toContain("לטעון את הקובץ");
    expect(printUploadUnavailableNote("pdf")).toContain("PDF");
    expect(printUploadUnavailableNote("docx")).toContain("Word");
    expect(printUploadUnavailableNote("too-large")).toBe(
      "קובץ גדול מדי להדפסה מרוכזת — הדפיסו אותו בנפרד"
    );
  });
});

describe("printStudentDocuments failure isolation (TZ-88)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      alert: vi.fn(),
      setTimeout,
      clearTimeout,
      location: { origin: "http://localhost" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still delivers the print HTML when one uploaded file has no payload", async () => {
    const delivered: string[] = [];
    const failed: string[] = [];
    const printWindow = {
      key: "k",
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
    const formHtml = "<html><body><p>טופס תקין</p></body></html>";
    const ok = await printStudentDocuments(
      [
        doc("form", "טופס.html", "אינפורמציה כללית", "2026-01-01T00:00:00.000Z", {
          mime_type: "text/html",
          data_url: `data:text/html;charset=utf-8,${encodeURIComponent(formHtml)}`,
        }),
        doc("scan", "scan.pdf", "אינפורמציה כללית", "2026-01-02T00:00:00.000Z", {
          mime_type: "application/pdf",
          data_url: "",
        }),
      ],
      "הדפסת 2 תיקיות",
      { printWindow, footerLogoUrl: "data:image/gif;base64,AA" }
    );
    expect(ok).toBe(true);
    expect(failed).toEqual([]);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain("טופס תקין");
    expect(delivered[0]).toContain("scan.pdf");
    expect(delivered[0]).toContain("לא ניתן היה לטעון את הקובץ להדפסה");
  });

  it("fails with no-content when the folder has nothing to print", async () => {
    const failed: string[] = [];
    const printWindow = {
      key: "k",
      whenReady: async () => false,
      setProgress: () => {},
      deliver: vi.fn(),
      fail: (message: string) => {
        failed.push(message);
      },
      close: vi.fn(),
      dispose: vi.fn(),
    };
    const ok = await printStudentDocuments([], "הדפסת תיקייה", {
      printWindow,
      groups: [],
    });
    expect(ok).toBe(false);
    expect(failed).toEqual([PRINT_NO_CONTENT_MESSAGE]);
  });

  it("shows a specific note when a file is too large for the print API", async () => {
    const delivered: string[] = [];
    const printWindow = {
      key: "k",
      whenReady: async () => true,
      setProgress: () => {},
      deliver: (html: string) => {
        delivered.push(html);
      },
      fail: vi.fn(),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    const formHtml = "<html><body><p>טופס תקין</p></body></html>";
    const ok = await printStudentDocuments(
      [
        doc("form", "טופס.html", "אינפורמציה כללית", "2026-01-01T00:00:00.000Z", {
          mime_type: "text/html",
          data_url: `data:text/html;charset=utf-8,${encodeURIComponent(formHtml)}`,
        }),
        doc("scan", "hearing.pdf", "אינפורמציה כללית", "2026-01-02T00:00:00.000Z", {
          mime_type: "application/x-matoah-too-large",
          data_url: "",
        }),
      ],
      "הדפסת תיק",
      { printWindow, footerLogoUrl: "data:image/gif;base64,AA" }
    );
    expect(ok).toBe(true);
    expect(delivered[0]).toContain("print-docs");
    expect(delivered[0]).toContain("print-doc-last");
    expect(delivered[0]).toContain("hearing.pdf");
    expect(delivered[0]).toContain(
      "קובץ גדול מדי להדפסה מרוכזת — הדפיסו אותו בנפרד"
    );
  });

  it("loads storage https URLs through loadDoc in full-portfolio print", async () => {
    const delivered: string[] = [];
    const loaded: string[] = [];
    const storageUrl =
      "https://proj.supabase.co/storage/v1/object/public/docs/hearing.pdf";
    const ok = await printStudentDocuments(
      [
        doc("scan", "hearing.pdf", "מסמכים נוספים", "2026-01-02T00:00:00.000Z", {
          mime_type: "application/pdf",
          data_url: storageUrl,
        }),
      ],
      "הדפסת תיק",
      {
        printWindow: {
          key: "k",
          whenReady: async () => true,
          setProgress: () => {},
          deliver: (html: string) => {
            delivered.push(html);
          },
          fail: vi.fn(),
          close: vi.fn(),
          dispose: vi.fn(),
        },
        loadDoc: async (item) => {
          loaded.push(item.id);
          return {
            ...item,
            data_url: "data:application/pdf;base64,JVBERi0=",
          };
        },
      }
    );
    expect(ok).toBe(true);
    expect(loaded).toEqual(["scan"]);
    expect(delivered[0]).toContain("hearing.pdf");
  });

  it("clears remembered print bytes after printing ends", async () => {
    rememberPrintBytes("scan", new Uint8Array([9, 8, 7]));
    expect(peekPrintBytes("scan")?.length).toBe(3);
    const formHtml = "<html><body><p>טופס תקין</p></body></html>";
    await printStudentDocuments(
      [
        doc("form", "טופס.html", "אינפורמציה כללית", "2026-01-01T00:00:00.000Z", {
          mime_type: "text/html",
          data_url: `data:text/html;charset=utf-8,${encodeURIComponent(formHtml)}`,
        }),
      ],
      "הדפסת תיק",
      {
        printWindow: {
          key: "k",
          whenReady: async () => true,
          setProgress: () => {},
          deliver: () => {},
          fail: vi.fn(),
          close: vi.fn(),
          dispose: vi.fn(),
        },
      }
    );
    expect(peekPrintBytes("scan")).toBeUndefined();
  });
});

describe("folder print table splitting (main parity)", () => {
  it("forces print-doc-body tables to split with !important, and keeps rows not tables", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/lib/student-document-print.ts"),
      "utf8"
    );
    expect(src).toMatch(
      /\.print-doc-body table \{\s*page-break-inside: auto !important;\s*break-inside: auto !important;/
    );
    expect(src).toMatch(
      /\.print-doc-body \.data-grid tr,[\s\S]*page-break-inside: avoid/
    );
    expect(src).toMatch(/\.print-docs > \.print-doc:last-child,/);
    expect(src).toContain(".print-doc.print-doc-last");
    expect(src).toContain("page-break-after: avoid !important");
    expect(src).toContain('hasPageHeader ? "22mm" : "0"');
  });
});

const PERSONAL_BASKET_FOLDERS = [
  "אינפורמציה כללית",
  "תיעוד תהליך למידה",
  'תח"י',
  "אינטגרציה טיפולית",
  "מעקב אחרי הישגי התלמיד",
  "מסמכים נוספים",
];

function htmlDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function htmlFileReaderDataUrl(html: string): string {
  return `data:text/html;base64,${Buffer.from(html, "utf8").toString("base64")}`;
}

function fakePrintWindow(delivered: string[], failed: string[]) {
  return {
    key: "tz-89",
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

describe("TZ-89 filled system forms stay in student-file print", () => {
  beforeEach(() => {
    docsByStudent.clear();
    slots.clear();
    buttonsByFolder.clear();
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

  it("prints a live fill next to an uploaded PDF in a single folder", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");
    const schema = getFormSchema("tachi-prep");
    expect(schema).toBeTruthy();
    const fillData = {
      full_name: "יעל כהן",
      strengths: "TZ89-TACHI-STRENGTH",
    };
    fillsByStudent.set("s1", [
      {
        id: "fill-tachi-prep",
        student_id: "s1",
        form_id: "tachi-prep",
        data: fillData,
        status: "completed",
        document_id: null,
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-02T00:00:00.000Z",
      },
    ]);
    docsByStudent.set("s1", [
      doc("hearing-pdf", "hearing.pdf", 'תח"י', "2026-10-01T00:00:00.000Z", {
        mime_type: "application/pdf",
        data_url: "data:application/pdf;base64,JVBERi0=",
      }),
    ]);

    const groups = collectFolderPrintGroups("s1", ['תח"י']);
    const augmented = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));
    expect(ids).toContain("hearing-pdf");
    expect(ids.some((id) => id.startsWith("fill-print-"))).toBe(true);

    const delivered: string[] = [];
    const failed: string[] = [];
    const ok = await printStudentDocuments(
      augmented.flatMap((group) => group.docs),
      "הדפסת תיקייה — תח\"י",
      { printWindow: fakePrintWindow(delivered, failed), groups: augmented }
    );
    expect(ok).toBe(true);
    expect(failed).toEqual([]);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain("print-doc-form");
    expect(delivered[0]).toContain("TZ89-TACHI-STRENGTH");
    expect(delivered[0]).toContain("hearing.pdf");
    const snapshot = buildFormSnapshotHtml(schema!, fillData, "יעל כהן");
    expect(snapshot).toContain("TZ89-TACHI-STRENGTH");
  });

  it("prints archived HTML forms and uploaded PDFs across the whole 6-folder file", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");
    const tachi = getFormSchema("tachi-prep")!;
    const exhaust = getFormSchema("moe-exhaust-options")!;
    const card = getFormSchema("personal-basket-card")!;
    const tachiHtml = buildFormSnapshotHtml(
      tachi,
      { full_name: "יעל כהן", strengths: "TZ89-WHOLE-TACHI" },
      "יעל כהן"
    );
    const exhaustHtml = buildFormSnapshotHtml(
      exhaust,
      { student_name: "יעל כהן", school_name: "TZ89-EXHAUST-SCHOOL" },
      "יעל כהן"
    );
    const cardHtml = buildFormSnapshotHtml(
      card,
      { full_name: "יעל כהן", background: "TZ89-CARD-BG" },
      "יעל כהן"
    );

    docsByStudent.set("s1", [
      doc(
        "tachi-arch",
        `${tachi.title}.html`,
        'תח"י',
        "2026-10-01T00:00:00.000Z",
        {
          mime_type: "text/html",
          data_url: htmlFileReaderDataUrl(tachiHtml),
          archived_at: "2026-10-01T00:00:00.000Z",
        }
      ),
      doc(
        "exhaust-arch",
        `${exhaust.title}.html`,
        "מיצוי אפשרויות",
        "2026-10-02T00:00:00.000Z",
        {
          mime_type: "text/html",
          data_url: htmlDataUrl(exhaustHtml),
          archived_at: "2026-10-02T00:00:00.000Z",
        }
      ),
      doc(
        "card-arch",
        `${card.title}.html`,
        "אינפורמציה כללית",
        "2026-10-03T00:00:00.000Z",
        {
          mime_type: "text/html",
          data_url: htmlDataUrl(cardHtml),
          archived_at: "2026-10-03T00:00:00.000Z",
        }
      ),
      doc(
        "hearing-pdf",
        "בדיקת שמיעה וראיה.pdf",
        "מיצוי אפשרויות",
        "2026-10-04T00:00:00.000Z",
        {
          mime_type: "application/pdf",
          data_url: "data:application/pdf;base64,JVBERi0xLjQK",
        }
      ),
    ]);
    slots.set("tachi-arch", tachi.folder);
    slots.set("exhaust-arch", exhaust.folder);
    slots.set("card-arch", card.folder);
    slots.set("hearing-pdf", "מיצוי אפשרויות");
    fillsByStudent.set("s1", [
      {
        id: "fill-tachi-prep",
        student_id: "s1",
        form_id: "tachi-prep",
        data: { full_name: "יעל כהן", strengths: "TZ89-WHOLE-TACHI" },
        status: "completed",
        document_id: "tachi-arch",
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "fill-exhaust",
        student_id: "s1",
        form_id: "moe-exhaust-options",
        data: { student_name: "יעל כהן", school_name: "TZ89-EXHAUST-SCHOOL" },
        status: "completed",
        document_id: "exhaust-arch",
        created_at: "2026-10-02T00:00:00.000Z",
        updated_at: "2026-10-02T00:00:00.000Z",
      },
      {
        id: "fill-card",
        student_id: "s1",
        form_id: "personal-basket-card",
        data: { full_name: "יעל כהן", background: "TZ89-CARD-BG" },
        status: "completed",
        document_id: "card-arch",
        created_at: "2026-10-03T00:00:00.000Z",
        updated_at: "2026-10-03T00:00:00.000Z",
      },
    ]);

    const groups = collectFolderPrintGroups("s1", PERSONAL_BASKET_FOLDERS);
    const augmented = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));
    expect(ids).toContain("hearing-pdf");
    const hasTachi =
      ids.includes("tachi-arch") ||
      ids.some((id) => id.startsWith("fill-print-fill-tachi"));
    const hasExhaust =
      ids.includes("exhaust-arch") ||
      ids.some((id) => id.startsWith("fill-print-fill-exhaust"));
    const hasCard =
      ids.includes("card-arch") ||
      ids.some((id) => id.startsWith("fill-print-fill-card"));
    expect(hasTachi).toBe(true);
    expect(hasExhaust).toBe(true);
    expect(hasCard).toBe(true);

    const delivered: string[] = [];
    const failed: string[] = [];
    const ok = await printStudentDocuments(
      augmented.flatMap((group) => group.docs),
      "הדפסת 6 תיקיות",
      { printWindow: fakePrintWindow(delivered, failed), groups: augmented }
    );
    expect(ok).toBe(true);
    expect(failed).toEqual([]);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain("print-doc-form");
    expect(delivered[0]).toContain("TZ89-WHOLE-TACHI");
    expect(delivered[0]).toContain("TZ89-EXHAUST-SCHOOL");
    expect(delivered[0]).toContain("TZ89-CARD-BG");
    expect(delivered[0]).toContain("בדיקת שמיעה וראיה.pdf");
  });

  it("does not drop filled forms when the HTML archive is metadata-only (TZ-88 reload)", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const tachi = getFormSchema("tachi-prep")!;
    docsByStudent.set("s1", [
      doc(
        "tachi-arch",
        `${tachi.title}.html`,
        'תח"י',
        "2026-10-01T00:00:00.000Z",
        {
          mime_type: "text/html",
          data_url: "",
          archived_at: "2026-10-01T00:00:00.000Z",
        }
      ),
      doc(
        "hearing-pdf",
        "hearing.pdf",
        'תח"י',
        "2026-10-02T00:00:00.000Z",
        {
          mime_type: "application/pdf",
          data_url: "data:application/pdf;base64,JVBERi0=",
        }
      ),
    ]);
    slots.set("tachi-arch", tachi.folder);
    fillsByStudent.set("s1", [
      {
        id: "fill-tachi-prep",
        student_id: "s1",
        form_id: "tachi-prep",
        data: { full_name: "יעל כהן", strengths: "TZ89-META-TACHI" },
        status: "completed",
        document_id: null,
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-01T00:00:00.000Z",
      },
    ]);

    const groups = collectFolderPrintGroups("s1", ['תח"י']);
    const augmented = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const hydrated = await hydratePrintGroupPayloads(augmented, {
      load: async (item) => item,
    });
    const ids = hydrated.flatMap((group) => group.docs.map((item) => item.id));
    expect(ids).toContain("hearing-pdf");
    expect(ids.some((id) => id.startsWith("fill-print-"))).toBe(true);

    const delivered: string[] = [];
    const failed: string[] = [];
    const ok = await printStudentDocuments(
      hydrated.flatMap((group) => group.docs),
      "הדפסת תיקייה — תח\"י",
      { printWindow: fakePrintWindow(delivered, failed), groups: hydrated }
    );
    expect(ok).toBe(true);
    expect(failed).toEqual([]);
    expect(delivered[0]).toContain("print-doc-form");
    expect(delivered[0]).toContain("TZ89-META-TACHI");
    expect(delivered[0]).toContain("hearing.pdf");
  });

  it("does not classify a filled-form HTML snapshot as pdf/other", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");
    const { looksLikeHtmlDataUrl, looksLikePdfDataUrl } = await import(
      "./student-document-print-embed"
    );
    const schema = getFormSchema("tachi-prep")!;
    const html = buildFormSnapshotHtml(
      schema,
      { full_name: "יעל כהן", strengths: "TZ89-KIND" },
      "יעל כהן"
    );
    const encoded = htmlDataUrl(html);
    const base64 = htmlFileReaderDataUrl(html);
    expect(detectPrintEmbedKind(schema.title, "text/html", encoded)).toBe(
      "html"
    );
    expect(detectPrintEmbedKind(`${schema.title}.html`, "text/html", base64)).toBe(
      "html"
    );
    expect(
      detectPrintEmbedKind(schema.title, "application/octet-stream", encoded)
    ).toBe("html");
    expect(detectPrintEmbedKind(schema.title, "", encoded)).toBe("html");
    expect(detectPrintEmbedKind(schema.title, "", base64)).toBe("html");
    expect(looksLikeHtmlDataUrl(encoded)).toBe(true);
    expect(looksLikeHtmlDataUrl(base64)).toBe(true);
    expect(looksLikePdfDataUrl(encoded)).toBe(false);
    expect(looksLikePdfDataUrl(base64)).toBe(false);
  });

  it("keeps archived schedule HTML instead of rebuilding from the live fill", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");
    const schema = getFormSchema("personal-schedule")!;
    const archivedHtml = buildFormSnapshotHtml(
      schema,
      {
        full_name: "יעל כהן",
        class_name: "ה1",
        filled_at: "2026-01-15",
        sched_sun_p1: "ARCHIVED-SCHEDULE-MATH",
      },
      "יעל כהן"
    );
    docsByStudent.set("s1", [
      doc(
        "sched-arch",
        schema.title,
        "תיעוד תהליך למידה",
        "2026-01-15T00:00:00.000Z",
        {
          mime_type: "text/html",
          data_url: htmlDataUrl(archivedHtml),
          archived_at: "2026-01-15T00:00:00.000Z",
        }
      ),
    ]);
    slots.set("sched-arch", schema.folder);
    fillsByStudent.set("s1", [
      {
        id: "fill-sched",
        student_id: "s1",
        form_id: "personal-schedule",
        data: {
          full_name: "",
          class_name: "",
          filled_at: "",
          sched_sun_p1: "LIVE-FILL-SHOULD-NOT-PRINT",
        },
        status: "completed",
        document_id: "sched-arch",
        created_at: "2026-01-15T00:00:00.000Z",
        updated_at: "2026-10-12T00:00:00.000Z",
      },
    ]);

    const groups = collectFolderPrintGroups("s1", ["תיעוד תהליך למידה"]);
    const augmented = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    const ids = augmented.flatMap((group) => group.docs.map((item) => item.id));
    expect(ids).toContain("sched-arch");
    expect(ids.some((id) => id.startsWith("fill-print-"))).toBe(false);

    const delivered: string[] = [];
    const failed: string[] = [];
    const ok = await printStudentDocuments(
      augmented.flatMap((group) => group.docs),
      "הדפסת מערכת",
      { printWindow: fakePrintWindow(delivered, failed), groups: augmented }
    );
    expect(ok).toBe(true);
    expect(failed).toEqual([]);
    expect(delivered[0]).toContain("ARCHIVED-SCHEDULE-MATH");
    expect(delivered[0]).not.toContain("LIVE-FILL-SHOULD-NOT-PRINT");
  });

  it("leaves blank notes and id_number blank on a normal printed form", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const schema = getFormSchema("functional-educational-report")!;
    fillsByStudent.set("s1", [
      {
        id: "fill-report",
        student_id: "s1",
        form_id: "functional-educational-report",
        data: { full_name: "יעל כהן", notes: "", id_number: "" },
        status: "completed",
        document_id: null,
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-12T08:30:00.000Z",
      },
    ]);
    docsByStudent.set("s1", []);
    buttonsByFolder.set("מסמכים נוספים", [schema.folder]);

    const groups = collectFolderPrintGroups("s1", ["מסמכים נוספים"]);
    const augmented = await augmentPrintGroupsWithFilledForms("s1", groups, {});
    expect(
      augmented.flatMap((group) => group.docs).some((doc) => doc.id.startsWith("fill-print-"))
    ).toBe(true);

    const delivered: string[] = [];
    const failed: string[] = [];
    const ok = await printStudentDocuments(
      augmented.flatMap((group) => group.docs),
      "הדפסת דוח",
      { printWindow: fakePrintWindow(delivered, failed), groups: augmented }
    );
    expect(ok).toBe(true);
    expect(failed).toEqual([]);
    expect(delivered[0]).not.toContain("CARD-NOTES-SHOULD-STAY-BLANK");
    expect(delivered[0]).not.toContain("000000018");
    expect(delivered[0]).not.toContain("12/10/2026");
  });

  it("does not fill waiver blanks from the student card", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");
    const schema = getFormSchema("waiver-confidentiality")!;
    const fill = {
      id: "fill-waiver-print",
      student_id: "s1",
      form_id: "waiver-confidentiality",
      data: {
        student_name: "יעל כהן",
        father_signature: "data:image/png;base64,AAA",
        mother_signature: "data:image/png;base64,BBB",
      },
      status: "completed" as const,
      document_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    const expected = buildFormSnapshotHtml(schema, fill.data, "יעל כהן");
    const printed = buildWaiverPrintDocumentFromFill(
      "s1",
      mockStudent as never,
      {},
      fill
    );
    const printedHtml = decodeURIComponent(
      printed.data_url.replace(/^data:text\/html;charset=utf-8,/, "")
    );
    expect(printedHtml).toBe(expected);
    expect(printedHtml).not.toContain("000000018");
    expect(printedHtml).not.toContain("CARD-FATHER-SHOULD-STAY-BLANK");
    expect(printedHtml).not.toContain("CARD-MOTHER-SHOULD-STAY-BLANK");
    expect(printedHtml).not.toContain("CARD-NOTES-SHOULD-STAY-BLANK");
  });
});
