import type { BugUrgency } from "./bugReport";
import { bugUrgencyLabel } from "./bugReport";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rtlMarkSubjectIfHebrew(subject: string): string {
  if (!subject) return subject;
  const hasHebrew = /[\u0590-\u05FF]/.test(subject);
  if (!hasHebrew || /^\u200F/.test(subject)) return subject;
  return `\u200F${subject}`;
}

function wrapBugEmailHtml(inner: string): string {
  const font =
    "'Heebo','Segoe UI',Tahoma,'Arial Hebrew',Arial,sans-serif";
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body dir="rtl" style="margin:0;padding:28px 16px;background:linear-gradient(180deg,#f8fafd 0%,#e4eaf3 100%);font-family:${font};direction:rtl;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;border:1px solid #e4eaf3;box-shadow:0 10px 40px rgba(47,59,103,0.08);overflow:hidden;">
    <tr><td style="height:6px;background:linear-gradient(90deg,#2f3b67,#1db7c6,#6b2dbd);"></td></tr>
    <tr>
      <td dir="rtl" style="padding:30px 26px;color:#2f3b67;text-align:right;direction:rtl;line-height:1.7;background:#ffffff;">
        ${inner}
      </td>
    </tr>
    <tr>
      <td dir="rtl" style="padding:0 26px 22px;text-align:center;color:#5a6585;font-size:12px;background:#f8fafd;">
        פרוטוקל · תיבת ההשבחות
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildBugReportEmail(args: {
  message: string;
  urgency: BugUrgency;
  reporterEmail: string;
  pageUrl: string;
  screenshotCount?: number;
}): { subject: string; html: string; text: string } {
  const urgencyLabel = bugUrgencyLabel(args.urgency);
  const safeMessage = escapeHtml(args.message.trim());
  const safeEmail = escapeHtml(args.reporterEmail.trim() || "—");
  const safeUrl = escapeHtml(args.pageUrl.trim() || "—");
  const screenshotCount = Math.max(0, args.screenshotCount ?? 0);
  const screenshotsLine =
    screenshotCount > 0
      ? `<p style="margin:10px 0 0;color:#334155;"><strong style="color:#2f3b67;">צילומי מסך:</strong> ${screenshotCount} מצורפים למייל</p>`
      : "";

  const subject = rtlMarkSubjectIfHebrew(
    `[פרוטוקל · השבחות · ${urgencyLabel}] דיווח מ-${args.reporterEmail || "משתמשת"}`
  );

  const htmlBody = `
    <h1 style="margin:0 0 6px;font-size:24px;color:#2f3b67;font-weight:800;">תיבת ההשבחות</h1>
    <p style="margin:0 0 20px;font-size:13px;color:#5a6585;">דיווח חדש מהאפליקציה</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f8fafd;border:1px solid #e4eaf3;border-radius:14px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#2f3b67;">דחיפות:</strong> <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:#e4eaf3;color:#2f3b67;font-weight:700;font-size:13px;">${escapeHtml(urgencyLabel)}</span></p>
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#2f3b67;">מדווח/ת:</strong> ${safeEmail}</p>
          <p style="margin:0;color:#334155;"><strong style="color:#2f3b67;">עמוד:</strong> <a href="${safeUrl}" style="color:#1db7c6;text-decoration:none;font-weight:600;">${safeUrl}</a></p>
          ${screenshotsLine}
        </td>
      </tr>
    </table>
    <p style="margin:0 0 10px;font-weight:700;color:#2f3b67;font-size:15px;">תיאור</p>
    <div style="margin:0;padding:16px 18px;background:#ffffff;border:1px solid #e4eaf3;border-radius:14px;color:#334155;white-space:pre-wrap;line-height:1.7;">${safeMessage}</div>
  `;

  const text = [
    "תיבת ההשבחות — פרוטוקל",
    `דחיפות: ${urgencyLabel}`,
    `מדווח/ת: ${args.reporterEmail || "—"}`,
    `עמוד: ${args.pageUrl || "—"}`,
    screenshotCount > 0 ? `צילומי מסך: ${screenshotCount}` : "",
    "",
    "תיאור:",
    args.message.trim(),
  ]
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n");

  return { subject, html: wrapBugEmailHtml(htmlBody), text };
}
