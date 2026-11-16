/**
 * Print-preview comparison for TZ-81 / TZ-83 follow-up:
 * original-look Ministry / TL"K / תל"א tables must match main layout;
 * data-grid value cells keep wrapping; personal-basket print stays waiver-free.
 *
 * Screenshots land in /opt/cursor/artifacts/screenshots.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import puppeteer, { Browser, Page } from "puppeteer";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { buildFormSnapshotHtml } from "@/lib/form-snapshot";
import { SHARED_PRINT_LAYOUT_CSS } from "@/lib/print-layout-css";
import { tableCellKey } from "@/lib/form-table-grids";
import {
  buildPortfolioCoverHtml,
  sanitizeEmbeddedStyles,
} from "@/lib/student-document-print";

const ARTIFACTS_DIR = "/opt/cursor/artifacts";
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, "screenshots");

/**
 * Table/break rules that lived in form-snapshot @media print on main
 * (before SHARED_PRINT_LAYOUT_CSS). Used as the comparison baseline.
 */
const MAIN_PRINT_TABLE_CSS = `
      table,
      .homeroom-grid,
      .holistic-grid,
      .cluster-card,
      .schedule-grid,
      .data-grid {
        page-break-inside: auto;
        break-inside: auto;
      }
      .data-grid th,
      .data-grid td,
      .schedule-grid th,
      .schedule-grid td {
        word-wrap: break-word;
        overflow-wrap: anywhere;
      }
      .sign-row {
        page-break-inside: avoid;
        break-inside: avoid;
      }
`;

function htmlAsOnMain(html: string): string {
  return html.replace(SHARED_PRINT_LAYOUT_CSS, MAIN_PRINT_TABLE_CSS);
}

function extractStyles(html: string): string {
  const styles: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(html))) {
    styles.push(match[1]!);
  }
  return sanitizeEmbeddedStyles(styles.join("\n"));
}

function extractBody(html: string): string {
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return bodyMatch?.[1] ?? html;
}

/** Same table-splitting override as `printStudentDocuments` on main. */
const FOLDER_PRINT_TABLE_CSS = `
    .print-doc + .print-doc {
      break-before: page;
      page-break-before: always;
    }
    .print-doc-body .holistic-grid,
    .print-doc-body .cluster-card,
    .print-doc-body table {
      page-break-inside: auto !important;
      break-inside: auto !important;
    }
    .print-doc-body .data-grid tr,
    .print-doc-body .homeroom-grid tr,
    .print-doc-body .holistic-cell {
      page-break-inside: avoid;
      break-inside: avoid;
    }
`;

