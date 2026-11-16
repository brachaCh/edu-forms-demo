import {
  currentCalendarYear,
  formatHebrewYear,
  parseCalendarYear,
} from "@/lib/calendar-year";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractEmailAddress(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  return (angle?.[1] ?? value).trim().toLowerCase();
}

function resolveFrom(): string {
  const forceTest =
    (process.env.RESEND_FORCE_TEST_FROM ?? "").trim().toLowerCase() === "true";
  if (forceTest) return "פרוטוקל <onboarding@resend.dev>";
  const explicit = (process.env.RESEND_FROM_EMAIL ?? "").trim();
  if (explicit) {
    const email = extractEmailAddress(explicit);
    if (email === "onboarding@resend.dev") {
      return "פרוטוקל <onboarding@resend.dev>";
    }
    if (!explicit.includes("<")) return `פרוטוקל <${explicit}>`;
    return explicit
      .replace(/\bMatoah\b/gi, "פרוטוקל")
      .replace(/מתוה/g, "פרוטוקל");
  }
  return "פרוטוקל <noreply@example.com>";
}

function wrapProtocolEmailHtml(inner: string): string {
  const font =
    "'Heebo','Segoe UI',Tahoma,'Arial Hebrew',Arial,sans-serif";
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body dir="rtl" style="margin:0;padding:28px 16px;background:linear-gradient(180deg,#f4f7fd 0%,#e0eafd 100%);font-family:${font};direction:rtl;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;border:1px solid #dbe4f5;box-shadow:0 10px 40px rgba(47,59,103,0.08);overflow:hidden;">
    <tr><td style="height:6px;background:linear-gradient(90deg,#2f3b67,#3d4d7a,#f59e0b);"></td></tr>
    <tr>
      <td dir="rtl" style="padding:30px 26px 22px;color:#16295c;text-align:right;direction:rtl;line-height:1.7;background:#ffffff;">
        ${inner}
      </td>
    </tr>
    <tr>
      <td dir="rtl" style="padding:0 26px 22px;text-align:center;color:#5a6b96;font-size:12px;background:#fbfcff;">
        פרוטוקל — ניהול תיק תלמיד
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function resolveSchoolYearLabel(
  fillData: Record<string, string>,
  studentCalendarYear: number | null | undefined
): string {
  const fromForm = String(fillData.school_year ?? fillData.year ?? "").trim();
  if (fromForm) return fromForm;
  const year =
    parseCalendarYear(studentCalendarYear) ?? currentCalendarYear();
  return formatHebrewYear(year);
}

function buildSigningEmailContent(args: {
  signerName: string;
  formTitle: string;
  studentName: string;
  institutionName: string;
  schoolYearLabel: string;
  fieldLabel: string;
  signingUrl: string;
}): { subject: string; text: string; html: string } {
  const greeting = args.signerName.trim()
    ? `שלום ${args.signerName.trim()},`
    : "שלום,";
  const institution = args.institutionName.trim() || "—";
  const student = args.studentName.trim() || "—";
  const formTitle = args.formTitle.trim() || "טופס";
  const schoolYear = args.schoolYearLabel.trim() || "—";
  const subject = `בקשה לחתימה: ${formTitle}`;
  const steps = [
    "לוחצים על הכפתור «פתיחת המסמך וחתימה».",
    "מזינים את קוד האימות בן 6 הספרות שיישלח אליכם מ-SimpleSign.",
    `במסמך שייפתח, גוללים לשדה החתימה שמיועד לכם (${args.fieldLabel}) — הוא מסומן ומודגש — ולוחצים עליו כדי לחתום.`,
    "בסיום לוחצים על כפתור האישור/הסיום בתחתית המסמך. בלי לחיצה זו החתימה לא נשלחת.",
  ];

  const text = [
    greeting,
    "",
    `מוסד: ${institution}`,
    `תלמיד/ה: ${student}`,
    `טופס: ${formTitle}`,
    `שנת לימודים: ${schoolYear}`,
    "",
    `נדרשת חתימה: ${args.fieldLabel}`,
    "",
    "איך חותמים:",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    args.signingUrl,
    "",
    "פרוטוקל",
  ].join("\n");

  const stepsHtml = steps
    .map(
      (step) =>
        `<li dir="rtl" style="margin:0 0 6px;color:#334155;direction:rtl;text-align:right;">${escapeHtml(step)}</li>`
    )
    .join("");

  const inner = `
    <h1 dir="rtl" style="margin:0 0 16px;font-size:22px;font-weight:800;color:#2f3b67;direction:rtl;text-align:right;">בקשה לחתימה דיגיטלית</h1>
    <p dir="rtl" style="margin:0 0 18px;color:#334155;direction:rtl;text-align:right;">${escapeHtml(greeting)}</p>
    <p dir="rtl" style="margin:0 0 18px;color:#334155;direction:rtl;text-align:right;">נדרשת חתימתכם על טופס בקשר לתלמיד/ה. פרטי הבקשה:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr>
        <td dir="rtl" style="padding:14px 16px;color:#334155;font-size:14px;line-height:1.8;direction:rtl;text-align:right;">
          <p style="margin:0 0 6px;"><strong style="color:#2f3b67;">מוסד:</strong> ${escapeHtml(institution)}</p>
          <p style="margin:0 0 6px;"><strong style="color:#2f3b67;">תלמיד/ה:</strong> ${escapeHtml(student)}</p>
          <p style="margin:0 0 6px;"><strong style="color:#2f3b67;">טופס:</strong> ${escapeHtml(formTitle)}</p>
          <p style="margin:0;"><strong style="color:#2f3b67;">שנת לימודים:</strong> ${escapeHtml(schoolYear)}</p>
        </td>
      </tr>
    </table>
    <p dir="rtl" style="margin:0 0 8px;color:#334155;direction:rtl;text-align:right;">שדה לחתימה: <strong style="color:#2f3b67;">${escapeHtml(args.fieldLabel)}</strong></p>
    <p dir="rtl" style="margin:0 0 6px;color:#2f3b67;font-weight:700;direction:rtl;text-align:right;">איך חותמים:</p>
    <ol dir="rtl" style="margin:0 0 20px;padding:0 22px 0 0;direction:rtl;text-align:right;font-size:14px;line-height:1.7;">${stepsHtml}</ol>
    <p dir="rtl" style="margin:0 0 22px;text-align:center;direction:rtl;">
      <a href="${escapeHtml(args.signingUrl)}" style="display:inline-block;padding:14px 28px;background:#2f3b67;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;">פתיחת המסמך וחתימה</a>
    </p>
    <p dir="rtl" style="margin:0;color:#64748b;font-size:13px;direction:rtl;text-align:right;">הקישור אישי ומיועד לחתימה שלכם בלבד. אם לא ביקשתם לחתום על טופס — אפשר להתעלם מהודעה זו.</p>
  `;

  return {
    subject,
    text,
    html: wrapProtocolEmailHtml(inner),
  };
}

export function buildSignedNotificationEmailContent(args: {
  recipientName: string;
  formTitle: string;
  studentName: string;
  institutionName: string;
  signerNames: string[];
  formUrl: string;
}): { subject: string; text: string; html: string } {
  const greeting = args.recipientName.trim()
    ? `שלום ${args.recipientName.trim()},`
    : "שלום,";
  const institution = args.institutionName.trim() || "—";
  const student = args.studentName.trim() || "—";
  const formTitle = args.formTitle.trim() || "טופס";
  const signers = args.signerNames
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
  const subject = `המסמך נחתם: ${formTitle}`;

  const text = [
    greeting,
    "",
    `המסמך "${formTitle}" עבור ${student} נחתם ב-SimpleSign.`,
    `מוסד: ${institution}`,
    ...(signers ? [`חותמים: ${signers}`] : []),
    "",
    args.formUrl,
    "",
    "פרוטוקל",
  ].join("\n");

  const signersHtml = signers
    ? `<p style="margin:0;"><strong style="color:#2f3b67;">חותמים:</strong> ${escapeHtml(signers)}</p>`
    : "";

  const inner = `
    <h1 dir="rtl" style="margin:0 0 16px;font-size:22px;font-weight:800;color:#2f3b67;direction:rtl;text-align:right;">המסמך נחתם</h1>
    <p dir="rtl" style="margin:0 0 18px;color:#334155;direction:rtl;text-align:right;">${escapeHtml(greeting)}</p>
    <p dir="rtl" style="margin:0 0 18px;color:#334155;direction:rtl;text-align:right;">המסמך שנשלח לחתימה ב-SimpleSign הושלם. פרטי המסמך:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr>
        <td dir="rtl" style="padding:14px 16px;color:#334155;font-size:14px;line-height:1.8;direction:rtl;text-align:right;">
          <p style="margin:0 0 6px;"><strong style="color:#2f3b67;">מוסד:</strong> ${escapeHtml(institution)}</p>
          <p style="margin:0 0 6px;"><strong style="color:#2f3b67;">תלמיד/ה:</strong> ${escapeHtml(student)}</p>
          <p style="margin:0 0 6px;"><strong style="color:#2f3b67;">טופס:</strong> ${escapeHtml(formTitle)}</p>
          ${signersHtml}
        </td>
      </tr>
    </table>
    <p dir="rtl" style="margin:0 0 22px;text-align:center;direction:rtl;">
      <a href="${escapeHtml(args.formUrl)}" style="display:inline-block;padding:14px 28px;background:#2f3b67;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;">לצפייה בטופס</a>
    </p>
  `;

  return {
    subject,
    text,
    html: wrapProtocolEmailHtml(inner),
  };
}

export type ResendResult =
  | { sent: true }
  | { sent: false; status: number; detail: string };

function isInvalidEmailError(status: number, detail: string): boolean {
  if (status !== 422 && status !== 400) return false;
  const lower = detail.toLowerCase();
  if (lower.includes("`from`") || lower.includes(" from ")) return false;
  return lower.includes("`to`") || lower.includes("recipient");
}

function isRateLimitError(status: number): boolean {
  return status === 429;
}

function isMissingApiKeyError(status: number, detail: string): boolean {
  const lower = detail.toLowerCase();
  return status === 401 || lower.includes("api_key") || lower.includes("unauthorized");
}

export function mapResendErrorToHebrew(result: ResendResult): string {
  if (result.sent) return "";
  const { status, detail } = result;
  if (isMissingApiKeyError(status, detail)) {
    return "שגיאה בהגדרות השרת — פנו לתמיכה";
  }
  if (isInvalidEmailError(status, detail)) {
    return "כתובת המייל לא תקינה — יש לעדכן אותה בכרטיס התלמידה";
  }
  if (isRateLimitError(status)) {
    return "נסו שוב בעוד דקה";
  }
  return "השליחה נכשלה — נסו שוב או פנו לתמיכה";
}

async function sendProtocolEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  logLabel: string;
}): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error(`[${args.logLabel}] missing RESEND_API_KEY`);
    return { sent: false, status: 503, detail: "missing_api_key" };
  }

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[${args.logLabel}] resend failed:`, response.status, detail);
    return { sent: false, status: response.status, detail: detail || `status_${response.status}` };
  }
  return { sent: true };
}

/** SimpleSign API לא שולח מייל הזמנה — שולחים קישור חתימה מהמערכת */
export async function sendSimpleSignSigningEmail(args: {
  to: string;
  signerName: string;
  formTitle: string;
  studentName: string;
  institutionName: string;
  schoolYearLabel: string;
  fieldLabel: string;
  signingUrl: string;
}): Promise<ResendResult> {
  const { subject, text, html } = buildSigningEmailContent(args);
  return sendProtocolEmail({
    to: args.to,
    subject,
    html,
    text,
    logLabel: "simplesign/signing-email",
  });
}

/** התרעה למשתמש ששלח את המסמך לחתימה — אחרי webhook/סנכרון */
export async function sendSimpleSignSignedNotificationEmail(args: {
  to: string;
  recipientName: string;
  formTitle: string;
  studentName: string;
  institutionName: string;
  signerNames: string[];
  formUrl: string;
  submissionToken: string;
  /** מפתח idempotency נפרד למורה האחראית */
  recipientRole?: "requester" | "teacher";
}): Promise<ResendResult> {
  const { subject, text, html } = buildSignedNotificationEmailContent(args);
  const role = args.recipientRole ?? "requester";
  const idempotencyKey =
    role === "teacher"
      ? `simplesign-signed/teacher/${args.submissionToken}`
      : `simplesign-signed/${args.submissionToken}`;
  return sendProtocolEmail({
    to: args.to,
    subject,
    html,
    text,
    idempotencyKey,
    logLabel: "simplesign/signed-notify",
  });
}
