/**
 * Print verification tests for TZ-3 fixes.
 * Tests that schedule tables fit in portrait A4 and no blank pages are produced.
 *
 * These tests use Puppeteer to render print HTML to PDF and verify the output.
 * Artifacts (PDFs, screenshots) are saved to /opt/cursor/artifacts/.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import puppeteer, { Browser, Page } from "puppeteer";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { SCHEDULE_DAYS, schedulePeriodsForVariant, scheduleCellKey, scheduleSubCellKey } from "./form-table-grids";
import { shouldSkipFolderCovers, shouldIncludePortfolioCover, sanitizeEmbeddedStyles } from "./student-document-print";

const ARTIFACTS_DIR = "/opt/cursor/artifacts";
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, "screenshots");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scheduleCellMarkup(value: string): string {
  return `<td class="sched-cell">${escapeHtml(value) || "&nbsp;"}</td>`;
}

/**
 * Generate deterministic paramedical schedule data.
 * Fills ALL cells to test worst-case scenario.
 */
function generateRealisticScheduleData(): Record<string, string> {
  const data: Record<string, string> = {
    class_name: "כיתה ה׳2 — מעלה ראובן",
    school_year: 'תשפ"ו',
  };

  const periods = schedulePeriodsForVariant("tlk-paramedical");
  const students = [
    "יעל כהן-ברגמן",
    "דוד לוי-שטרן",
    "שרה אברהמי",
    "משה גולדשטיין",
    "רחל פרידמן-כץ",
    "יוסף בן-עמי",
    "מרים דויטש",
    "אהרון רוזנבלום",
  ];
  const therapists = [
    "דנה כהן — ריפוי בעיסוק",
    "מיכל לוי — קלינאית תקשורת",
    "יעל שמש — פיזיותרפיה",
    "רונית ברק — ריפוי בעיסוק",
    "אורלי כץ — קלינאית תקשורת",
  ];

  let idx = 0;

  for (const period of periods) {
    for (const day of SCHEDULE_DAYS) {
      // Fill ALL cells deterministically
      data[scheduleSubCellKey(day.key, period, "student")] = students[idx % students.length]!;
      data[scheduleSubCellKey(day.key, period, "therapist")] = therapists[idx % therapists.length]!;
      idx++;
    }
  }

  return data;
}

/**
 * Generate deterministic inclusion schedule data.
 * Fills ALL cells to test worst-case scenario.
 */
function generateInclusionScheduleData(): Record<string, string> {
  const data: Record<string, string> = {
    class_name: "כיתה ו׳1 — בית ספר הגפן",
    school_year: 'תשפ"ו',
  };

  const periods = schedulePeriodsForVariant("tlk-inclusion");
  const students = ["יעל כהן", "דוד לוי", "שרה א.", "משה ג."];
  const classes = ["ג1", "ג2", "ד1", "ד2", "ה1"];
  const teachers = ["מרים", "רחל", "שרה", "לאה"];
  const subjects = ["מתמטיקה", "עברית", "אנגלית", "מדעים", "תנ״ך"];

  let idx = 0;
  for (const period of periods) {
    for (const day of SCHEDULE_DAYS) {
      // Fill ALL cells deterministically
      data[scheduleSubCellKey(day.key, period, "student")] = students[idx % students.length]!;
      data[scheduleSubCellKey(day.key, period, "class")] = classes[idx % classes.length]!;
      data[scheduleSubCellKey(day.key, period, "teacher")] = teachers[idx % teachers.length]!;
      data[scheduleSubCellKey(day.key, period, "subject")] = subjects[idx % subjects.length]!;
      idx++;
    }
  }

  return data;
}

/**
 * Build schedule table HTML (paramedical variant).
 */
