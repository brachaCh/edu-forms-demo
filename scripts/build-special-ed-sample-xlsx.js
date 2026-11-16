const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

/**
 * בונה קובץ אקסל לדוגמה לייבוא תלמידי כיתת חינוך מיוחד (כותרות בלבד), RTL.
 * כולל את כל השדות שהאשף והייבוא תומכים בהם.
 * מיושר עם TZ-20 (סל אישי) אך משתמש ב"מחנכת" במקום "מורה אחראית".
 * נשמר ב-public/samples/special-ed-class-students-sample.xlsx
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
    "מחנכת",
    "אפיון",
    "תיאור תפקוד",
    "תאריך כניסה לשילוב",
    "מייל הורים",
    "מצב משפחתי",
    "אחראי יחיד",
    "תאריך וועדת אפיון וזכאות",
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
    "special-ed-class-students-sample.xlsx"
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
