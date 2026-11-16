import { describe, expect, it } from "vitest";
import { FORM_SCHEMAS, getFormSchema } from "./form-schemas";
import { buildFormSnapshotHtml, formSnapshotToFile } from "./form-snapshot";
import {
  assertAllowedArchiveSnapshotUpload,
  assertAllowedUpload,
  decodeUploadDataUrlToText,
  estimateDataUrlCharLength,
  fileExceedsDataUrlBodyLimit,
  fileExceedsUploadLimits,
  formatUploadLimitLabel,
  isFormSnapshotHtml,
  MAX_EFFECTIVE_UPLOAD_BYTES,
  MAX_SAFE_UPLOAD_BODY_CHARS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_DATA_URL_CHARS,
  MAX_UPLOAD_MB,
  messageForUploadError,
  needsDirectStorageUpload,
  resolveUploadStorage,
} from "./upload-guard";
import { MAX_DOCUMENT_SIZE_BYTES } from "./mock-store";

function fileToDataUrl(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${file.type || "text/html"};base64,${btoa(binary)}`;
  });
}

function htmlToDataUrl(html: string): string {
  const bytes = new TextEncoder().encode(html);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:text/html;base64,${btoa(binary)}`;
}

function personalBasketSnapshot(): string {
  const schema = getFormSchema("personal-basket-card");
  if (!schema) throw new Error("missing personal-basket-card");
  return buildFormSnapshotHtml(schema, { full_name: "תלמיד בדיקה" }, "תלמיד בדיקה");
}

function injectBeforeBodyEnd(html: string, payload: string): string {
  const idx = html.lastIndexOf("</body>");
  if (idx < 0) throw new Error("snapshot missing </body>");
  return `${html.slice(0, idx)}${payload}${html.slice(idx)}`;
}