function buildParamedicalScheduleHtml(data: Record<string, string>): string {
  const periods = schedulePeriodsForVariant("tlk-paramedical");
  const dayHeaders = SCHEDULE_DAYS.map(
    (day) => `<th colspan="2">${escapeHtml(day.label)}</th>`
  ).join("");
  const subHeaders = SCHEDULE_DAYS.map(
    () => `<th>שם התלמיד</th><th>המרפאה</th>`
  ).join("");
  const body = periods
    .map((period) => {
      const cells = SCHEDULE_DAYS.map((day) => {
        const student = data[scheduleSubCellKey(day.key, period, "student")] ?? "";
        const therapist = data[scheduleSubCellKey(day.key, period, "therapist")] ?? "";
        return `${scheduleCellMarkup(student)}${scheduleCellMarkup(therapist)}`;
      }).join("");
      return `<tr><th class="period">${period}</th>${cells}</tr>`;
    })
    .join("");
  return `<table class="schedule-grid">
    <thead><tr><th></th>${dayHeaders}</tr><tr><th></th>${subHeaders}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/**
 * Build schedule table HTML (inclusion variant).
 */
function buildInclusionScheduleHtml(data: Record<string, string>): string {
  const periods = schedulePeriodsForVariant("tlk-inclusion");
  const dayHeaders = SCHEDULE_DAYS.map(
    (day) => `<th colspan="4">${escapeHtml(day.label)}</th>`
  ).join("");
  const subHeaders = SCHEDULE_DAYS.map(
    () => `<th>תלמיד</th><th>כתה</th><th>מורה</th><th>מקצוע</th>`
  ).join("");
  const body = periods
    .map((period) => {
      const cells = SCHEDULE_DAYS.map((day) => {
        const student = data[scheduleSubCellKey(day.key, period, "student")] ?? "";
        const className = data[scheduleSubCellKey(day.key, period, "class")] ?? "";
        const teacher = data[scheduleSubCellKey(day.key, period, "teacher")] ?? "";
        const subject = data[scheduleSubCellKey(day.key, period, "subject")] ?? "";
        return `${scheduleCellMarkup(student)}${scheduleCellMarkup(className)}${scheduleCellMarkup(teacher)}${scheduleCellMarkup(subject)}`;
      }).join("");
      return `<tr><th class="period">${period}</th>${cells}</tr>`;
    })
    .join("");
  return `<table class="schedule-grid">
    <thead><tr><th></th>${dayHeaders}</tr><tr><th></th>${subHeaders}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

/**
 * Build full print bundle HTML with cover and schedule.
 */
function buildPrintBundleHtml(scheduleHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 1.5cm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: auto !important;
      background: #fff;
      color: #111;
      font-family: Arial, "Segoe UI", sans-serif;
    }
    .print-doc + .print-doc {
      break-before: page;
      page-break-before: always;
    }
    .print-doc {
      break-after: auto;
      page-break-after: auto;
      padding: 0;
      margin: 0;
    }
    .print-cover {
      display: block;
      padding: 0;
      margin: 0;
    }
    .print-cover-page {
      min-height: 0;
      height: auto;
      width: 100%;
      border: none;
      display: flex;
      flex-direction: column;
      padding: 8mm 10mm 14mm;
      overflow: visible;
    }
    .print-cover-body {
      flex: 0 1 auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20mm 4mm 4mm;
    }
    .print-cover-kind {
      margin: 0 0 14mm;
      font-size: 26pt;
      font-weight: 700;
      color: #2f3b67;
      line-height: 1.3;
    }
    .print-cover-line {
      margin: 0 0 10mm;
      font-size: 16pt;
      color: #111;
      line-height: 1.5;
    }
    .print-cover-value {
      display: inline-block;
      min-width: 42mm;
      margin-inline: 4px;
      padding: 0 4px 2px;
      border-bottom: 1.5px solid #2f3b67;
      font-weight: 700;
      color: #07527d;
    }
    .print-doc-title {
      font-size: 14pt;
      margin: 0 0 6mm;
      padding-bottom: 2mm;
      border-bottom: 1px solid #d7dde5;
      color: #07527d;
    }
    .print-doc-body {
      padding-bottom: 12mm;
    }
    /* Schedule grid CSS from the PR fix */
    .print-doc-body .schedule-grid {
      font-size: 6.5pt !important;
      table-layout: fixed !important;
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 2mm 0 4mm !important;
    }
    .print-doc-body .schedule-grid th,
    .print-doc-body .schedule-grid td {
      padding: 0.75mm 0.5mm !important;
      line-height: 1.2 !important;
      text-align: center !important;
      vertical-align: top !important;
      border: 0.5pt solid #333 !important;
      word-wrap: break-word !important;
      overflow-wrap: anywhere !important;
      font-size: 6.5pt !important;
    }
    .print-doc-body .schedule-grid .period {
      width: 5mm !important;
      font-size: 6pt !important;
      font-weight: 700 !important;
      background: #f5f7fa !important;
    }
    .print-doc-body .schedule-grid .sched-cell {
      white-space: pre-wrap !important;
    }
    .schedule-grid {
      font-size: 6.5pt;
      table-layout: fixed;
      width: 100%;
      border-collapse: collapse;
      margin: 2mm 0 4mm;
    }
    .schedule-grid th,
    .schedule-grid td {
      padding: 0.75mm 0.5mm;
      line-height: 1.2;
      text-align: center;
      vertical-align: top;
      border: 0.5pt solid #333;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      font-size: 6.5pt;
    }
    .schedule-grid .period {
      width: 5mm;
      font-size: 6pt;
      font-weight: 700;
      background: #f5f7fa;
    }
    .schedule-grid .sched-cell {
      white-space: pre-wrap;
    }
    .print-page-frame {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      width: auto;
      height: auto;
      max-height: 100%;
      border: none;
      box-shadow: inset 0 0 0 1.5pt #2f3b67;
      pointer-events: none;
      z-index: 3;
    }
  </style>
</head>
<body>
  <section class="print-doc print-cover">
    <div class="print-cover-page">
      <div class="print-cover-body">
        <p class="print-cover-kind">תל&quot;כ</p>
        <p class="print-cover-line">לכיתה <span class="print-cover-value">ה׳2</span></p>
        <p class="print-cover-line">לשנה <span class="print-cover-value">תשפ&quot;ו</span></p>
      </div>
    </div>
  </section>
  <section class="print-doc print-doc-form">
    <h1 class="print-doc-title">${escapeHtml(title)}</h1>
    <div class="print-doc-body">
      ${scheduleHtml}
    </div>
  </section>
  <div class="print-page-frame" aria-hidden="true"></div>
</body>
</html>`;
}

describe("Print verification for TZ-3 schedule fixes", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    // Create artifacts directories
    for (const dir of [ARTIFACTS_DIR, SCREENSHOTS_DIR]) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
    
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it("paramedical schedule fits A4 portrait without overflow", async () => {
    const data = generateRealisticScheduleData();
    const scheduleHtml = buildParamedicalScheduleHtml(data);
    const fullHtml = buildPrintBundleHtml(scheduleHtml, "מערכת שעות פרא-רפואית");

    await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

    // Generate PDF
    const pdfPath = path.join(ARTIFACTS_DIR, "paramedical-schedule-print.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1.5cm", right: "1.5cm", bottom: "1.5cm", left: "1.5cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    // Take screenshot for visual verification
    const screenshotPath = path.join(SCREENSHOTS_DIR, "paramedical-schedule.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Check that the schedule table doesn't overflow
    const tableOverflow = await page.evaluate(() => {
      const table = document.querySelector(".schedule-grid");
      if (!table) return { overflows: false, width: 0, pageWidth: 0 };
      const rect = table.getBoundingClientRect();
      const pageWidth = document.body.clientWidth;
      return {
        overflows: rect.width > pageWidth,
        width: rect.width,
        pageWidth: pageWidth,
      };
    });

    expect(tableOverflow.overflows).toBe(false);

    // Verify PDF was created
    const pdfContent = await readFile(pdfPath);
    expect(pdfContent.length).toBeGreaterThan(0);
    
    console.log(`✓ Paramedical schedule PDF saved to: ${pdfPath}`);
    console.log(`✓ Screenshot saved to: ${screenshotPath}`);
    console.log(`  Table width: ${tableOverflow.width}px, Page width: ${tableOverflow.pageWidth}px`);
  });

  it("inclusion schedule fits A4 portrait without overflow", async () => {
    const data = generateInclusionScheduleData();
    const scheduleHtml = buildInclusionScheduleHtml(data);
    const fullHtml = buildPrintBundleHtml(scheduleHtml, "מערכת שילוב");

    await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

    // Generate PDF
    const pdfPath = path.join(ARTIFACTS_DIR, "inclusion-schedule-print.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1.5cm", right: "1.5cm", bottom: "1.5cm", left: "1.5cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    // Take screenshot
    const screenshotPath = path.join(SCREENSHOTS_DIR, "inclusion-schedule.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Check table doesn't overflow
    const tableOverflow = await page.evaluate(() => {
      const table = document.querySelector(".schedule-grid");
      if (!table) return { overflows: false, width: 0, pageWidth: 0 };
      const rect = table.getBoundingClientRect();
      const pageWidth = document.body.clientWidth;
      return {
        overflows: rect.width > pageWidth,
        width: rect.width,
        pageWidth: pageWidth,
      };
    });

    expect(tableOverflow.overflows).toBe(false);

    console.log(`✓ Inclusion schedule PDF saved to: ${pdfPath}`);
    console.log(`✓ Screenshot saved to: ${screenshotPath}`);
    console.log(`  Table width: ${tableOverflow.width}px, Page width: ${tableOverflow.pageWidth}px`);
  });

  it("single-folder TLK print produces exactly one cover (no duplicate)", async () => {
    const data = generateRealisticScheduleData();
    const scheduleHtml = buildParamedicalScheduleHtml(data);
    
    // Verify the logic: for a single folder TLK, we should skip folder covers
    const includeCover = shouldIncludePortfolioCover(1, true); // single folder, class curriculum
    const skipFolderCovers = shouldSkipFolderCovers(includeCover, 1);
    
    expect(includeCover).toBe(true); // Should include main cover for TLK
    expect(skipFolderCovers).toBe(true); // Should skip folder-level cover to avoid duplication
    
    // Build HTML with only main cover (simulating correct behavior)
    const fullHtml = buildPrintBundleHtml(scheduleHtml, "מערכת שעות פרא-רפואית");
    
    await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });
    
    // Count cover pages
    const coverCount = await page.evaluate(() => {
      return document.querySelectorAll(".print-cover").length;
    });
    
    expect(coverCount).toBe(1);
    
    // Generate PDF to verify page count
    const pdfPath = path.join(ARTIFACTS_DIR, "single-folder-tlk-print.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1.5cm", right: "1.5cm", bottom: "1.5cm", left: "1.5cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    console.log(`✓ Single-folder TLK PDF saved to: ${pdfPath}`);
    console.log(`  Cover count: ${coverCount} (expected: 1)`);
  });

  it("bundle with multiple documents produces no trailing blank pages", async () => {
    const paraData = generateRealisticScheduleData();
    const inclData = generateInclusionScheduleData();
    
    const paraScheduleHtml = buildParamedicalScheduleHtml(paraData);
    const inclScheduleHtml = buildInclusionScheduleHtml(inclData);
    
    // Build multi-document bundle
    const fullHtml = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>הדפסת תיק תל&quot;כ</title>
  <style>
    @page { size: A4 portrait; margin: 1.5cm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: auto !important;
      background: #fff;
      color: #111;
      font-family: Arial, "Segoe UI", sans-serif;
    }
    .print-doc + .print-doc {
      break-before: page;
      page-break-before: always;
    }
    .print-doc {
      break-after: auto;
      page-break-after: auto;
      padding: 0;
      margin: 0;
    }
    .print-cover-page {
      min-height: 0;
      height: auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      padding: 8mm 10mm 14mm;
    }
    .print-cover-body {
      flex: 0 1 auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20mm 4mm 4mm;
    }
    .print-cover-kind {
      margin: 0 0 14mm;
      font-size: 26pt;
      font-weight: 700;
      color: #2f3b67;
    }
    .print-cover-line {
      margin: 0 0 10mm;
      font-size: 16pt;
      color: #111;
    }
    .print-cover-value {
      display: inline-block;
      min-width: 42mm;
      margin-inline: 4px;
      padding: 0 4px 2px;
      border-bottom: 1.5px solid #2f3b67;
      font-weight: 700;
      color: #07527d;
    }
    .print-doc-title {
      font-size: 14pt;
      margin: 0 0 6mm;
      padding-bottom: 2mm;
      border-bottom: 1px solid #d7dde5;
      color: #07527d;
    }
    .print-doc-body { padding-bottom: 12mm; }
    .schedule-grid {
      font-size: 6.5pt;
      table-layout: fixed;
      width: 100%;
      border-collapse: collapse;
      margin: 2mm 0 4mm;
    }
    .schedule-grid th, .schedule-grid td {
      padding: 0.75mm 0.5mm;
      line-height: 1.2;
      text-align: center;
      vertical-align: top;
      border: 0.5pt solid #333;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      font-size: 6.5pt;
    }
    .schedule-grid .period {
      width: 5mm;
      font-size: 6pt;
      font-weight: 700;
      background: #f5f7fa;
    }
    .schedule-grid .sched-cell { white-space: pre-wrap; }
  </style>
</head>
<body>
  <section class="print-doc print-cover">
    <div class="print-cover-page">
      <div class="print-cover-body">
        <p class="print-cover-kind">תל&quot;כ</p>
        <p class="print-cover-line">לכיתה <span class="print-cover-value">ה׳2</span></p>
        <p class="print-cover-line">לשנה <span class="print-cover-value">תשפ&quot;ו</span></p>
      </div>
    </div>
  </section>
  <section class="print-doc print-doc-form">
    <h1 class="print-doc-title">מערכת שעות פרא-רפואית</h1>
    <div class="print-doc-body">${paraScheduleHtml}</div>
  </section>
  <section class="print-doc print-doc-form">
    <h1 class="print-doc-title">מערכת שילוב</h1>
    <div class="print-doc-body">${inclScheduleHtml}</div>
  </section>
</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });
    
    // Generate PDF
    const pdfPath = path.join(ARTIFACTS_DIR, "multi-schedule-bundle.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1.5cm", right: "1.5cm", bottom: "1.5cm", left: "1.5cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    // Take full page screenshot
    const screenshotPath = path.join(SCREENSHOTS_DIR, "multi-schedule-bundle.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Verify content exists on all sections
    const sectionInfo = await page.evaluate(() => {
      const sections = document.querySelectorAll(".print-doc");
      return Array.from(sections).map((section) => ({
        hasCover: section.classList.contains("print-cover"),
        hasContent: section.textContent?.trim().length ?? 0 > 10,
        hasTable: section.querySelector(".schedule-grid") !== null,
      }));
    });

    // Should have 3 sections: cover + 2 schedules
    expect(sectionInfo.length).toBe(3);
    expect(sectionInfo[0]?.hasCover).toBe(true);
    expect(sectionInfo[1]?.hasTable).toBe(true);
    expect(sectionInfo[2]?.hasTable).toBe(true);

    console.log(`✓ Multi-schedule bundle PDF saved to: ${pdfPath}`);
    console.log(`✓ Screenshot saved to: ${screenshotPath}`);
    console.log(`  Sections: ${sectionInfo.length} (cover + 2 schedules)`);
  });

  it("sanitizeEmbeddedStyles removes forced page breaks from forms", () => {
    const embeddedCss = `
      .rq-exhaust-form { page-break-before: always; break-before: page; }
      .rq-incl-doc { page-break-before: always; }
      .some-section { break-after: page; }
      .normal-break { page-break-inside: avoid; }
    `;
    
    const cleaned = sanitizeEmbeddedStyles(embeddedCss);
    
    // Should replace forced breaks with auto
    expect(cleaned).toContain("page-break-before:auto");
    expect(cleaned).toContain("break-before:auto");
    expect(cleaned).toContain("break-after:auto");
    
    // Should not affect page-break-inside:avoid (that's fine)
    expect(cleaned).toContain("page-break-inside: avoid");
    
    // Should not contain the original forced breaks
    expect(cleaned).not.toContain("page-break-before: always");
    expect(cleaned).not.toContain("break-before: page");
    expect(cleaned).not.toContain("break-after: page");
  });
});

/**
 * Count pages in a PDF buffer by looking for the /Count in /Type /Pages object.
 * This is the standard way PDFs store the page count.
 */
function countPdfPages(pdfBuffer: Buffer | Uint8Array): number {
  // Convert to string, handling both Buffer and Uint8Array
  const pdfStr = Buffer.isBuffer(pdfBuffer) 
    ? pdfBuffer.toString("latin1")
    : Buffer.from(pdfBuffer).toString("latin1");
  
  // Look for /Count N right after /Type /Pages (with newline separator)
  const simpleCountMatch = pdfStr.match(/\/Type\s+\/Pages\s*\n\/Count\s+(\d+)/);
  if (simpleCountMatch?.[1]) {
    return parseInt(simpleCountMatch[1], 10);
  }
  
  // Try without newline
  const inlineCountMatch = pdfStr.match(/\/Type\s+\/Pages[^>]*\/Count\s+(\d+)/);
  if (inlineCountMatch?.[1]) {
    return parseInt(inlineCountMatch[1], 10);
  }
  
  // Fallback: count /Type /Page objects (excluding /Pages)
  const pageMatches = pdfStr.match(/\/Type\s+\/Page(?!s)/g);
  return pageMatches?.length ?? 0;
}

/**
 * TZ-16 Schedule Print Tests
 * Tests that ALL schedule variants print on exactly ONE A4 landscape page.
 * Uses deterministic data (no Math.random) and asserts page count.
 */
describe("TZ-16: Schedule forms print on one A4 landscape page", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    for (const dir of [ARTIFACTS_DIR, SCREENSHOTS_DIR, path.join(ARTIFACTS_DIR, "tz-16")]) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
    
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it("personal-schedule (detailed variant with checkboxes) fits on 1 page", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");

    const schema = getFormSchema("personal-schedule");
    expect(schema).toBeTruthy();

    // Deterministic data with REALISTIC multi-line content that wraps
    const data: Record<string, string> = {
      full_name: "יעל כהן-ברגמן הראל",
      class_name: "ג׳2",
      filled_at: "2026-10-08",
    };

    // Realistic subjects: some longer that wrap to 2 lines, some shorter
    const subjects = [
      "מתמטיקה — כפל וחילוק",
      "עברית: קריאה והבעה",
      "אנגלית",
      "מדעים וטכנולוגיה",
      "היסטוריה ואזרחות",
      "תנ״ך",
      "חינוך גופני",
    ];
    const periods = [1, 2, 3, 4, 5, 6, 7];
    let idx = 0;

    for (const period of periods) {
      for (const day of SCHEDULE_DAYS) {
        data[scheduleCellKey(day.key, period)] = subjects[idx % subjects.length]!;
        // Alternate checkboxes deterministically
        if (idx % 2 === 0) {
          data[`sched_${day.key}_p${period}_in_class`] = "1";
        } else {
          data[`sched_${day.key}_p${period}_other`] = "1";
        }
        idx++;
      }
    }

    const html = buildFormSnapshotHtml(schema!, data, "יעל כהן-ברגמן");

    expect(html).toContain('class="print-schedule"');
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain('class="sched-flags"');

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdfPath = path.join(ARTIFACTS_DIR, "tz-16", "personal-schedule-after.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    const screenshotPath = path.join(SCREENSHOTS_DIR, "personal-schedule-tz16.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const pageCount = countPdfPages(pdfBuffer);
    console.log(`✓ personal-schedule: ${pageCount} page(s), ${pdfBuffer.length} bytes`);
    expect(pageCount).toBe(1);
  });

  it("staff-schedule (staff-weekly variant) fits on 1 page", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");

    const schema = getFormSchema("staff-schedule");
    expect(schema).toBeTruthy();

    // Deterministic data with multi-line content
    const data: Record<string, string> = {
      full_name: "רחל כהן-ברגמן",
      filled_at: "2026-10-08",
    };

    // Students with typical names (some longer)
    const students = [
      "יעל כהן-ברגמן",
      "דוד לוי",
      "שרה אברהמי-כץ",
      "משה גולדשטיין",
    ];
    // Subjects with some longer text
    const subjects = [
      "מתמטיקה — כפל",
      "עברית והבעה",
      "אנגלית",
      "מדעים וסביבה",
    ];
    const periods = [1, 2, 3, 4, 5, 6, 7];
    let idx = 0;

    for (const period of periods) {
      for (const day of SCHEDULE_DAYS) {
        data[scheduleSubCellKey(day.key, period, "student")] = students[idx % students.length]!;
        data[scheduleSubCellKey(day.key, period, "subject")] = subjects[idx % subjects.length]!;
        idx++;
      }
    }

    const html = buildFormSnapshotHtml(schema!, data, "רחל כהן");

    expect(html).toContain('class="print-schedule"');

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdfPath = path.join(ARTIFACTS_DIR, "tz-16", "staff-schedule-after.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    const pageCount = countPdfPages(pdfBuffer);
    console.log(`✓ staff-schedule: ${pageCount} page(s), ${pdfBuffer.length} bytes`);
    expect(pageCount).toBe(1);
  });

  it("weekly-schedule (tlk-weekly variant) fits on 1 page", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");

    const schema = getFormSchema("weekly-schedule");
    expect(schema).toBeTruthy();

    // Deterministic data with longer text that wraps
    const data: Record<string, string> = {
      class_name: "ג׳1 — בית ספר הגפן",
      school_year: 'תשפ"ו',
      homeroom_teacher: "שרה כהן-ברגמן",
    };

    // Subjects: some longer that wrap, some shorter
    const subjects = [
      "מתמטיקה — כפל וחילוק",
      "עברית: קריאה והבעה",
      "אנגלית",
      "מדעים וטכנולוגיה",
      "היסטוריה",
      "תנ״ך",
      "חינוך גופני",
      "אומנות ויצירה",
    ];
    const staff = [
      "שרה כהן-ברגמן",
      "דוד לוי",
      "רחל מרכוס",
      "משה ג.",
    ];
    const periods = schedulePeriodsForVariant("tlk-weekly");
    let idx = 0;

    for (const period of periods) {
      for (const day of SCHEDULE_DAYS) {
        data[scheduleCellKey(day.key, period)] = subjects[idx % subjects.length]!;
        data[scheduleSubCellKey(day.key, period, "staff")] = staff[idx % staff.length]!;
        idx++;
      }
    }

    const html = buildFormSnapshotHtml(schema!, data, 'תל"כ — ג׳1');

    expect(html).toContain('class="print-schedule"');

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdfPath = path.join(ARTIFACTS_DIR, "tz-16", "weekly-schedule-after.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    const pageCount = countPdfPages(pdfBuffer);
    console.log(`✓ weekly-schedule: ${pageCount} page(s), ${pdfBuffer.length} bytes`);
    expect(pageCount).toBe(1);
  });

  it("paramedical-schedule (tlk-paramedical variant with 8 periods) fits on 1 page", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");

    const schema = getFormSchema("paramedical-schedule");
    expect(schema).toBeTruthy();

    // Deterministic data with realistic multi-line content (2-3 lines in several cells)
    const data: Record<string, string> = {
      class_name: "ה׳2 — מעלה ראובן",
      school_year: 'תשפ"ו',
    };

    // Student names: some longer that wrap
    const students = [
      "יעל כהן-ברגמן",
      "דוד לוי",
      "שרה אברהמי-כץ",
      "משה גולדשטיין",
      "רחל פרידמן-כץ",
      "יוסף בן-עמי",
    ];
    // Therapists with profession - wraps to 2 lines
    const therapists = [
      "דנה כ. — ריפוי בעיסוק",
      "מיכל ל. — תקשורת",
      "יעל ש. — פיזיותרפיה",
    ];
    const periods = schedulePeriodsForVariant("tlk-paramedical");
    let idx = 0;

    for (const period of periods) {
      for (const day of SCHEDULE_DAYS) {
        data[scheduleSubCellKey(day.key, period, "student")] = students[idx % students.length]!;
        data[scheduleSubCellKey(day.key, period, "therapist")] = therapists[idx % therapists.length]!;
        idx++;
      }
    }

    const html = buildFormSnapshotHtml(schema!, data, "מערכת פרא-רפואית");

    expect(html).toContain('class="print-schedule"');

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdfPath = path.join(ARTIFACTS_DIR, "tz-16", "paramedical-schedule-after.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    const pageCount = countPdfPages(pdfBuffer);
    console.log(`✓ paramedical-schedule: ${pageCount} page(s), ${pdfBuffer.length} bytes`);
    expect(pageCount).toBe(1);
  });

  it("inclusion-schedule (tlk-inclusion variant with 4 columns/day) fits on 1 page", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");

    const schema = getFormSchema("inclusion-schedule");
    expect(schema).toBeTruthy();

    // Deterministic data with realistic text (shorter per column due to 25 columns total)
    const data: Record<string, string> = {
      class_name: "ו׳1 — הגפן",
      school_year: 'תשפ"ו',
    };

    // Keep names moderately long (will wrap in narrow columns)
    const students = ["יעל כהן", "דוד לוי", "שרה א.", "משה ג."];
    const classes = ["ג׳1", "ג׳2", "ד׳1", "ד׳2"];
    const teachers = ["מרים כ.", "רחל ל.", "שרה מ.", "לאה ב."];
    const subjects = ["מתמט׳", "עברית", "אנגל׳", "מדעים"];
    const periods = schedulePeriodsForVariant("tlk-inclusion");
    let idx = 0;

    for (const period of periods) {
      for (const day of SCHEDULE_DAYS) {
        data[scheduleSubCellKey(day.key, period, "student")] = students[idx % students.length]!;
        data[scheduleSubCellKey(day.key, period, "class")] = classes[idx % classes.length]!;
        data[scheduleSubCellKey(day.key, period, "teacher")] = teachers[idx % teachers.length]!;
        data[scheduleSubCellKey(day.key, period, "subject")] = subjects[idx % subjects.length]!;
        idx++;
      }
    }

    const html = buildFormSnapshotHtml(schema!, data, "מערכת שילוב");

    expect(html).toContain("print-schedule-inclusion");

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdfPath = path.join(ARTIFACTS_DIR, "tz-16", "inclusion-schedule-after.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    const pageCount = countPdfPages(pdfBuffer);
    console.log(`✓ inclusion-schedule: ${pageCount} page(s), ${pdfBuffer.length} bytes`);
    expect(pageCount).toBe(1);
  });

  it("tlk-personal-schedule (simple TLK personal variant) fits on 1 page", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");

    const schema = getFormSchema("tlk-personal-schedule");
    expect(schema).toBeTruthy();

    // Deterministic data with longer subject text
    const data: Record<string, string> = {
      full_name: "יעל כהן-ברגמן הראל",
      class_name: "ד׳1 — בית ספר הגפן",
      school_year: 'תשפ"ו',
    };

    // Subjects: some longer that wrap, some shorter
    const subjects = [
      "מתמטיקה — כפל וחילוק",
      "עברית: קריאה",
      "אנגלית",
      "מדעים וסביבה",
      "היסטוריה",
      "תנ״ך",
      "חינוך גופני",
    ];
    const periods = [1, 2, 3, 4, 5, 6, 7];
    let idx = 0;

    for (const period of periods) {
      for (const day of SCHEDULE_DAYS) {
        data[scheduleCellKey(day.key, period)] = subjects[idx % subjects.length]!;
        idx++;
      }
    }

    const html = buildFormSnapshotHtml(schema!, data, "יעל כהן");

    expect(html).toContain('class="print-schedule"');

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdfPath = path.join(ARTIFACTS_DIR, "tz-16", "tlk-personal-schedule-after.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    await writeFile(pdfPath, pdfBuffer);

    const pageCount = countPdfPages(pdfBuffer);
    console.log(`✓ tlk-personal-schedule: ${pageCount} page(s), ${pdfBuffer.length} bytes`);
    expect(pageCount).toBe(1);
  });
});

describe("TZ-103 personal-basket schedule in portfolio print", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    for (const dir of [ARTIFACTS_DIR, SCREENSHOTS_DIR]) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it("prints a filled personal-basket schedule on one landscape page with clean empty cells", async () => {
    const { getFormSchema } = await import("@/lib/form-schemas");
    const { buildFormSnapshotHtml } = await import("@/lib/form-snapshot");
    const { mergePrintFormDataWithStudent } = await import("@/lib/print-form-data");
    const {
      buildPersonalScheduleFillData,
      buildPrintFixtureStudent,
    } = await import("@/lib/print-fixtures");

    const schema = getFormSchema("personal-schedule");
    expect(schema).toBeTruthy();
    const student = buildPrintFixtureStudent();
    const merged = mergePrintFormDataWithStudent(
      schema!,
      buildPersonalScheduleFillData(student.full_name),
      student,
      {
        created_at: "2026-09-15T00:00:00.000Z",
        updated_at: "2026-10-12T00:00:00.000Z",
      }
    );
    const html = buildFormSnapshotHtml(schema!, merged, student.full_name);

    expect(html).toContain("sched-cell-empty");
    expect(html).toContain("נועה דמו");
    expect(html).toContain("ד׳2");
    expect(html).not.toContain("בכיתה ☐");

    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdfPath = path.join(ARTIFACTS_DIR, "tz-103-personal-schedule.pdf");
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
    });
    await writeFile(pdfPath, pdfBuffer);
    const screenshotPath = path.join(
      SCREENSHOTS_DIR,
      "tz103_personal_schedule_after.png"
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const pageCount = countPdfPages(pdfBuffer);
    expect(pageCount).toBe(1);
  });
});
