/** בניית מייל עדכון להורים מישיבת צוות */

import {
  resolveTableRowCount,
  tableCellKey,
} from "@/lib/form-table-grids";
import { formatStudentDisplayName } from "@/lib/person-name";

export const STAFF_MEETINGS_TABLE_ID = "staff-meetings";
export const STAFF_MEETINGS_FORM_ID = "staff-meetings";

export type StaffMeetingRow = {
  rowIndex: number;
  date: string;
  participants: string;
  summary: string;
};

export function isStaffMeetingsForm(
  schema: { id: string } | null | undefined
): boolean {
  return schema?.id === STAFF_MEETINGS_FORM_ID;
}

export function getStaffMeetingRow(
  data: Record<string, string>,
  rowIndex: number
): StaffMeetingRow {
  return {
    rowIndex,
    date: (data[tableCellKey(STAFF_MEETINGS_TABLE_ID, rowIndex, "date")] ?? "").trim(),
    participants: (
      data[tableCellKey(STAFF_MEETINGS_TABLE_ID, rowIndex, "participants")] ?? ""
    ).trim(),
    summary: (
      data[tableCellKey(STAFF_MEETINGS_TABLE_ID, rowIndex, "summary")] ?? ""
    ).trim(),
  };
}

export function staffMeetingRowHasContent(row: StaffMeetingRow): boolean {
  return Boolean(row.date || row.participants || row.summary);
}

export function listStaffMeetingRows(
  data: Record<string, string>
): StaffMeetingRow[] {
  const rowCount = resolveTableRowCount(STAFF_MEETINGS_TABLE_ID, data);
  const rows: StaffMeetingRow[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const row = getStaffMeetingRow(data, r);
    if (!staffMeetingRowHasContent(row)) continue;
    rows.push(row);
  }
  return rows;
}

export function formatStaffMeetingDateForEmail(raw: string): string {
  const value = raw.trim();
  if (!value) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const d = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("he-IL");
    }
  }
  return value;
}

function escapeStaffMeetingHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML למייל מטקסט שערכה המורה לפני שליחה */
export function buildStaffMeetingParentEmailHtmlFromText(
  subject: string,
  text: string
): string {
  const rtlStyle =
    "margin:0 0 14px;line-height:1.7;direction:rtl;text-align:right;";
  const body = text
    .split("\n")
    .map((line) =>
      line.trim() === ""
        ? `<p dir="rtl" style="${rtlStyle}">&nbsp;</p>`
        : `<p dir="rtl" style="${rtlStyle}">${escapeStaffMeetingHtml(line)}</p>`
    )
    .join("\n    ");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body dir="rtl" style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#111;direction:rtl;text-align:right;">
  <div dir="rtl" align="right" style="max-width:640px;margin:24px auto;background:#fff;border-radius:14px;padding:24px;border:1px solid #d7deea;direction:rtl;text-align:right;">
    <h1 dir="rtl" style="margin:0 0 18px;font-size:20px;color:#2f3b67;direction:rtl;text-align:right;">${escapeStaffMeetingHtml(subject)}</h1>
    ${body}
  </div>
</body>
</html>`;
}

export function buildStaffMeetingParentEmail(args: {
  studentName: string;
  meeting: StaffMeetingRow;
}): { subject: string; text: string; html: string } {
  const name =
    formatStudentDisplayName(args.studentName).trim() ||
    args.studentName.trim() ||
    "התלמיד/ה";
  const dateLabel = formatStaffMeetingDateForEmail(args.meeting.date);
  const participants = args.meeting.participants.trim() || "—";
  const summary = args.meeting.summary.trim();

  const subject = `עדכון מישיבת צוות בנוגע ל${name}`;

  const paragraphs = [
    `להורים היקרים של ${name}, שלום רב.`,
    "",
    `בתאריך ${dateLabel} קיימנו ישיבת צוות בית-ספרית בעניינו/ה של ${name}, בהשתתפות ${participants}.`,
    "",
    "מטרת המפגש הייתה לבחון את התקדמותו/ה ולגבש תוכנית עבודה מיטבית עבורו/ה.",
  ];

  if (summary) {
    paragraphs.push("", summary);
  }

  paragraphs.push(
    "",
    `אנו מאמינים בשיתוף פעולה הדוק בין הבית לבית הספר ומשוכנעים שצעדים אלו יסייעו ל${name} להמשיך ולהתקדם.`,
    "",
    "נשמח לעמוד לרשותכם בכל שאלה או מחשבה.",
    "",
    "ההנהלה וצוות בית הספר"
  );

  const text = paragraphs.join("\n");

  const escape = escapeStaffMeetingHtml;

  const rtlStyle =
    "margin:0 0 14px;line-height:1.7;direction:rtl;text-align:right;";

  const htmlParts = [
    `<p dir="rtl" style="${rtlStyle}">להורים היקרים של <strong>${escape(name)}</strong>, שלום רב.</p>`,
    `<p dir="rtl" style="${rtlStyle}">בתאריך <strong>${escape(dateLabel)}</strong> קיימנו ישיבת צוות בית-ספרית בעניינו/ה של <strong>${escape(name)}</strong>, בהשתתפות ${escape(participants)}.</p>`,
    `<p dir="rtl" style="${rtlStyle}">מטרת המפגש הייתה לבחון את התקדמותו/ה ולגבש תוכנית עבודה מיטבית עבורו/ה.</p>`,
  ];

  if (summary) {
    htmlParts.push(
      `<div dir="rtl" style="margin:0 0 16px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;line-height:1.7;white-space:pre-wrap;direction:rtl;text-align:right;">${escape(summary)}</div>`
    );
  }

  htmlParts.push(
    `<p dir="rtl" style="${rtlStyle}">אנו מאמינים בשיתוף פעולה הדוק בין הבית לבית הספר ומשוכנעים שצעדים אלו יסייעו ל${escape(name)} להמשיך ולהתקדם.</p>`,
    `<p dir="rtl" style="${rtlStyle}">נשמח לעמוד לרשותכם בכל שאלה או מחשבה.</p>`,
    `<p dir="rtl" style="margin:0;line-height:1.7;direction:rtl;text-align:right;">ההנהלה וצוות בית הספר</p>`
  );

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body dir="rtl" style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#111;direction:rtl;text-align:right;">
  <div dir="rtl" align="right" style="max-width:640px;margin:24px auto;background:#fff;border-radius:14px;padding:24px;border:1px solid #d7deea;direction:rtl;text-align:right;">
    <h1 dir="rtl" style="margin:0 0 18px;font-size:20px;color:#2f3b67;direction:rtl;text-align:right;">${escape(subject)}</h1>
    ${htmlParts.join("\n    ")}
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/** מסמך הדפסה לישיבת צוות בודדת */
export function buildStaffMeetingPrintHtml(args: {
  studentName: string;
  meeting: StaffMeetingRow;
}): string {
  const name =
    formatStudentDisplayName(args.studentName).trim() ||
    args.studentName.trim() ||
    "התלמיד/ה";
  const dateLabel = formatStaffMeetingDateForEmail(args.meeting.date);
  const participants = args.meeting.participants.trim() || "—";
  const summary = args.meeting.summary.trim() || "—";

  const escape = escapeStaffMeetingHtml;

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>ישיבת צוות — ${escape(name)}</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      direction: rtl;
      text-align: right;
      line-height: 1.7;
    }
    h1 { margin: 0 0 8px; font-size: 22px; color: #2f3b67; }
    .meta { margin: 0 0 18px; color: #555; font-size: 14px; }
    .card {
      border: 1px solid #d7deea;
      border-radius: 12px;
      padding: 16px 18px;
      margin-bottom: 14px;
      background: #fff;
    }
    .label { font-size: 12px; font-weight: 700; color: #6b7280; margin-bottom: 4px; }
    .value { white-space: pre-wrap; font-size: 15px; }
    @media print {
      body { padding: 12px; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>סיכום ישיבת צוות</h1>
  <p class="meta">תלמיד/ה: <strong>${escape(name)}</strong></p>
  <div class="card">
    <div class="label">תאריך</div>
    <div class="value">${escape(dateLabel)}</div>
  </div>
  <div class="card">
    <div class="label">משתתפים</div>
    <div class="value">${escape(participants)}</div>
  </div>
  <div class="card">
    <div class="label">סיכום והמלצות</div>
    <div class="value">${escape(summary)}</div>
  </div>
</body>
</html>`;
}