describe("assertAllowedUpload", () => {
  it("uses the shared 25MB stored-file cap and keeps the Vercel body budget (TZ-139)", () => {
    expect(MAX_UPLOAD_MB).toBe(25);
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_EFFECTIVE_UPLOAD_BYTES).toBe(
      Math.floor((MAX_SAFE_UPLOAD_BODY_CHARS - 256) * (3 / 4))
    );
    expect(MAX_SAFE_UPLOAD_BODY_CHARS).toBeLessThan(MAX_UPLOAD_DATA_URL_CHARS);
    expect(formatUploadLimitLabel()).toBe("25MB");
    expect(formatUploadLimitLabel(MAX_EFFECTIVE_UPLOAD_BYTES)).toBe("3.3MB");
    expect(estimateDataUrlCharLength(MAX_UPLOAD_BYTES)).toBeGreaterThan(
      MAX_SAFE_UPLOAD_BODY_CHARS
    );
  });

  it("TZ-139: mock-store document cap uses the advertised 25MB constant", () => {
    expect(MAX_DOCUMENT_SIZE_BYTES).toBe(MAX_UPLOAD_BYTES);
  });

  it("TZ-139: Hebrew hint/error state the 25MB maximum before upload", () => {
    expect(fileExceedsUploadLimits({ size: 4 * 1024 * 1024 })).toBe(false);
    expect(fileExceedsUploadLimits({ size: 26 * 1024 * 1024 })).toBe(true);
    expect(
      assertAllowedUpload({
        name: "scan.pdf",
        mimeType: "application/pdf",
        size: 20 * 1024 * 1024,
      })
    ).toEqual({ ok: true });
    expect(
      assertAllowedUpload({
        name: "scan.pdf",
        mimeType: "application/pdf",
        size: 26 * 1024 * 1024,
      })
    ).toEqual({ ok: false, error: "FILE_TOO_LARGE" });
    expect(formatUploadLimitLabel()).toBe("25MB");
    expect(
      messageForUploadError(
        new Error("FILE_TOO_LARGE"),
        `הקובץ גדול מדי (מקסימום ${formatUploadLimitLabel()})`
      )
    ).toBe("הקובץ גדול מדי (מקסימום 25MB)");
  });

  it("accepts a pdf under the size limit", () => {
    expect(
      assertAllowedUpload({
        name: "a.pdf",
        mimeType: "application/pdf",
        size: 1024,
      })
    ).toEqual({ ok: true });
  });

  it("accepts a diagnostic pdf that still fits the Vercel data-URL body", () => {
    expect(
      assertAllowedUpload({
        name: "diagnosis.pdf",
        mimeType: "application/pdf",
        size: 3 * 1024 * 1024 - 1,
      })
    ).toEqual({ ok: true });
  });

  it("rejects files over the 25MB stored-file cap", () => {
    const result = assertAllowedUpload({
      name: "a.pdf",
      mimeType: "application/pdf",
      size: 26 * 1024 * 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FILE_TOO_LARGE");
  });

  it("accepts a 4–20MB file by size, and routes it to Storage instead of a data-URL POST", () => {
    expect(
      assertAllowedUpload({
        name: "a.pdf",
        mimeType: "application/pdf",
        size: 4 * 1024 * 1024,
      })
    ).toEqual({ ok: true });
    expect(needsDirectStorageUpload({ size: 4 * 1024 * 1024 })).toBe(true);
    expect(needsDirectStorageUpload({ size: 20 * 1024 * 1024 })).toBe(true);
    expect(needsDirectStorageUpload({ size: 2 * 1024 * 1024 })).toBe(false);
    expect(needsDirectStorageUpload({ size: 26 * 1024 * 1024 })).toBe(false);
  });

  it("rejects a data URL that would exceed the Vercel 4.5MB body", () => {
    const oversized = `data:application/pdf;base64,${"A".repeat(MAX_SAFE_UPLOAD_BODY_CHARS)}`;
    expect(
      assertAllowedUpload({
        name: "a.pdf",
        mimeType: "application/pdf",
        size: 4 * 1024 * 1024,
        dataUrl: oversized,
      })
    ).toEqual({ ok: false, error: "FILE_TOO_LARGE" });
  });

  it("keeps the Vercel data-URL body budget separate from the 25MB file cap", () => {
    expect(fileExceedsUploadLimits({ size: 3 * 1024 * 1024 })).toBe(false);
    expect(fileExceedsUploadLimits({ size: 4 * 1024 * 1024 })).toBe(false);
    expect(fileExceedsDataUrlBodyLimit({ size: 3 * 1024 * 1024 })).toBe(false);
    expect(fileExceedsDataUrlBodyLimit({ size: 4 * 1024 * 1024 })).toBe(true);
    expect(
      fileExceedsDataUrlBodyLimit({
        size: Math.ceil((MAX_SAFE_UPLOAD_BODY_CHARS - 256) * 0.75) + 1,
      })
    ).toBe(true);
  });

  it("does not label every upload failure as too-large", () => {
    expect(
      messageForUploadError(new Error("FILE_TYPE_NOT_ALLOWED"), "גדול מדי")
    ).toContain("סוג הקובץ");
    expect(
      messageForUploadError(new Error("PAPER_WAIVER_TYPE_NOT_ALLOWED"), "גדול מדי")
    ).toContain("נכשלה");
    expect(messageForUploadError(new Error("EMPTY_FILE"), "גדול מדי")).toBe(
      "לא נבחר קובץ"
    );
    expect(messageForUploadError(new Error("FILE_TOO_LARGE"), "גדול מדי")).toBe(
      "גדול מדי"
    );
    expect(messageForUploadError(new Error("network"), "גדול מדי")).toContain(
      "נכשלה"
    );
  });

  it("treats HTTP 413 as FILE_TOO_LARGE", () => {
    expect(messageForUploadError(new Error("413"), "גדול מדי")).toBe(
      "גדול מדי"
    );
    expect(
      messageForUploadError(new Error("TENANT_OP_FAILED:413"), "גדול מדי")
    ).toBe("גדול מדי");
    expect(
      messageForUploadError(new Error("Payload Too Large"), "גדול מדי")
    ).toBe("גדול מדי");
  });

  it("rejects executable types", () => {
    const result = assertAllowedUpload({
      name: "x.exe",
      mimeType: "application/x-msdownload",
      size: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FILE_TYPE_NOT_ALLOWED");
  });

  it("rejects empty files", () => {
    const result = assertAllowedUpload({
      name: "a.pdf",
      mimeType: "application/pdf",
      size: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("EMPTY_FILE");
  });

  it("rejects HTML on the global upload path (insertStudentDocument)", () => {
    expect(
      assertAllowedUpload({
        name: "כרטיס תלמיד סל אישי.html",
        mimeType: "text/html",
        size: 2048,
        dataUrl: htmlToDataUrl("<html></html>"),
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "form.html",
        mimeType: "text/html;charset=utf-8",
        size: 512,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "page.htm",
        mimeType: "text/plain",
        size: 64,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "notes.pdf",
        mimeType: "text/html",
        size: 64,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("accepts PDF, images, docx and xlsx when declared and data-URL types are allowlisted", () => {
    expect(
      assertAllowedUpload({
        name: "a.pdf",
        mimeType: "application/pdf",
        size: 12,
        dataUrl: "data:application/pdf;base64,JVBERi0=",
      })
    ).toEqual({ ok: true });
    expect(
      assertAllowedUpload({
        name: "photo.PNG",
        mimeType: "IMAGE/PNG",
        size: 12,
        dataUrl: "data: IMAGE/PNG ;base64,iVBORw0KGgo=",
      })
    ).toEqual({ ok: true });
    expect(
      assertAllowedUpload({
        name: "notes.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 12,
        dataUrl:
          "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs=",
      })
    ).toEqual({ ok: true });
    expect(
      assertAllowedUpload({
        name: "sheet.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 12,
        dataUrl:
          "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEs=",
      })
    ).toEqual({ ok: true });
  });

  it("rejects a typeless data URL with an xml declared type and a .pdf name", () => {
    const xhtml = `<html xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></html>`;
    expect(
      assertAllowedUpload({
        name: "report.pdf",
        mimeType: "application/rss+xml",
        size: xhtml.length,
        dataUrl: `data:;base64,${btoa(xhtml)}`,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("rejects text/xsl and application/xslt+xml even with a .pdf name", () => {
    expect(
      assertAllowedUpload({
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 32,
        dataUrl: "data:text/xsl;base64,PHhzbA==",
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "report.pdf",
        mimeType: "application/xslt+xml",
        size: 32,
        dataUrl: "data:application/xslt+xml;base64,PHhzbA==",
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("does not accept a dangerous declared type just because the name is .pdf", () => {
    expect(
      assertAllowedUpload({
        name: "report.pdf",
        mimeType: "application/rss+xml",
        size: 64,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("accepts a docx with empty type and an octet-stream data URL as the docx MIME", () => {
    const stored = resolveUploadStorage({
      name: "notes.docx",
      mimeType: "",
      size: 16,
      dataUrl: "data:application/octet-stream;base64,UEs=",
    });
    expect(stored).toEqual({
      ok: true,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      dataUrl:
        "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs=",
    });
  });

  it("accepts a pdf with octet-stream type and payload as application/pdf", () => {
    const stored = resolveUploadStorage({
      name: "scan.pdf",
      mimeType: "application/octet-stream",
      size: 16,
      dataUrl: "data:application/octet-stream;base64,JVBERi0=",
    });
    expect(stored).toEqual({
      ok: true,
      mimeType: "application/pdf",
      dataUrl: "data:application/pdf;base64,JVBERi0=",
    });
  });

  it("accepts a 4MB file after extension→MIME mapping (Storage path, TZ-139)", () => {
    expect(
      resolveUploadStorage({
        name: "scan.pdf",
        mimeType: "application/octet-stream",
        size: 4 * 1024 * 1024,
      })
    ).toEqual({
      ok: true,
      mimeType: "application/pdf",
      dataUrl: null,
    });
    expect(fileExceedsUploadLimits({ size: 4 * 1024 * 1024 })).toBe(false);
    expect(needsDirectStorageUpload({ size: 4 * 1024 * 1024 })).toBe(true);
  });

  it("accepts a storage:// ref for a large PDF without treating it as a data-URL body", () => {
    const dataUrl =
      "storage://student-documents/inst-1/student-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf";
    expect(
      resolveUploadStorage({
        name: "scan.pdf",
        mimeType: "application/pdf",
        size: 12 * 1024 * 1024,
        dataUrl,
      })
    ).toEqual({
      ok: true,
      mimeType: "application/pdf",
      dataUrl,
    });
  });

  it("still rejects evil.html and x.svg when type is empty", () => {
    expect(
      assertAllowedUpload({
        name: "evil.html",
        mimeType: "",
        size: 16,
        dataUrl: "data:application/octet-stream;base64,PGh0bWw+",
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "x.svg",
        mimeType: "",
        size: 16,
        dataUrl: "data:;base64,PHN2Zz4=",
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("rejects dangerous extensions even with a png declared type and payload", () => {
    const png = "data:image/png;base64,AAAA";
    for (const name of [
      "x.xhtml",
      "x.xml",
      "x.mht",
      "x.shtml",
      "x.svgz",
      "x.js",
    ]) {
      expect(
        assertAllowedUpload({
          name,
          mimeType: "image/png",
          size: 8,
          dataUrl: png,
        }),
        name
      ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    }
  });

  it("rejects a PDF/Word name whose payload magic does not match", () => {
    expect(
      assertAllowedUpload({
        name: "scan.pdf",
        mimeType: "application/pdf",
        size: 8,
        dataUrl: "data:application/pdf;base64,TVoAAA==",
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "notes.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 8,
        dataUrl:
          "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,TVoAAA==",
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("accepts PDF, PNG and Word payloads with matching magic bytes", () => {
    expect(
      assertAllowedUpload({
        name: "scan.pdf",
        mimeType: "application/pdf",
        size: 8,
        dataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
      })
    ).toEqual({ ok: true });
    expect(
      assertAllowedUpload({
        name: "photo.png",
        mimeType: "image/png",
        size: 8,
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      })
    ).toEqual({ ok: true });
    expect(
      assertAllowedUpload({
        name: "letter.doc",
        mimeType: "application/msword",
        size: 8,
        dataUrl: "data:application/msword;base64,0M8R4KGxGuE=",
      })
    ).toEqual({ ok: true });
  });

  it("accepts image-family files whose extension and magic disagree, and stores the true type", () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
    const heic = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    const toUrl = (mime: string, bytes: Uint8Array) => {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:${mime};base64,${btoa(binary)}`;
    };

    expect(
      resolveUploadStorage({
        name: "photo.jpg",
        mimeType: "image/jpeg",
        size: png.length,
        dataUrl: toUrl("image/jpeg", png),
      })
    ).toEqual({
      ok: true,
      mimeType: "image/png",
      dataUrl: toUrl("image/png", png),
    });
    expect(
      resolveUploadStorage({
        name: "photo.png",
        mimeType: "image/png",
        size: jpeg.length,
        dataUrl: toUrl("image/png", jpeg),
      })
    ).toEqual({
      ok: true,
      mimeType: "image/jpeg",
      dataUrl: toUrl("image/jpeg", jpeg),
    });
    expect(
      resolveUploadStorage({
        name: "img.jpg",
        mimeType: "image/jpeg",
        size: heic.length,
        dataUrl: toUrl("image/jpeg", heic),
      })
    ).toEqual({
      ok: true,
      mimeType: "image/heic",
      dataUrl: toUrl("image/heic", heic),
    });
  });

  it("stores HEIF images with corrected MIME and proper allowlist membership (#108 follow-up)", () => {
    const heif = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x66,
    ]);
    const toUrl = (mime: string, bytes: Uint8Array) => {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:${mime};base64,${btoa(binary)}`;
    };

    const stored = resolveUploadStorage({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      size: heif.length,
      dataUrl: toUrl("image/jpeg", heif),
    });
    expect(stored).toEqual({
      ok: true,
      mimeType: "image/heif",
      dataUrl: toUrl("image/heif", heif),
    });
  });

  it("accepts Word/Excel family files whose extension and magic disagree", () => {
    const ole = Uint8Array.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ]);
    const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
    const rtf = Uint8Array.from([0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31]);
    const toUrl = (mime: string, bytes: Uint8Array) => {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:${mime};base64,${btoa(binary)}`;
    };
    const docx =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const xlsx =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    expect(
      resolveUploadStorage({
        name: "letter.doc",
        mimeType: "application/msword",
        size: zip.length,
        dataUrl: toUrl("application/msword", zip),
      })
    ).toEqual({
      ok: true,
      mimeType: docx,
      dataUrl: toUrl(docx, zip),
    });
    expect(
      resolveUploadStorage({
        name: "letter.docx",
        mimeType: docx,
        size: ole.length,
        dataUrl: toUrl(docx, ole),
      })
    ).toEqual({
      ok: true,
      mimeType: "application/msword",
      dataUrl: toUrl("application/msword", ole),
    });
    expect(
      resolveUploadStorage({
        name: "letter.doc",
        mimeType: "application/msword",
        size: rtf.length,
        dataUrl: toUrl("application/msword", rtf),
      })
    ).toEqual({
      ok: true,
      mimeType: "application/rtf",
      dataUrl: toUrl("application/rtf", rtf),
    });
    expect(
      resolveUploadStorage({
        name: "sheet.xls",
        mimeType: "application/vnd.ms-excel",
        size: zip.length,
        dataUrl: toUrl("application/vnd.ms-excel", zip),
      })
    ).toEqual({
      ok: true,
      mimeType: xlsx,
      dataUrl: toUrl(xlsx, zip),
    });
  });

  it("rejects files named x.rtf, x.heic, x.heif — extensions not widened (#108 follow-up)", () => {
    expect(
      assertAllowedUpload({
        name: "x.rtf",
        mimeType: "application/rtf",
        size: 100,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "x.heic",
        mimeType: "image/heic",
        size: 100,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "x.heif",
        mimeType: "image/heif",
        size: 100,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("still accepts .jpg→HEIC and .doc→RTF via magic correction (#108 follow-up)", () => {
    const heic = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    const rtf = Uint8Array.from([0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31]);
    const toUrl = (mime: string, bytes: Uint8Array) => {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:${mime};base64,${btoa(binary)}`;
    };

    const jpgToHeic = resolveUploadStorage({
      name: "iphone-photo.jpg",
      mimeType: "image/jpeg",
      size: heic.length,
      dataUrl: toUrl("image/jpeg", heic),
    });
    expect(jpgToHeic).toEqual({
      ok: true,
      mimeType: "image/heic",
      dataUrl: toUrl("image/heic", heic),
    });

    const docToRtf = resolveUploadStorage({
      name: "letter.doc",
      mimeType: "application/msword",
      size: rtf.length,
      dataUrl: toUrl("application/msword", rtf),
    });
    expect(docToRtf).toEqual({
      ok: true,
      mimeType: "application/rtf",
      dataUrl: toUrl("application/rtf", rtf),
    });
  });

  it("accepts a PDF with %PDF at offset 500", () => {
    const bytes = new Uint8Array(504);
    bytes[500] = 0x25;
    bytes[501] = 0x50;
    bytes[502] = 0x44;
    bytes[503] = 0x46;
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const dataUrl = `data:application/pdf;base64,${btoa(binary)}`;
    expect(
      resolveUploadStorage({
        name: "scan.pdf",
        mimeType: "application/pdf",
        size: bytes.length,
        dataUrl,
      })
    ).toEqual({
      ok: true,
      mimeType: "application/pdf",
      dataUrl,
    });
  });

  it("rejects an extension that does not match the MIME family", () => {
    expect(
      assertAllowedUpload({
        name: "report.pdf",
        mimeType: "image/png",
        size: 8,
        dataUrl: "data:image/png;base64,AAAA",
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("accepts a case-insensitive DATA: PDF payload", () => {
    expect(
      assertAllowedUpload({
        name: "a.pdf",
        mimeType: "application/pdf",
        size: 12,
        dataUrl: "DATA:application/pdf;base64,JVBERi0=",
      })
    ).toEqual({ ok: true });
  });

  it("rejects HTML/SVG by the real data-URL type even when name and MIME look allowed", () => {
    const html = htmlToDataUrl("<script>alert(1)</script>");
    const svg = `data:image/svg+xml;base64,${btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`
    )}`;
    expect(
      assertAllowedUpload({
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 128,
        dataUrl: html,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedUpload({
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 128,
        dataUrl: svg,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("rejects the personal-basket snapshot on the generic upload guard", async () => {
    const schema = getFormSchema("personal-basket-card");
    expect(schema).toBeTruthy();
    const file = formSnapshotToFile(
      schema!,
      { full_name: "תלמיד בדיקה" },
      "תלמיד בדיקה"
    );
    expect(
      assertAllowedUpload({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl: await fileToDataUrl(file),
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });
});

describe("isFormSnapshotHtml allowlist", () => {
  it("rejects <img/onerror=alert(1) src=x>", () => {
    const html = injectBeforeBodyEnd(
      personalBasketSnapshot(),
      `<img/onerror=alert(1) src=x>`
    );
    expect(isFormSnapshotHtml(html)).toBe(false);
  });

  it("rejects <svg/onload=...>", () => {
    const html = injectBeforeBodyEnd(
      personalBasketSnapshot(),
      `<svg/onload=alert(1)><circle r="1" /></svg>`
    );
    expect(isFormSnapshotHtml(html)).toBe(false);
  });

  it("rejects <meta http-equiv=refresh ...>", () => {
    const html = injectBeforeBodyEnd(
      personalBasketSnapshot(),
      `<meta http-equiv=refresh content="0;url=https://evil.example">`
    );
    expect(isFormSnapshotHtml(html)).toBe(false);
  });

  it("rejects href=\"&#106;avascript:...\" and &#x6a;avascript:", () => {
    const decimal = injectBeforeBodyEnd(
      personalBasketSnapshot(),
      `<a href="&#106;avascript:alert(1)">x</a>`
    );
    const hex = injectBeforeBodyEnd(
      personalBasketSnapshot(),
      `<img src="&#x6a;avascript:alert(1)">`
    );
    expect(isFormSnapshotHtml(decimal)).toBe(false);
    expect(isFormSnapshotHtml(hex)).toBe(false);
  });

  it("rejects <form action=...>", () => {
    const html = injectBeforeBodyEnd(
      personalBasketSnapshot(),
      `<form action="https://evil.example"><input type="hidden" name="x" /></form>`
    );
    expect(isFormSnapshotHtml(html)).toBe(false);
  });

  it("allows an SVG logo data URI as img src only", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>`;
    const src = `data:image/svg+xml;base64,${btoa(svg)}`;
    const html = injectBeforeBodyEnd(
      personalBasketSnapshot(),
      `<img class="logo-moe" src="${src}" alt="x" decoding="sync" />`
    );
    expect(isFormSnapshotHtml(html)).toBe(true);
  });

  it("rejects base64 SVG with onload in CSS background url()", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>`;
    const uri = `data:image/svg+xml;base64,${btoa(svg)}`;
    const html = injectBeforeBodyEnd(
      personalBasketSnapshot(),
      `<div class="x" style="background:url(${uri})"></div>`
    );
    expect(isFormSnapshotHtml(html)).toBe(false);
  });
});

describe("assertAllowedArchiveSnapshotUpload", () => {
  it("accepts formSnapshotToFile output for כרטיס תלמיד סל אישי", async () => {
    const schema = getFormSchema("personal-basket-card");
    expect(schema).toBeTruthy();
    const file = formSnapshotToFile(
      schema!,
      { full_name: "תלמיד בדיקה" },
      "תלמיד בדיקה"
    );
    const dataUrl = await fileToDataUrl(file);
    expect(file.name).toBe("כרטיס תלמיד סל אישי.html");
    expect(file.type).toBe("text/html");
    expect(
      assertAllowedArchiveSnapshotUpload({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl,
      })
    ).toEqual({ ok: true });
    const html = decodeUploadDataUrlToText(dataUrl);
    expect(html && isFormSnapshotHtml(html)).toBe(true);
  });

  it("accepts formSnapshotToFile output for other real snapshot forms", async () => {
    expect(FORM_SCHEMAS.length).toBeGreaterThan(10);
    for (const schema of FORM_SCHEMAS) {
      const file = formSnapshotToFile(
        schema,
        { full_name: "תלמיד בדיקה" },
        "תלמיד בדיקה"
      );
      const dataUrl = await fileToDataUrl(file);
      const html = decodeUploadDataUrlToText(dataUrl);
      expect(html && isFormSnapshotHtml(html), schema.id).toBe(true);
      expect(
        assertAllowedArchiveSnapshotUpload({
          name: file.name,
          mimeType: file.type,
          size: file.size,
          dataUrl,
        }),
        schema.id
      ).toEqual({ ok: true });
    }
  });

  it("requires a non-empty data_url that decodes as snapshot HTML", () => {
    expect(
      assertAllowedArchiveSnapshotUpload({
        name: "כרטיס תלמיד סל אישי.html",
        mimeType: "text/html",
        size: 2048,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
    expect(
      assertAllowedArchiveSnapshotUpload({
        name: "כרטיס תלמיד סל אישי.html",
        mimeType: "text/html",
        size: 2048,
        dataUrl: "",
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("rejects arbitrary HTML even with a snapshot-looking filename", () => {
    const payload = `<!DOCTYPE html><html><body><script>alert(1)</script></body></html>`;
    const dataUrl = `data:text/html;base64,${btoa(payload)}`;
    expect(
      assertAllowedArchiveSnapshotUpload({
        name: "כרטיס תלמיד סל אישי.html",
        mimeType: "text/html",
        size: payload.length,
        dataUrl,
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("accepts formSnapshotToFile output when the school logo is SVG", async () => {
    const schema = getFormSchema("personal-basket-card");
    expect(schema).toBeTruthy();
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#0b3d91"/></svg>`;
    const schoolLogoUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
    const file = formSnapshotToFile(
      schema!,
      { full_name: "תלמיד בדיקה" },
      "תלמיד בדיקה",
      { schoolLogoUrl }
    );
    const dataUrl = await fileToDataUrl(file);
    expect(decodeUploadDataUrlToText(dataUrl)).toContain(schoolLogoUrl);
    expect(
      assertAllowedArchiveSnapshotUpload({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl,
      })
    ).toEqual({ ok: true });
  });

  it("rejects a non-snapshot filename on the archive path", async () => {
    const schema = getFormSchema("personal-basket-card");
    const file = formSnapshotToFile(
      schema!,
      { full_name: "תלמיד בדיקה" },
      "תלמיד בדיקה"
    );
    expect(
      assertAllowedArchiveSnapshotUpload({
        name: "xss.html",
        mimeType: "text/html",
        size: file.size,
        dataUrl: await fileToDataUrl(file),
      })
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });
});
