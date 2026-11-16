/**
 * Generate print walkthrough screenshots from fake fixtures (no real students).
 */
import { mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const ARTIFACTS = "/opt/cursor/artifacts/screenshots";

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAIElEQVQYV2NkYGD4z0AEYCJHDZwKRg0cNXDUwFEDQQwEAJ0vAQF8xQ6qAAAAAElFTkSuQmCC";

function oldCrowdedScheduleHtml() {
  const dayHeaders = DAYS.map((d) => `<th>${escapeHtml(d)}</th>`).join("");
  const body = [1, 2, 3, 4, 5, 6, 7]
    .map((period) => {
      const cells = DAYS.map(
        () => `<td class="sched-cell">
          <div class="sched-subject">&nbsp;</div>
          <div class="sched-flags"><span>בכיתה ☐</span><span>אחר ☐</span></div>
        </td>`
      ).join("");
      return `<tr><th class="period">${period}</th>${cells}</tr>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"/>
<title>לפני — מערכת שעות אישית</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; margin: 12mm; color: #111; background: #fff; }
  h1 { font-size: 16pt; color: #2f3b67; margin: 0 0 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed; }
  th, td { border: 0.4pt solid #333; padding: 1.4mm 0.6mm; vertical-align: top; text-align: center; }
  .meta { margin: 0 0 4mm; }
  .meta th, .meta td { border: none; text-align: right; font-size: 11pt; }
  .sched-flags { color: #64748b; font-size: 7pt; }
</style></head>
<body>
  <h1>מערכת שעות אישית</h1>
  <table class="meta">
    <tr><th>שם התלמיד/ה</th><td>—</td></tr>
    <tr><th>תאריך</th><td>—</td></tr>
    <tr><th>כיתה</th><td>—</td></tr>
  </table>
  <table class="schedule-grid">
    <thead><tr><th></th>${dayHeaders}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`;
}

function uploadsHtml() {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"/>
<title>העלאות להדפסה</title>
<style>
  body { font-family: Arial, "Segoe UI", sans-serif; margin: 14mm; color: #111; background: #fff; }
  h1 { color: #2f3b67; font-size: 18pt; margin: 0 0 6mm; }
  .card { border: 1pt solid #d7dde5; border-radius: 6px; padding: 4mm 5mm; margin: 0 0 4mm; }
  .name { color: #084e76; font-size: 13pt; font-weight: 700; margin: 0 0 2mm; }
  .ok { color: #166534; font-weight: 700; margin: 0; }
  .print-cover-kind { font-size: 22pt; font-weight: 700; color: #2f3b67; text-align: center; margin: 0 0 8mm; }
  .print-cover-value { border-bottom: 1.5px solid #2f3b67; color: #07527d; font-weight: 700; padding: 0 4px; }
</style></head>
<body>
  <p class="print-cover-kind">תיק סל אישי</p>
  <p style="text-align:center;font-size:14pt">לתלמיד/ה <span class="print-cover-value">נועה דמו</span>
  · כיתה <span class="print-cover-value">ד׳2</span></p>
  <h1>מסמכים שהועלו — שמות עם רווחים וסוגריים</h1>
  <div class="card">
    <p class="name">מכתב רופא ADHD (1).pdf</p>
    <p class="ok">זוהה כ-PDF · מוכן להדפסה · לא טקסט נפילה</p>
  </div>
  <div class="card">
    <p class="name">סיכום ועדה חינוכית (טיוטה).docx</p>
    <p class="ok">זוהה כ-Word · מוכן להדפסה</p>
  </div>
  <div class="card">
    <p class="name">צילום אישור שילוב.png</p>
    <p class="ok">זוהה כתמונה</p>
    <img src="${PNG}" alt="" width="48" height="48" />
  </div>
</body></html>`;
}

async function main() {
  if (!existsSync(ARTIFACTS)) await mkdir(ARTIFACTS, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  async function shot(html, name) {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const file = path.join(ARTIFACTS, name);
    await page.screenshot({ path: file, fullPage: true });
    console.log("wrote", file);
  }

  await shot(oldCrowdedScheduleHtml(), "tz103_schedule_before_reconstructed.png");
  await shot(uploadsHtml(), "tz102_uploads_special_names.png");

  const afterPath = path.join(ARTIFACTS, "tz103_personal_schedule_after.png");
  if (existsSync(afterPath)) {
    console.log("kept", afterPath);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
