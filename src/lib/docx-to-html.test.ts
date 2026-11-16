/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  convertDocxBytesToHtml,
  looksLikeDocxZip,
  MAX_PRINT_HTML_CHARS,
  sanitizeMammothHtml,
} from "./docx-to-html";
import { convertDocxDataUrlToHtml } from "./student-document-print-embed";
import { MAX_UPLOAD_BYTES } from "./upload-guard";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function makeDocx(options: {
  paragraphs?: string[];
  hyperlink?: { text: string; href: string };
}): Promise<Uint8Array> {
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

  const rels: string[] = [];
  const extra: string[] = [];
  if (options.hyperlink) {
    rels.push(
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(options.hyperlink.href)}" TargetMode="External"/>`
    );
    extra.push(
      `<w:p><w:hyperlink r:id="rId2"><w:r><w:t>${escapeXml(options.hyperlink.text)}</w:t></w:r></w:hyperlink></w:p>`
    );
  }

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join("")}
</Relationships>`
  );

  const body = (options.paragraphs ?? [])
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`
    )
    .join("");

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${body}${extra.join("")}<w:sectPr/></w:body>
</w:document>`
  );

  return zip.generateAsync({ type: "uint8array" });
}

describe("looksLikeDocxZip", () => {
  it("accepts ZIP magic and rejects legacy OLE .doc", () => {
    expect(looksLikeDocxZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(
      true
    );
    expect(
      looksLikeDocxZip(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]))
    ).toBe(false);
    expect(looksLikeDocxZip(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("convertDocxBytesToHtml", () => {
  it("converts a Hebrew .docx to sanitized HTML", async () => {
    const bytes = await makeDocx({
      paragraphs: ["מיצוי אפשרויות לפני ועדת זכאות", "יוכבד דילאון"],
    });
    const html = await convertDocxBytesToHtml(bytes);
    expect(html).toContain("מיצוי אפשרויות לפני ועדת זכאות");
    expect(html).toContain("יוכבד דילאון");
    expect(html).toMatch(/<p[\s>]/);
    expect(html).not.toMatch(/<script/i);
  });

  it("strips javascript hyperlinks from the converted HTML", async () => {
    const bytes = await makeDocx({
      paragraphs: ["מסמך"],
      hyperlink: { text: "לחץ כאן", href: "javascript:alert(1)" },
    });
    const html = await convertDocxBytesToHtml(bytes);
    expect(html).toContain("מסמך");
    expect(html).toContain("לחץ כאן");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("alert(");
  });

  it("returns empty HTML for corrupt bytes, oversized input, and empty input", async () => {
    expect(await convertDocxBytesToHtml(new Uint8Array())).toBe("");
    expect(await convertDocxBytesToHtml(new Uint8Array([1, 2, 3, 4]))).toBe("");
    expect(
      await convertDocxBytesToHtml(
        new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      )
    ).toBe("");
    const tooBig = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    tooBig[0] = 0x50;
    tooBig[1] = 0x4b;
    expect(await convertDocxBytesToHtml(tooBig)).toBe("");
  });
});

describe("sanitizeMammothHtml", () => {
  it("sanitizes ordinary mammoth HTML", () => {
    const html = sanitizeMammothHtml(`<p dir="rtl">מיצוי אפשרויות</p>`);
    expect(html).toContain("מיצוי אפשרויות");
    expect(html).toMatch(/<p[\s>]/);
  });

  it("returns empty when mammoth HTML exceeds the print-tab budget", () => {
    expect(sanitizeMammothHtml("x".repeat(MAX_PRINT_HTML_CHARS + 1))).toBe("");
    expect(sanitizeMammothHtml("")).toBe("");
  });
});

describe("convertDocxDataUrlToHtml", () => {
  it("converts a data URL the same way print loads uploaded files", async () => {
    const bytes = await makeDocx({ paragraphs: ["תוכן הקובץ בהדפסה"] });
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${Buffer.from(bytes).toString("base64")}`;
    const html = await convertDocxDataUrlToHtml(dataUrl);
    expect(html).toContain("תוכן הקובץ בהדפסה");
  });
});

describe("legacy Node mammoth API (root cause)", () => {
  it("rejects { arrayBuffer } — the call the print path used to make", async () => {
    const mammoth = await import("mammoth");
    const bytes = await makeDocx({ paragraphs: ["x"] });
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const conversion = mammoth.convertToHtml({ arrayBuffer } as never);
    conversion.catch(() => undefined);
    await expect(conversion).rejects.toThrow(/Could not find file in options/);
  });
});
