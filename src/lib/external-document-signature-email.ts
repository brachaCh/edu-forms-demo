const RESEND_TEST_FROM = "פרוטוקל <onboarding@resend.dev>";
const PROJECT_FROM = "פרוטוקל <noreply@example.com>";

function extractEmailAddress(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  return (angle?.[1] ?? value).trim().toLowerCase();
}

function resolveFrom(): string {
  const forceTest =
    (process.env.RESEND_FORCE_TEST_FROM ?? "").trim().toLowerCase() === "true";
  if (forceTest) return RESEND_TEST_FROM;

  const explicit = (process.env.RESEND_FROM_EMAIL ?? "").trim();
  if (explicit) {
    const email = extractEmailAddress(explicit);
    if (email === "onboarding@resend.dev") return RESEND_TEST_FROM;
    if (!explicit.includes("<")) return `פרוטוקל <${explicit}>`;
    return explicit
      .replace(/\bMatoah\b/gi, "פרוטוקל")
      .replace(/מתוה/g, "פרוטוקל");
  }
  return PROJECT_FROM;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildExternalDocumentSignatureLinkEmailBodies(args: {
  documentName: string;
  studentName: string;
  signerLabel: string;
  link: string;
  expiryDays: number;
}): { subject: string; text: string; html: string } {
  const subject = `בקשה לחתימה על מסמך: ${args.documentName}`;
  const steps = [
    "לוחצים על הכפתור «פתיחת המסמך וחתימה».",
    "מזינים את קוד האימות בן 6 הספרות שיישלח לכתובת המייל הזו.",
    "קוראים את המסמך וגוללים לתיבת החתימה הירוקה.",
    "חותמים בתוכה באצבע או בעכבר.",
    "לוחצים על «אישור ושליחת החתימה».",
  ];

  const text = [
    `בקשה לחתימה על מסמך: ${args.documentName}`,
    args.studentName ? `עבור: ${args.studentName}` : "",
    "",
    `התבקשתם לחתום בתור: ${args.signerLabel}`,
    "",
    "איך חותמים:",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    args.link,
    "",
    `הקישור אישי, חד־פעמי ותקף למשך ${args.expiryDays} ימים.`,
    "",
    "פרוטוקל",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  const stepsHtml = steps
    .map(
      (step) =>
        `<li style="margin:0 0 6px;">${escapeHtml(step)}</li>`
    )
    .join("");

  const html = `<div dir="rtl" style="direction:rtl;text-align:right;font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1e293b;line-height:1.7">
    <h2 style="margin:0 0 8px;color:#2f3b67">בקשה לחתימה על מסמך</h2>
    <p style="margin:0 0 14px"><strong>${escapeHtml(args.documentName)}</strong></p>
    ${args.studentName ? `<p style="margin:0 0 14px"><strong>עבור:</strong> ${escapeHtml(args.studentName)}</p>` : ""}
    <p style="margin:0 0 14px">התבקשתם לחתום בתור: <strong>${escapeHtml(args.signerLabel)}</strong></p>
    <p style="margin:0 0 6px;font-weight:700">איך חותמים:</p>
    <ol style="margin:0 0 18px;padding-right:22px">${stepsHtml}</ol>
    <p style="margin:0 0 18px;text-align:center">
      <a href="${escapeHtml(args.link)}" style="display:inline-block;padding:14px 26px;background:#2f7d6d;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px">פתיחת המסמך וחתימה</a>
    </p>
    <p style="margin:0;color:#64748b;font-size:13px">הקישור אישי, חד־פעמי ותקף למשך ${args.expiryDays} ימים. אם לא ביקשתם לחתום על מסמך — אפשר להתעלם מהודעה זו.</p>
    <p style="margin:18px 0 0">פרוטוקל</p>
  </div>`;

  return { subject, text, html };
}

export async function sendExternalDocumentSignatureLinkEmail(args: {
  to: string;
  documentName: string;
  studentName: string;
  signerLabel: string;
  link: string;
  expiryDays: number;
}): Promise<{ sent: boolean; detail?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, detail: "חסר RESEND_API_KEY" };

  const { subject, text, html } = buildExternalDocumentSignatureLinkEmailBodies(args);
  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    console.error("[external-document-signature-email] resend failed:", response.status);
    return { sent: false };
  }
  return { sent: true };
}