/** Folder-print window: embedded form styles first, then shared layout CSS. */
function printWindowHtml(
  snapshotHtml: string,
  sharedCss: string,
  opts?: { folderPrint?: boolean; extraBody?: string }
): string {
  const styles = extractStyles(snapshotHtml);
  const body = extractBody(snapshotHtml);
  const folderCss = opts?.folderPrint ? FOLDER_PRINT_TABLE_CSS : "";
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 1.5cm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .print-doc-body .page, .print-doc-body .page-sheet {
      min-height: 0 !important;
      height: auto !important;
      width: auto !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 2mm !important;
      border: none !important;
    }
    ${folderCss}
    ${styles}
    ${sharedCss}
  </style>
</head>
<body>
  ${opts?.extraBody ?? ""}
  <section class="print-doc print-doc-form">
    <div class="print-doc-body">${body}</div>
  </section>
</body>
</html>`;
}

type TableProbe = {
  found: boolean;
  tableLayout: string | null;
  pageBreakInside: string | null;
  tdWhiteSpace: string | null;
  thWhiteSpace: string | null;
  yesNoWhiteSpace: string | null;
};

async function probeTable(page: Page, selector: string): Promise<TableProbe> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return {
        found: false,
        tableLayout: null,
        pageBreakInside: null,
        tdWhiteSpace: null,
        thWhiteSpace: null,
        yesNoWhiteSpace: null,
      };
    }
    const cs = getComputedStyle(el);
    const td = el.querySelector("td");
    const th = el.querySelector("th");
    const yesNo = document.querySelector(".rq-yesno");
    return {
      found: true,
      tableLayout: cs.tableLayout,
      pageBreakInside: cs.pageBreakInside,
      tdWhiteSpace: td ? getComputedStyle(td).whiteSpace : null,
      thWhiteSpace: th ? getComputedStyle(th).whiteSpace : null,
      yesNoWhiteSpace: yesNo ? getComputedStyle(yesNo).whiteSpace : null,
    };
  }, selector);
}

function countPdfPages(pdfBuffer: Uint8Array): number {
  const pdfStr = Buffer.from(pdfBuffer).toString("latin1");
  const simpleCountMatch = pdfStr.match(/\/Type\s+\/Pages\s*\n\/Count\s+(\d+)/);
  if (simpleCountMatch?.[1]) return parseInt(simpleCountMatch[1], 10);
  const inlineCountMatch = pdfStr.match(/\/Type\s+\/Pages[^>]*\/Count\s+(\d+)/);
  if (inlineCountMatch?.[1]) return parseInt(inlineCountMatch[1], 10);
  return pdfStr.match(/\/Type\s+\/Page(?!s)/g)?.length ?? 0;
}

async function screenshotPrint(
  page: Page,
  html: string,
  filename: string
): Promise<void> {
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.emulateMediaType("print");
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, filename),
    fullPage: true,
  });
}

async function pdfPages(page: Page, html: string, filename: string): Promise<number> {
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.emulateMediaType("print");
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "1.5cm", right: "1.5cm", bottom: "1.5cm", left: "1.5cm" },
  });
  await writeFile(path.join(ARTIFACTS_DIR, filename), pdf);
  return countPdfPages(pdf);
}

const moeData = {
  referral_source: "צוות חינוכי",
  referral_date: "2026-09-01",
  first_name: "אורי",
  last_name: "לוי",
  id_number: "123456789",
  gender: "male",
  institution_type: "special",
  father_name: "דוד",
  parent1_phone: "050-1234567",
  phone: "02-9999999",
  had_prior_discussion: "yes",
  student_description: "שורה ראשונה\nשורה שנייה",
  principal_name: "רות כהן",
};

const tlaData = {
  full_name: "יעל כהן",
  class_name: "ג1",
  domain: "שפה",
  weekly_hours: "3",
  current_status: "מצב נוכחי\nשורה שנייה",
  main_goal: "שיפור קריאה",
  [tableCellKey("tachi-goals", 0, "goal")]: "יעד ארוך — פירוט שיטות ואמצעים",
};

const tlkData = {
  class_name: "ג1",
  school_year: 'תשפ"ו',
  homeroom_teacher: "מורה דמו",
  [tableCellKey("tlk-summary-subjects", 0, "cluster")]: "יהדות",
  [tableCellKey("tlk-summary-subjects", 0, "subject")]: "תורה",
  [tableCellKey("tlk-summary-subjects", 0, "weekly_hours")]: "4",
};

describe("print-preview vs main (MOE / TLA / TLK / personal-basket)", () => {
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
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  }, 60_000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it("Ministry original-look tables match main table-layout and cell wrapping", async () => {
    const schema = getFormSchema("referral-questionnaire");
    expect(schema).toBeTruthy();
    const snapshot = buildFormSnapshotHtml(schema!, moeData, "אורי לוי");
    const current = printWindowHtml(snapshot, SHARED_PRINT_LAYOUT_CSS);
    const mainLike = printWindowHtml(htmlAsOnMain(snapshot), MAIN_PRINT_TABLE_CSS);

    await screenshotPrint(page, current, "moe-referral-current.png");
    await screenshotPrint(page, mainLike, "moe-referral-main.png");
    const currentPages = await pdfPages(page, current, "moe-referral-current.pdf");
    const mainPages = await pdfPages(page, mainLike, "moe-referral-main.pdf");
    expect(currentPages).toBe(mainPages);

    await page.setContent(current, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const currentProbe = await probeTable(page, ".rq-grid");

    await page.setContent(mainLike, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const mainProbe = await probeTable(page, ".rq-grid");

    expect(currentProbe.found).toBe(true);
    expect(mainProbe.found).toBe(true);
    expect(currentProbe.tableLayout).toBe(mainProbe.tableLayout);
    expect(currentProbe.tdWhiteSpace).toBe(mainProbe.tdWhiteSpace);
    expect(currentProbe.thWhiteSpace).toBe(mainProbe.thWhiteSpace);
    expect(currentProbe.yesNoWhiteSpace).toBe("nowrap");
    expect(currentProbe.tdWhiteSpace).not.toBe("pre-wrap");
    expect(currentProbe.thWhiteSpace).not.toBe("pre-wrap");
  }, 60_000);

  it("תל\"א generic field tables match main; data-grid values still wrap", async () => {
    const schema = getFormSchema("tla");
    expect(schema).toBeTruthy();
    const snapshot = buildFormSnapshotHtml(schema!, tlaData, "יעל כהן");
    const current = printWindowHtml(snapshot, SHARED_PRINT_LAYOUT_CSS);
    const mainLike = printWindowHtml(htmlAsOnMain(snapshot), MAIN_PRINT_TABLE_CSS);

    await screenshotPrint(page, current, "tla-form-current.png");
    await screenshotPrint(page, mainLike, "tla-form-main.png");
    const currentPages = await pdfPages(page, current, "tla-form-current.pdf");
    const mainPages = await pdfPages(page, mainLike, "tla-form-main.pdf");
    expect(currentPages).toBe(mainPages);

    await page.setContent(current, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const genericCurrent = await probeTable(
      page,
      ".doc-body > table:not(.data-grid):not(.homeroom-grid):not(.schedule-grid)"
    );
    const gridCurrent = await probeTable(page, ".data-grid");

    await page.setContent(mainLike, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const genericMain = await probeTable(
      page,
      ".doc-body > table:not(.data-grid):not(.homeroom-grid):not(.schedule-grid)"
    );
    const gridMain = await probeTable(page, ".data-grid");

    expect(genericCurrent.found).toBe(true);
    expect(genericMain.found).toBe(true);
    expect(genericCurrent.tableLayout).toBe("auto");
    expect(genericCurrent.tableLayout).toBe(genericMain.tableLayout);
    expect(genericCurrent.tdWhiteSpace).toBe(genericMain.tdWhiteSpace);
    expect(genericCurrent.tdWhiteSpace).not.toBe("pre-wrap");

    expect(gridCurrent.found).toBe(true);
    expect(gridCurrent.tableLayout).toBe("fixed");
    expect(gridCurrent.tdWhiteSpace).toBe("pre-wrap");
    expect(gridCurrent.thWhiteSpace).not.toBe("pre-wrap");
    expect(gridMain.tdWhiteSpace).not.toBe("pre-wrap");
  }, 60_000);

  it("TL\"K summary generic fields match main; subjects grid stays fixed", async () => {
    const schema = getFormSchema("tlk-summary");
    expect(schema).toBeTruthy();
    const snapshot = buildFormSnapshotHtml(schema!, tlkData, 'תל"כ — ג1');
    const current = printWindowHtml(snapshot, SHARED_PRINT_LAYOUT_CSS);
    const mainLike = printWindowHtml(htmlAsOnMain(snapshot), MAIN_PRINT_TABLE_CSS);

    await screenshotPrint(page, current, "tlk-summary-current.png");
    await screenshotPrint(page, mainLike, "tlk-summary-main.png");
    const currentPages = await pdfPages(page, current, "tlk-summary-current.pdf");
    const mainPages = await pdfPages(page, mainLike, "tlk-summary-main.pdf");
    expect(currentPages).toBe(mainPages);

    await page.setContent(current, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const genericCurrent = await probeTable(
      page,
      ".doc-body > table:not(.data-grid):not(.homeroom-grid):not(.schedule-grid)"
    );
    const gridCurrent = await probeTable(page, ".data-grid");

    await page.setContent(mainLike, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const genericMain = await probeTable(
      page,
      ".doc-body > table:not(.data-grid):not(.homeroom-grid):not(.schedule-grid)"
    );

    expect(genericCurrent.found).toBe(true);
    expect(genericCurrent.tableLayout).toBe(genericMain.tableLayout);
    expect(genericCurrent.tableLayout).toBe("auto");
    expect(genericCurrent.tdWhiteSpace).not.toBe("pre-wrap");
    expect(gridCurrent.found).toBe(true);
    expect(gridCurrent.tableLayout).toBe("fixed");
    expect(gridCurrent.tdWhiteSpace).toBe("pre-wrap");
  }, 60_000);

  it("folder/portfolio print of the Ministry referral form matches main page breaks", async () => {
    const schema = getFormSchema("referral-questionnaire");
    expect(schema).toBeTruthy();
    const snapshot = buildFormSnapshotHtml(schema!, moeData, "אורי לוי");
    const cover = buildPortfolioCoverHtml({
      studentName: "אורי לוי",
      yearLabel: 'תשפ"ו',
      kindLabel: "תיק סל אישי",
      className: "ג1",
    });
    const current = printWindowHtml(snapshot, SHARED_PRINT_LAYOUT_CSS, {
      folderPrint: true,
      extraBody: cover,
    });
    const mainLike = printWindowHtml(
      htmlAsOnMain(snapshot),
      MAIN_PRINT_TABLE_CSS,
      { folderPrint: true, extraBody: cover }
    );

    await screenshotPrint(page, current, "moe-folder-print-current.png");
    await screenshotPrint(page, mainLike, "moe-folder-print-main.png");
    const currentPages = await pdfPages(
      page,
      current,
      "moe-folder-print-current.pdf"
    );
    const mainPages = await pdfPages(page, mainLike, "moe-folder-print-main.pdf");
    expect(currentPages).toBe(mainPages);
    expect(currentPages).toBeGreaterThanOrEqual(1);

    await page.setContent(current, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const currentProbe = await probeTable(page, ".rq-grid");
    await page.setContent(mainLike, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const mainProbe = await probeTable(page, ".rq-grid");

    expect(currentProbe.found).toBe(true);
    expect(currentProbe.pageBreakInside).toBe(mainProbe.pageBreakInside);
    expect(currentProbe.pageBreakInside).toBe("auto");
    expect(currentProbe.tableLayout).toBe(mainProbe.tableLayout);
    expect(current).not.toMatch(/טופס\s*ויתור\s*סודיות/);
  }, 60_000);

  it("long generic form printed on its own matches main page breaks", async () => {
    const schema = getFormSchema("student-info");
    expect(schema).toBeTruthy();
    const long =
      "פירוט ארוך שנועד למלא את שורת הערך כך שהטבלה תתפרס על יותר מעמוד אחד במקום לקפוץ בשלמותה. ";
    const data: Record<string, string> = {};
    for (const field of listFormFields(schema!)) {
      if (
        field.type === "static" ||
        field.type === "signature" ||
        field.type === "row-table" ||
        field.type === "schedule-grid" ||
        field.type === "rating-grid"
      ) {
        continue;
      }
      data[field.key] = long.repeat(6);
    }
    const snapshot = buildFormSnapshotHtml(schema!, data, "יעל כהן");
    const current = printWindowHtml(snapshot, SHARED_PRINT_LAYOUT_CSS);
    const mainLike = printWindowHtml(
      htmlAsOnMain(snapshot),
      MAIN_PRINT_TABLE_CSS
    );

    await screenshotPrint(page, current, "long-generic-current.png");
    await screenshotPrint(page, mainLike, "long-generic-main.png");
    const currentPages = await pdfPages(
      page,
      current,
      "long-generic-current.pdf"
    );
    const mainPages = await pdfPages(page, mainLike, "long-generic-main.pdf");
    expect(currentPages).toBe(mainPages);
    expect(currentPages).toBeGreaterThan(1);

    await page.setContent(current, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const currentProbe = await probeTable(
      page,
      ".doc-body > table:not(.data-grid):not(.homeroom-grid):not(.schedule-grid)"
    );
    await page.setContent(mainLike, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const mainProbe = await probeTable(
      page,
      ".doc-body > table:not(.data-grid):not(.homeroom-grid):not(.schedule-grid)"
    );

    expect(currentProbe.found).toBe(true);
    expect(currentProbe.pageBreakInside).toBe("auto");
    expect(currentProbe.pageBreakInside).toBe(mainProbe.pageBreakInside);
    expect(currentProbe.tableLayout).toBe("auto");
    expect(currentProbe.tdWhiteSpace).not.toBe("pre-wrap");
  }, 60_000);

  it("parent-conversations print: date column is narrow, summary is wide (TZ-86)", async () => {
    const schema = getFormSchema("parent-conversations");
    expect(schema).toBeTruthy();
    const snapshot = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "יעל כהן",
        [tableCellKey("parent-conversations", 0, "date")]: "2026-11-04",
        [tableCellKey("parent-conversations", 0, "summary")]:
          "שיחת היכרות עם ההורים. הוצגו מטרות העבודה לשנה, כולל תמיכה בקשב וליווי בתהליך הלמידה. סוכמו דרכי תקשורת להמשך המעקב במהלך השנה.",
      },
      "יעל כהן"
    );
    const current = printWindowHtml(snapshot, SHARED_PRINT_LAYOUT_CSS, {
      folderPrint: true,
    });

    expect(current).toContain("data-grid-date-summary");
    expect(current).toContain("04/11/2026");
    expect(current).not.toMatch(/טופס\s*ויתור\s*סודיות/);

    await screenshotPrint(page, current, "tz86-parent-conversations-after.png");
    const tableEl = await page.$(".data-grid-date-summary");
    expect(tableEl).toBeTruthy();
    await tableEl!.screenshot({
      path: path.join(SCREENSHOTS_DIR, "tz86-parent-conversations-table.png"),
    });
    const pages = await pdfPages(
      page,
      current,
      "tz86-parent-conversations-after.pdf"
    );
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(pages).toBeLessThan(3);

    await page.setContent(current, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const metrics = await page.evaluate(() => {
      const table = document.querySelector(".data-grid-date-summary");
      if (!table) return null;
      const dateCell = table.querySelector("td.data-grid-col-date");
      const summaryCell = table.querySelector("td.data-grid-col-wide");
      const emptyRows = table.querySelectorAll("tr.data-grid-row-empty").length;
      const filledRow = table.querySelector("tbody tr:not(.data-grid-row-empty)");
      if (!dateCell || !summaryCell) return null;
      const dateBox = dateCell.getBoundingClientRect();
      const summaryBox = summaryCell.getBoundingClientRect();
      const filledBox = filledRow?.getBoundingClientRect();
      return {
        dateWidth: dateBox.width,
        summaryWidth: summaryBox.width,
        filledHeight: filledBox?.height ?? 0,
        emptyRows,
        tableWidth: table.getBoundingClientRect().width,
      };
    });

    expect(metrics).toBeTruthy();
    expect(metrics!.summaryWidth).toBeGreaterThan(metrics!.dateWidth * 3);
    expect(metrics!.dateWidth / metrics!.tableWidth).toBeGreaterThan(0.1);
    expect(metrics!.dateWidth / metrics!.tableWidth).toBeLessThan(0.25);
    expect(metrics!.summaryWidth / metrics!.tableWidth).toBeGreaterThan(0.7);
    expect(metrics!.emptyRows).toBe(7);
    expect(metrics!.filledHeight).toBeLessThan(220);
  }, 60_000);

  it("personal-basket print bundle has no school waiver and keeps card tables auto", async () => {
    const card = getFormSchema("personal-basket-card");
    expect(card).toBeTruthy();
    const cardSnapshot = buildFormSnapshotHtml(
      card!,
      { full_name: "יעל כהן", class_name: "ג1" },
      "יעל כהן"
    );
    const cover = buildPortfolioCoverHtml({
      studentName: "יעל כהן",
      yearLabel: 'תשפ"ו',
      kindLabel: "תיק סל אישי",
      className: "ג1",
    });
    const bundle = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    ${extractStyles(cardSnapshot)}
    ${SHARED_PRINT_LAYOUT_CSS}
  </style>
</head>
<body>
  ${cover}
  <section class="print-doc print-doc-form">
    <div class="print-doc-body">${extractBody(cardSnapshot)}</div>
  </section>
</body>
</html>`;

    expect(bundle).toContain("תיק סל אישי");
    expect(bundle).toContain("כרטיס תלמיד סל אישי");
    expect(bundle).not.toMatch(/טופס\s*ויתור\s*סודיות/);
    expect(bundle).not.toContain("waiver-confidentiality");

    await screenshotPrint(page, bundle, "personal-basket-print-current.png");

    await page.setContent(bundle, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const generic = await probeTable(
      page,
      ".doc-body > table:not(.data-grid):not(.homeroom-grid):not(.schedule-grid)"
    );
    expect(generic.found).toBe(true);
    expect(generic.tableLayout).toBe("auto");
    expect(generic.tdWhiteSpace).not.toBe("pre-wrap");
  }, 60_000);

  it("staff-meetings print: date is narrow, text columns are readable, empty rows dropped (TZ-90)", async () => {
    const schema = getFormSchema("staff-meetings");
    expect(schema).toBeTruthy();
    const snapshot = buildFormSnapshotHtml(
      schema!,
      {
        full_name: "יעל כהן",
        [tableCellKey("staff-meetings", 0, "date")]: "2026-10-07",
        [tableCellKey("staff-meetings", 0, "participants")]:
          "המורה, יועצת, רכזת שילוב",
        [tableCellKey("staff-meetings", 0, "summary")]:
          "הוחלט על רשימת הבנות שהצטרפו ללמידה בקבוצה וסוכמו המלצות להמשך.",
        [tableCellKey("staff-meetings", 2, "date")]: "2026-10-19",
        [tableCellKey("staff-meetings", 2, "participants")]: "צוות",
        [tableCellKey("staff-meetings", 2, "summary")]: "מעקב נוסף.",
      },
      "יעל כהן"
    );
    const current = printWindowHtml(snapshot, SHARED_PRINT_LAYOUT_CSS, {
      folderPrint: true,
    });

    expect(current).toContain('class="data-grid data-grid-date-notes"');
    expect(current).not.toContain('class="data-grid data-grid-date-summary"');
    expect(current).toContain("07/10/2026");
    const grid = current.match(
      /<table class="data-grid data-grid-date-notes">[\s\S]*?<\/table>/
    )?.[0];
    expect(grid).toBeTruthy();
    expect(grid!.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g)?.length).toBe(
      2
    );

    await screenshotPrint(page, current, "tz90-staff-meetings-after.png");
    await page.setContent(current, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const metrics = await page.evaluate(() => {
      const table = document.querySelector(".data-grid-date-notes");
      if (!table) return null;
      const dateCell = table.querySelector("td.data-grid-col-date");
      const wides = table.querySelectorAll("td.data-grid-col-wide");
      const emptyRows = table.querySelectorAll("tr.data-grid-row-empty").length;
      const bodyRows = table.querySelectorAll("tbody > tr").length;
      if (!dateCell || wides.length < 2) return null;
      const dateBox = dateCell.getBoundingClientRect();
      const participantsBox = wides[0]!.getBoundingClientRect();
      const summaryBox = wides[1]!.getBoundingClientRect();
      return {
        dateWidth: dateBox.width,
        participantsWidth: participantsBox.width,
        summaryWidth: summaryBox.width,
        emptyRows,
        bodyRows,
        tableWidth: table.getBoundingClientRect().width,
      };
    });

    expect(metrics).toBeTruthy();
    expect(metrics!.bodyRows).toBeGreaterThanOrEqual(2);
    expect(metrics!.bodyRows).toBeLessThan(8);
    expect(metrics!.emptyRows).toBe(0);
    expect(metrics!.dateWidth / metrics!.tableWidth).toBeLessThan(0.22);
    expect(metrics!.summaryWidth).toBeGreaterThan(metrics!.dateWidth);
    expect(metrics!.participantsWidth).toBeGreaterThan(metrics!.dateWidth * 0.8);
    expect(metrics!.summaryWidth).toBeGreaterThan(metrics!.participantsWidth);
  }, 60_000);
});
