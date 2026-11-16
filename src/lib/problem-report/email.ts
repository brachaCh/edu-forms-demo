import { REPORTER_ACK_SUMMARY_MAX } from "./constants";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateReporterAckSummary(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "";
  if (trimmed.length <= REPORTER_ACK_SUMMARY_MAX) return trimmed;
  return `${trimmed.slice(0, REPORTER_ACK_SUMMARY_MAX - 1)}…`;
}

function rtlMarkSubjectIfHebrew(subject: string): string {
  if (!subject) return subject;
  const hasHebrew = /[\u0590-\u05FF]/.test(subject);
  if (!hasHebrew || /^\u200F/.test(subject)) return subject;
  return `\u200F${subject}`;
}

function wrapProtocolEmailHtml(inner: string): string {
  const font = "'Heebo','Segoe UI',Tahoma,'Arial Hebrew',Arial,sans-serif";
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body dir="rtl" style="margin:0;padding:28px 16px;background:linear-gradient(180deg,#f4f7fd 0%,#e0eafd 100%);font-family:${font};direction:rtl;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;border:1px solid #dbe4f5;box-shadow:0 10px 40px rgba(37,99,235,0.08);overflow:hidden;">
    <tr><td style="height:6px;background:linear-gradient(90deg,#2563eb,#3b82f6,#f59e0b);"></td></tr>
    <tr>
      <td dir="rtl" style="padding:30px 26px 22px;color:#16295c;text-align:right;direction:rtl;line-height:1.7;background:#ffffff;">
        ${inner}
      </td>
    </tr>
    <tr>
      <td dir="rtl" style="padding:0 26px 22px;text-align:center;color:#5a6b96;font-size:12px;background:#fbfcff;">
        פרוטוקל
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export type ProblemReportEmail = {
  subject: string;
  html: string;
  text: string;
};

export function buildReporterAckEmail(args: {
  ticketId?: string | null;
  description: string;
}): ProblemReportEmail {
  const ticketId = args.ticketId?.trim() || null;
  const summary = truncateReporterAckSummary(args.description);
  const subject = rtlMarkSubjectIfHebrew(
    ticketId
      ? `[פרוטוקל] תודה על הדיווח · ${ticketId}`
      : "[פרוטוקל] תודה על הדיווח"
  );
  const ticketBlock = ticketId
    ? `<p style="margin:0 0 18px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;color:#16295c;font-size:18px;font-weight:800;">מספר פנייה: ${escapeHtml(ticketId)}</p>`
    : "";
  const summaryBlock = summary
    ? `<p style="margin:0 0 10px;font-weight:700;color:#16295c;font-size:15px;">סיכום הדיווח</p>
    <div style="margin:0 0 18px;padding:16px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;color:#334155;white-space:pre-wrap;line-height:1.7;">${escapeHtml(summary)}</div>`
    : "";
  const htmlBody = `
    <h1 style="margin:0 0 12px;font-size:24px;color:#16295c;font-weight:800;">תודה!</h1>
    <p style="margin:0 0 18px;font-size:15px;color:#334155;">הפנייה שלך התקבלה ונמצאת בטיפול.</p>
    ${ticketBlock}
    ${summaryBlock}
    <p style="margin:0;font-size:13px;color:#5a6b96;">נעדכן לכתובת המייל שבחשבון כשסטטוס הפנייה ישתנה.</p>
  `;
  const text = [
    "תודה! הפנייה שלך התקבלה ונמצאת בטיפול — פרוטוקל",
    ticketId ? `מספר פנייה: ${ticketId}` : "",
    summary ? "סיכום הדיווח:" : "",
    summary,
    "נעדכן כשסטטוס הפנייה ישתנה.",
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html: wrapProtocolEmailHtml(htmlBody), text };
}

export function buildOwnerAckEmail(args: {
  ticketId: string;
  reporterEmail: string;
  reporterName?: string | null;
  institutionName?: string | null;
  institutionCode?: string | null;
  description: string;
  pagePath: string | null;
  browser: string | null;
}): ProblemReportEmail {
  const ticketId = args.ticketId;
  const subject = rtlMarkSubjectIfHebrew(
    `[פרוטוקל] דיווח על תקלה · ${ticketId}`
  );
  const nameLine = args.reporterName?.trim()
    ? `<p style="margin:0 0 8px;color:#334155;"><strong style="color:#16295c;">שם:</strong> ${escapeHtml(args.reporterName.trim())}</p>`
    : "";
  const institutionLine = (() => {
    const name = args.institutionName?.trim();
    const code = args.institutionCode?.trim();
    if (!name && !code) return "";
    const label = name
      ? code
        ? `${name} (${code})`
        : name
      : code!;
    return `<p style="margin:0 0 8px;color:#334155;"><strong style="color:#16295c;">מוסד:</strong> ${escapeHtml(label)}</p>`;
  })();
  const pathLine = args.pagePath
    ? `<p style="margin:0 0 8px;color:#334155;"><strong style="color:#16295c;">נתיב:</strong> ${escapeHtml(args.pagePath)}</p>`
    : "";
  const browserLine = args.browser
    ? `<p style="margin:0;color:#334155;"><strong style="color:#16295c;">דפדפן:</strong> ${escapeHtml(args.browser)}</p>`
    : "";
  const htmlBody = `
    <h1 style="margin:0 0 8px;font-size:24px;color:#16295c;font-weight:800;">דיווח על תקלה</h1>
    <p style="margin:0 0 18px;font-size:15px;color:#334155;">הדיווח נפתח בצוותא והוא בטיפול.</p>
    <p style="margin:0 0 18px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;color:#16295c;font-size:18px;font-weight:800;">מספר פנייה: ${escapeHtml(ticketId)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 8px;color:#334155;"><strong style="color:#16295c;">מדווח:</strong> ${escapeHtml(args.reporterEmail)}</p>
          ${nameLine}
          ${institutionLine}
          ${pathLine}
          ${browserLine}
        </td>
      </tr>
    </table>
    <p style="margin:0 0 10px;font-weight:700;color:#16295c;font-size:15px;">תיאור</p>
    <div style="margin:0;padding:16px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;color:#334155;white-space:pre-wrap;line-height:1.7;">${escapeHtml(args.description)}</div>
  `;
  const text = [
    "דיווח על תקלה — פרוטוקל",
    `מספר פנייה: ${ticketId}`,
    `מדווח: ${args.reporterEmail}`,
    args.reporterName?.trim() ? `שם: ${args.reporterName.trim()}` : "",
    (() => {
      const name = args.institutionName?.trim();
      const code = args.institutionCode?.trim();
      if (!name && !code) return "";
      return name
        ? `מוסד: ${code ? `${name} (${code})` : name}`
        : `מוסד: ${code}`;
    })(),
    args.pagePath ? `נתיב: ${args.pagePath}` : "",
    args.browser ? `דפדפן: ${args.browser}` : "",
    "",
    "תיאור:",
    args.description,
  ]
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n");
  return { subject, html: wrapProtocolEmailHtml(htmlBody), text };
}

export function buildReporterStatusEmail(args: {
  ticketId: string;
  statusLabel: string;
}): ProblemReportEmail {
  const ticketId = args.ticketId;
  const statusLabel = args.statusLabel;
  const subject = rtlMarkSubjectIfHebrew(
    `[פרוטוקל] עדכון ל-${ticketId} · ${statusLabel}`
  );
  const htmlBody = `
    <h1 style="margin:0 0 8px;font-size:24px;color:#16295c;font-weight:800;">עדכון לפנייה</h1>
    <p style="margin:0 0 18px;font-size:15px;color:#334155;">סטטוס הפנייה עודכן.</p>
    <p style="margin:0 0 10px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;color:#16295c;font-size:18px;font-weight:800;">מספר פנייה: ${escapeHtml(ticketId)}</p>
    <p style="margin:0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;color:#16295c;font-size:16px;font-weight:700;">סטטוס: ${escapeHtml(statusLabel)}</p>
  `;
  const text = [
    "עדכון לפנייה — פרוטוקל",
    `מספר פנייה: ${ticketId}`,
    `סטטוס: ${statusLabel}`,
  ].join("\n");
  return { subject, html: wrapProtocolEmailHtml(htmlBody), text };
}
