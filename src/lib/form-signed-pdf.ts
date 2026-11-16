import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import type { FormSchema } from "@/lib/form-schemas";
import { listFormFields } from "@/lib/form-schemas";
import {
  formatSimpleSignSignedLabel,
  isSimpleSignSignedValue,
} from "@/lib/simplesign/constants";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const TITLE_SIZE = 16;
const BODY_SIZE = 11;
const LINE = 16;

function loadHebrewFontBytes(): Uint8Array {
  return new Uint8Array(
    readFileSync(join(process.cwd(), "public/fonts/NotoSansHebrew-Regular.ttf"))
  );
}

function reverseRtl(text: string): string {
  return Array.from(text).reverse().join("");
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function drawRight(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  y: number
): void {
  const visual = reverseRtl(text);
  const width = font.widthOfTextAtSize(visual, size);
  page.drawText(visual, {
    x: PAGE_WIDTH - MARGIN - width,
    y,
    size,
    font,
    color: rgb(0.12, 0.14, 0.18),
  });
}

function fieldDisplayValue(type: string | undefined, value: string): string {
  if (type === "checkbox") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "on" || v === "כן") return "כן";
    if (!v) return "";
    return "לא";
  }
  return value.trim();
}

function pngBytesFromDataUrl(value: string): Uint8Array | null {
  const match = value.trim().match(/^data:image\/png(?:;charset=[-\w]+)?;base64,(.+)$/i);
  if (!match?.[1]) return null;
  return Uint8Array.from(Buffer.from(match[1], "base64"));
}

export async function buildSignedFormPdf(input: {
  schema: FormSchema;
  data: Record<string, string>;
  studentName: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(loadHebrewFontBytes(), { subset: true });
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const writeLines = (text: string, size: number) => {
    const lines = wrapLines(text, font, size, contentWidth);
    for (const line of lines) {
      ensureSpace(LINE);
      drawRight(page, line, font, size, y);
      y -= LINE;
    }
  };

  writeLines(input.schema.title, TITLE_SIZE);
  y -= 4;
  if (input.studentName.trim()) {
    writeLines(input.studentName, BODY_SIZE);
  }
  y -= 8;

  for (const field of listFormFields(input.schema)) {
    if (
      field.type === "static" ||
      field.type === "rating-grid" ||
      field.type === "schedule-grid" ||
      field.type === "row-table" ||
      field.type === "accommodations-picker"
    ) {
      continue;
    }
    const raw = String(input.data[field.key] ?? "");
    if (field.type === "signature") {
      ensureSpace(LINE);
      writeLines(`${field.label}:`, BODY_SIZE);
      const png = pngBytesFromDataUrl(raw);
      if (png) {
        try {
          const image = await pdf.embedPng(png);
          const maxW = 220;
          const scale = Math.min(1, maxW / image.width);
          const w = image.width * scale;
          const h = image.height * scale;
          ensureSpace(h + 8);
          page.drawImage(image, {
            x: PAGE_WIDTH - MARGIN - w,
            y: y - h,
            width: w,
            height: h,
          });
          y -= h + 10;
        } catch {
          writeLines("נחתם", BODY_SIZE);
        }
      } else if (isSimpleSignSignedValue(raw)) {
        writeLines(formatSimpleSignSignedLabel(raw), BODY_SIZE);
      } else if (raw.trim()) {
        writeLines("נחתם", BODY_SIZE);
      }
      y -= 6;
      continue;
    }

    const value = fieldDisplayValue(field.type, raw);
    if (!value) continue;
    writeLines(`${field.label}: ${value}`, BODY_SIZE);
    y -= 4;
  }

  return pdf.save();
}
