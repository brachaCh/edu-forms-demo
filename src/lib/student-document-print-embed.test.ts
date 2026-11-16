import { describe, expect, it } from "vitest";
import {
  decodeDataUrlToUint8ArraySync,
  detectPrintEmbedKind,
  isPdfWorkerLoadError,
  looksLikeHtmlDataUrl,
  mapWithConcurrency,
  PDF_PRINT_JPEG_QUALITY,
  PDF_PRINT_SCALE,
  registerPdfJsMainThreadWorker,
} from "./student-document-print-embed";

describe("detectPrintEmbedKind", () => {
  it("detects pdf and docx by extension and mime", () => {
    expect(detectPrintEmbedKind("a.pdf")).toBe("pdf");
    expect(detectPrintEmbedKind("a.docx")).toBe("docx");
    expect(detectPrintEmbedKind("x", "application/pdf")).toBe("pdf");
    expect(
      detectPrintEmbedKind(
        "מיצוי אפשרויות לפני ועדת זכאות ואפיון יוכבד דילאון (1).docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("docx");
    expect(detectPrintEmbedKind("old.doc", "application/msword")).toBe("other");
  });

  it("keeps filled-form HTML as html even without an extension (TZ-89)", () => {
    const htmlUrl = `data:text/html;charset=utf-8,${encodeURIComponent("<!DOCTYPE html><p>טופס</p>")}`;
    expect(detectPrintEmbedKind("דף הכנה לתח\"י", "text/html", htmlUrl)).toBe(
      "html"
    );
    expect(
      detectPrintEmbedKind("דף הכנה לתח\"י", "application/octet-stream", htmlUrl)
    ).toBe("html");
    expect(looksLikeHtmlDataUrl(htmlUrl)).toBe(true);
    expect(
      detectPrintEmbedKind("טופס — חתום.pdf", "text/html", htmlUrl)
    ).toBe("html");
  });
});

describe("decodeDataUrlToUint8ArraySync", () => {
  it("decodes base64 data URLs without fetch", () => {
    const text = "hello";
    const b64 = btoa(text);
    const bytes = decodeDataUrlToUint8ArraySync(
      `data:application/octet-stream;base64,${b64}`
    );
    expect(bytes).not.toBeNull();
    expect(Array.from(bytes!)).toEqual(
      Array.from(text).map((c) => c.charCodeAt(0))
    );
  });

  it("decodes URL-encoded data URLs", () => {
    const bytes = decodeDataUrlToUint8ArraySync("data:text/plain,hi%20there");
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toBe("hi there");
  });

  it("decodes base64 with whitespace and a filename-like PDF title", () => {
    const pdf = "%PDF-1.4\n";
    const b64 = Buffer.from(pdf).toString("base64");
    const bytes = decodeDataUrlToUint8ArraySync(
      `data:application/pdf;base64,${b64.slice(0, 4)} ${b64.slice(4)}`
    );
    expect(new TextDecoder().decode(bytes!)).toContain("%PDF");
    expect(
      detectPrintEmbedKind("מכתב רופא ADHD (1).pdf", "application/pdf")
    ).toBe("pdf");
  });

  it("returns null for non-data URLs", () => {
    expect(decodeDataUrlToUint8ArraySync("https://example.com/a.pdf")).toBeNull();
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order with limited concurrency", async () => {
    const started: number[] = [];
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      await new Promise((r) => setTimeout(r, 5 * (6 - n)));
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(started.length).toBe(5);
  });

  it("reports progress", async () => {
    const ticks: Array<[number, number]> = [];
    await mapWithConcurrency(
      ["a", "b", "c"],
      2,
      async (item) => item.toUpperCase(),
      (done, total) => ticks.push([done, total])
    );
    expect(ticks.at(-1)).toEqual([3, 3]);
    expect(ticks.map((t) => t[0]).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("handles empty input", async () => {
    expect(await mapWithConcurrency([], 3, async (x) => x)).toEqual([]);
  });
});

describe("print PDF quality defaults", () => {
  it("uses lighter scale and jpeg than the legacy 1.75 / 0.82", () => {
    expect(PDF_PRINT_SCALE).toBeLessThan(1.75);
    expect(PDF_PRINT_JPEG_QUALITY).toBeLessThan(0.82);
  });
});

describe("pdf.js worker retry", () => {
  it("retries only on worker-load errors, not corrupt or password PDFs", () => {
    expect(isPdfWorkerLoadError(new Error("Setting up fake worker failed"))).toBe(
      true
    );
    expect(isPdfWorkerLoadError(new Error("Failed to fetch dynamically imported module: worker"))).toBe(
      true
    );
    expect(isPdfWorkerLoadError(new Error("Invalid PDF structure."))).toBe(false);
    expect(isPdfWorkerLoadError(new Error("No password given"))).toBe(false);
  });

  it("exposes WorkerMessageHandler on globalThis so pdf.js skips new Worker()", () => {
    const handler = { setup: () => undefined };
    registerPdfJsMainThreadWorker({ WorkerMessageHandler: handler });
    const g = globalThis as typeof globalThis & {
      pdfjsWorker?: { WorkerMessageHandler?: unknown };
    };
    expect(g.pdfjsWorker?.WorkerMessageHandler).toBe(handler);
  });
});
