import { resolveResendFrom } from "@/lib/resend-from";

export async function sendFormViewLinkEmail(args: {
  to: string;
  formTitle: string;
  studentName: string;
  link: string;
  expiryDays: number;
}): Promise<{ sent: boolean; detail?: string }> {
  const from = resolveResendFrom();
  const subject = `${args.formTitle} — ${args.studentName} (לצפייה)`;

  const text = `שלום,

נשלח/ה אליכם לצפייה:
${args.formTitle}
תלמיד/ה: ${args.studentName}

לצפייה בטופס:
${args.link}

הקישור בתוקף ל-${args.expiryDays} ימים.

זהו מסמך לצפייה בלבד.

בברכה,
פרוטוקל`;

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#111;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:14px;padding:24px;border:1px solid #d7deea;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#2f3b67;">נשלח לצפייה: ${escapeHtml(args.formTitle)}</h1>
    <p style="margin:0 0 16px;line-height:1.7;color:#334155;">
      <strong>תלמיד/ה:</strong> ${escapeHtml(args.studentName)}
    </p>
    <p style="margin:0 0 20px;">
      <a href="${escapeHtml(args.link)}" style="display:inline-block;padding:12px 24px;background:#2f3b67;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">
        צפייה בטופס
      </a>
    </p>
    <p style="margin:0 0 8px;color:#64748b;font-size:14px;">
      הקישור בתוקף ל-${args.expiryDays} ימים.
    </p>
    <p style="margin:0;color:#64748b;font-size:14px;">
      זהו מסמך לצפייה בלבד.
    </p>
  </div>
</body>
</html>`;

  try {
    const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[form-view-email] resend failed:", response.status, detail);
      return { sent: false, detail };
    }

    return { sent: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    console.error("[form-view-email]", err);
    return { sent: false, detail };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
