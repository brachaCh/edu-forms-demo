/**
 * Browser rasterization of uploaded PDFs for portfolio print (TZ-102).
 * Fake fixtures only — no real student names or private files.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import {
  PRINT_FIXTURE_PDF_MULTI_NAME,
  PRINT_FIXTURE_PDF_NAME,
  buildMinimalPdfBytes,
} from "@/lib/print-fixtures";
import { buildUploadedPdfPrintHtml } from "@/lib/student-document-print";

const ARTIFACTS_DIR = "/opt/cursor/artifacts";
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, "screenshots");

const PRODUCTION_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob: data:",
].join("; ");

const TEST_PAGE = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />
  <title>PDF print raster fixture</title>
</head>
<body>
<script type="module">
  import * as pdfjs from "/pdf.mjs";
  import * as workerMod from "/pdf.worker.min.mjs";
  globalThis.pdfjsWorker = {
    ...(globalThis.pdfjsWorker || {}),
    WorkerMessageHandler: workerMod.WorkerMessageHandler,
  };
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  window.__renderPdf = async (bytesB64) => {
    const binary = atob(bytesB64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    const pdf = await pdfjs.getDocument({
      data: copy,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    const images = [];
    const max = Math.min(pdf.numPages, 40);
    for (let i = 1; i <= max; i += 1) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.15 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("NO_CANVAS");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.68));
    }
    return { pages: images, numPages: pdf.numPages };
  };
  window.__ready = true;
</script>
</body>
</html>`;

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("NO_PORT"));
        return;
      }
      resolve(addr.port);
    });
    server.on("error", reject);
  });
}

describe("TZ-102 uploaded PDFs rasterize in the print window", () => {
  let server: Server;
  let origin: string;
  let browser: Browser;
  let page: Page;
  let smallMs = 0;
  let multiMs = 0;

  beforeAll(async () => {
    for (const dir of [ARTIFACTS_DIR, SCREENSHOTS_DIR]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    const worker = readFileSync(
      path.resolve("public/pdf.worker.min.mjs")
    );
    const pdfjs = readFileSync(
      path.resolve("node_modules/pdfjs-dist/build/pdf.mjs")
    );

    server = createServer((req, res) => {
      const url = req.url?.split("?")[0] ?? "/";
      const nosniff = { "X-Content-Type-Options": "nosniff" as const };
      if (url === "/pdf.worker.min.mjs") {
        res.writeHead(200, {
          ...nosniff,
          "Content-Type": "text/javascript; charset=utf-8",
        });
        res.end(worker);
        return;
      }
      if (url === "/pdf.mjs") {
        res.writeHead(200, {
          ...nosniff,
          "Content-Type": "text/javascript; charset=utf-8",
        });
        res.end(pdfjs);
        return;
      }
      res.writeHead(200, {
        ...nosniff,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": PRODUCTION_CSP,
      });
      res.end(TEST_PAGE);
    });
    const port = await listen(server);
    origin = `http://127.0.0.1:${port}`;

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage();
    await page.goto(origin, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  }, 60_000);

  afterAll(async () => {
    if (browser) await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function rasterize(bytes: Uint8Array) {
    const b64 = Buffer.from(bytes).toString("base64");
    return page.evaluate(async (payload) => {
      const fn = (window as unknown as {
        __renderPdf: (b64: string) => Promise<{ pages: string[]; numPages: number }>;
      }).__renderPdf;
      return fn(payload);
    }, b64);
  }

  it("renders a small uploaded PDF and a multi-page PDF as print pages, not the placeholder", async () => {
    const small = buildMinimalPdfBytes("ADHD letter (1)", 1);
    const multi = buildMinimalPdfBytes("diagnostic draft", 3);
    expect(small.byteLength).toBeLessThan(2_000);

    const smallStarted = Date.now();
    const smallResult = await rasterize(small);
    smallMs = Date.now() - smallStarted;
    const multiStarted = Date.now();
    const multiResult = await rasterize(multi);
    multiMs = Date.now() - multiStarted;

    expect(smallResult.numPages).toBe(1);
    expect(smallResult.pages).toHaveLength(1);
    expect(multiResult.numPages).toBe(3);
    expect(multiResult.pages).toHaveLength(3);

    for (const src of [...smallResult.pages, ...multiResult.pages]) {
      expect(src.startsWith("data:image/jpeg;base64,")).toBe(true);
      expect(src.length).toBeGreaterThan(800);
    }

    const smallHtml = buildUploadedPdfPrintHtml(
      PRINT_FIXTURE_PDF_NAME,
      smallResult.pages
    );
    const multiHtml = buildUploadedPdfPrintHtml(
      PRINT_FIXTURE_PDF_MULTI_NAME,
      multiResult.pages
    );
    const bundle = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8" /><title>הדפסת תיק — בדיקת PDF</title>
<style>
  body { font-family: Arial, sans-serif; margin: 12mm; background: #fff; color: #111; }
  .print-doc-pdf-caption { font-size: 11pt; color: #084e76; margin: 0 0 3mm; }
  .print-doc-pdf-page { width: 100%; border: 1px solid #d7dde5; }
  .print-doc + .print-doc { break-before: page; margin-top: 8mm; }
</style></head>
<body>
${smallHtml}
${multiHtml}
</body></html>`;

    expect(bundle).toContain("print-doc-pdf-page");
    expect(bundle).toContain(PRINT_FIXTURE_PDF_NAME);
    expect(bundle).toContain(PRINT_FIXTURE_PDF_MULTI_NAME);
    expect((bundle.match(/<img class="print-doc-pdf-page"/g) || []).length).toBe(
      4
    );
    expect(bundle).not.toContain("לא ניתן היה לטעון את הקובץ להדפסה");
    expect(bundle).not.toContain("לא ניתן היה להציג את עמודי המסמך");

    await page.setContent(bundle, { waitUntil: "domcontentloaded" });
    const imgCount = await page.$$eval("img.print-doc-pdf-page", (els) => els.length);
    expect(imgCount).toBe(4);
    const screenshotPath = path.join(
      SCREENSHOTS_DIR,
      "tz102_pdf_pages_after.png"
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    writeFileSync(
      path.join(ARTIFACTS_DIR, "tz102-pdf-raster-timing.json"),
      JSON.stringify(
        {
          smallPdfMs: smallMs,
          multiPagePdfMs: multiMs,
          smallBytes: small.byteLength,
          multiBytes: multi.byteLength,
          pages: { small: smallResult.numPages, multi: multiResult.numPages },
        },
        null,
        2
      )
    );
    console.log(
      `TZ-102 PDF raster: small ${smallMs}ms, multi-page ${multiMs}ms`
    );
  }, 60_000);
});
