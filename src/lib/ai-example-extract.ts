/** חילוץ טקסט מקובץ דוגמה למילוי AI (txt / docx / pdf) */

export const MAX_EXAMPLE_CHARS = 12_000;
export const MAX_EXAMPLE_FILE_BYTES = 4 * 1024 * 1024; // 4MB

export type ExampleFileKind = "text" | "docx" | "pdf";

export function detectExampleFileKind(
  fileName: string,
  mimeType?: string
): ExampleFileKind | null {
  const name = fileName.trim().toLowerCase();
  const mime = (mimeType ?? "").trim().toLowerCase();

  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    mime.startsWith("text/")
  ) {
    return "text";
  }
  if (
    name.endsWith(".docx") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (name.endsWith(".pdf") || mime === "application/pdf") {
    return "pdf";
  }
  // .doc ישן לא נתמך (פורמט בינארי שונה)
  if (name.endsWith(".doc")) return null;
  return null;
}

function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXAMPLE_CHARS);
}

export async function extractExampleTextFromBuffer(
  buffer: Buffer,
  kind: ExampleFileKind
): Promise<string> {
  if (kind === "text") {
    return normalizeExtractedText(buffer.toString("utf8"));
  }

  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText(result.value ?? "");
  }

  // pdf
  const pdfParseModule = (await import("pdf-parse")) as unknown;
  const pdfParse =
    typeof pdfParseModule === "function"
      ? (pdfParseModule as (b: Buffer) => Promise<{ text?: string }>)
      : typeof (pdfParseModule as { default?: unknown })?.default === "function"
        ? ((pdfParseModule as { default: (b: Buffer) => Promise<{ text?: string }> })
            .default)
        : null;
  if (!pdfParse) {
    throw new Error("PDF_PARSER_UNAVAILABLE");
  }
  const parsed = await pdfParse(buffer);
  return normalizeExtractedText(parsed?.text ?? "");
}

export function decodeBase64ToBuffer(base64: string): Buffer {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "").trim();
  return Buffer.from(cleaned, "base64");
}
