const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

/**
 * בונה קובץ אקסל לדוגמה לייבוא תלמידי שילוב (כותרות בלבד), RTL.
 * נשמר ב-public/samples/integration-students-sample.xlsx
 */
async function build() {
  const headers = [
    "שם משפחה",
    "שם פרטי",
    "ת.ז.",
    "ת. לידה",
    "כתה",
    "ז/נ",
    "כתובת",
    "ישוב",
    "שם האב",
    "נייד אב",
    "מייל אבא",
    "שם האם",
    "נייד אם",
    "מייל אמא",
    "מייל הורים",
    "מורה אחראית",
    "תאריך כניסה לשילוב",
    "מצב משפחתי",
    "אחראי יחיד",
    "מחנכת",
    "טיפולים נוספים",
    "הערות",
    "שנה קלנדרית",
  ];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("תלמידים", {
    views: [{ rightToLeft: true, state: "normal", activeCell: "A1" }],
  });
  sheet.addRow(headers);
  sheet.columns = headers.map((h) => ({
    width: Math.max(12, h.length + 2),
  }));

  const outPath = path.join(
    process.cwd(),
    "public",
    "samples",
    "integration-students-sample.xlsx"
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await workbook.xlsx.writeFile(outPath);

  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(outPath);
  const rows = check.worksheets[0]?.getRow(1)?.values ?? [];
  const headerCells = Array.isArray(rows)
    ? rows.filter((_, i) => i > 0)
    : [];
  if (headerCells.length !== headers.length) {
    throw new Error("expected header-only sheet");
  }
  console.log("built", outPath);
  console.log("headers", headerCells);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
