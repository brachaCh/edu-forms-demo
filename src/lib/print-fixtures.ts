/**
 * Fake student-file print fixtures (TZ-101/102/103).
 * No real student data — Hebrew names here are invented demo values.
 */

import JSZip from "jszip";
import {
  SCHEDULE_DAYS,
  scheduleCellKey,
  scheduleInClassKey,
  scheduleOtherKey,
} from "@/lib/form-table-grids";
import type { Student, StudentDocument, StudentFormFill } from "@/lib/supabase/types";

export const PRINT_FIXTURE_STUDENT_ID = "print-fixture-student";

export const PRINT_FIXTURE_PDF_NAME = "מכתב רופא ADHD (1).pdf";
export const PRINT_FIXTURE_PDF_MULTI_NAME = "אבחון רב-עמודי (טיוטה).pdf";
export const PRINT_FIXTURE_DOCX_NAME = "סיכום ועדה חינוכית (טיוטה).docx";
export const PRINT_FIXTURE_IMAGE_NAME = "צילום אישור שילוב.png";

function pdfSafeTitle(title: string): string {
  return title.replace(/[()\\]/g, " ");
}

function pdfPageContentStream(title: string): string {
  return `BT /F1 18 Tf 72 720 Td (${pdfSafeTitle(title)}) Tj ET`;
}

/** Minimal single-page PDF. `pageCount` > 1 builds extra pages with "… pN" titles. */
export function buildMinimalPdfBytes(
  title = "ADHD letter",
  pageCount = 1
): Uint8Array {
  const pages = Math.max(1, Math.min(pageCount, 40));
  const pageObjs: string[] = [];
  const kids: string[] = [];
  let nextId = 3;
  const fontId = 3 + pages * 2;
  for (let i = 0; i < pages; i += 1) {
    const pageId = nextId;
    const contentId = nextId + 1;
    nextId += 2;
    kids.push(`${pageId} 0 R`);
    const label = pages === 1 ? title : `${title} p${i + 1}`;
    const stream = pdfPageContentStream(label);
    pageObjs.push(
      `${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>endobj`,
      `${contentId} 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj`
    );
  }
  const body = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages} >>endobj
${pageObjs.join("\n")}
${fontId} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
trailer<< /Root 1 0 R >>
%%EOF
`;
  return new TextEncoder().encode(body);
}

export function pdfBytesToDataUrl(bytes: Uint8Array): string {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

/** Tiny 8×8 teal PNG used as an uploaded image in the print fixture. */
export const PRINT_FIXTURE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAIElEQVQYV2NkYGD4z0AEYCJHDZwKRg0cNXDUwFEDQQwEAJ0vAQF8xQ6qAAAAAElFTkSuQmCC";

export async function buildMinimalDocxDataUrl(paragraph: string): Promise<string> {
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
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${Buffer.from(bytes).toString("base64")}`;
}

export function buildPersonalScheduleFillData(studentName: string): Record<string, string> {
  const data: Record<string, string> = {
    full_name: "",
    class_name: "",
    filled_at: "",
  };
  const subjects: Record<string, string> = {
    sun_1: "חשבון",
    sun_2: "עברית",
    mon_1: "מדעים",
    mon_3: "אנגלית",
    tue_2: "תנ״ך",
    wed_1: "חינוך גופני",
    wed_4: "אומנות",
    thu_2: "מוזיקה",
    fri_1: "שיחה",
  };
  for (const day of SCHEDULE_DAYS) {
    for (const period of [1, 2, 3, 4, 5, 6, 7] as const) {
      const key = `${day.key}_${period}`;
      const subject = subjects[key] ?? "";
      data[scheduleCellKey(day.key, period)] = subject;
      if (subject && period <= 2) {
        data[scheduleInClassKey(day.key, period)] = "1";
      }
      if (key === "mon_3" || key === "wed_4") {
        data[scheduleOtherKey(day.key, period)] = "1";
      }
    }
  }
  void studentName;
  return data;
}

export function buildPrintFixtureStudent(): Student {
  return {
    id: PRINT_FIXTURE_STUDENT_ID,
    institution_id: "fixture-institution",
    category: "schools",
    full_name: "נועה דמו",
    phone: null,
    father_name: null,
    mother_name: null,
    status: "personal-basket",
    class_name: "ד׳2",
    teacher_name: "מורה דמו",
    notes: null,
    calendar_year: 2026,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-10-12T00:00:00.000Z",
  };
}

export function fixtureDocument(
  id: string,
  name: string,
  folder: string,
  extra: Partial<StudentDocument>
): StudentDocument {
  return {
    id,
    student_id: PRINT_FIXTURE_STUDENT_ID,
    name,
    folder,
    mime_type: extra.mime_type ?? "application/octet-stream",
    size: extra.size ?? extra.data_url?.length ?? 10,
    data_url: extra.data_url ?? "",
    uploaded_at: extra.uploaded_at ?? "2026-10-01T00:00:00.000Z",
    archived_at: extra.archived_at ?? null,
    calendar_year: 2026,
    ...extra,
  };
}

export async function buildPrintFixtureUploads(): Promise<{
  pdf: StudentDocument;
  docx: StudentDocument;
  image: StudentDocument;
  scheduleFill: StudentFormFill;
  student: Student;
}> {
  const student = buildPrintFixtureStudent();
  const pdfBytes = buildMinimalPdfBytes("ADHD letter (1)");
  const docxUrl = await buildMinimalDocxDataUrl(
    "סיכום ועדה — מסמך בדיקה להדפסת תיק"
  );
  return {
    student,
    pdf: fixtureDocument(
      "fixture-pdf-adhd",
      PRINT_FIXTURE_PDF_NAME,
      "מסמכים נוספים",
      {
        mime_type: "application/pdf",
        data_url: pdfBytesToDataUrl(pdfBytes),
        size: pdfBytes.byteLength,
      }
    ),
    docx: fixtureDocument(
      "fixture-docx-committee",
      PRINT_FIXTURE_DOCX_NAME,
      "מסמכים נוספים",
      {
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data_url: docxUrl,
        size: 2048,
      }
    ),
    image: fixtureDocument(
      "fixture-image-approval",
      PRINT_FIXTURE_IMAGE_NAME,
      "מסמכים נוספים",
      {
        mime_type: "image/png",
        data_url: PRINT_FIXTURE_PNG_DATA_URL,
        size: 80,
      }
    ),
    scheduleFill: {
      id: "fixture-schedule-fill",
      student_id: PRINT_FIXTURE_STUDENT_ID,
      form_id: "personal-schedule",
      data: buildPersonalScheduleFillData(student.full_name),
      status: "completed",
      document_id: null,
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-10-12T00:00:00.000Z",
    },
  };
}
