/**
 * TZ-67: מייל לבעלת הפלטפורמה אחרי רכישה שהושלמה.
 * כשלים נבלעים — אסור לשבור או לעכב את זרימת התשלום.
 */

import { after } from "next/server";
import { appOrigin } from "@/lib/app-origin";
import { CUSTOM_PLAN_TITLE, isCustomPlanId } from "@/lib/billing/custom-plan";
import { getPlanById } from "@/lib/purchase-plans";
import { resolveResendFrom } from "@/lib/resend-from";
import { createServiceClient } from "@/lib/supabase/admin";
import type { PaymentMethod } from "@/lib/supabase/types";

export const PURCHASE_NOTIFICATION_EMAILS_ENV = "PURCHASE_NOTIFICATION_EMAILS";
export const PLATFORM_ADMIN_SUBSCRIPTIONS_PATH = "/platform-admin/subscriptions";

const sentIdempotencyKeys = new Set<string>();

export type PurchaseNotificationInput = {
  institutionId: string;
  planId: string;
  paymentMethod: PaymentMethod;
  /** סכום ששולם בפועל. null — אין סכום רשום; לא לגזור ממחירון / מחיר מיוחד. */
  amountAgorot: number | null;
  listPriceAgorot: number | null;
  couponApplied: boolean;
  idempotencyKey: string;
  paidAt: Date;
};

export type PurchaseBuyer = {
  fullName: string;
  email: string;
};

export type PurchaseContext = {
  institutionName: string;
  buyer: PurchaseBuyer | null;
  specialPriceAgorot: number | null;
};

export type PurchaseNotificationDeps = {
  sendEmail?: typeof sendPurchaseNotificationEmail;
  loadContext?: (institutionId: string) => Promise<PurchaseContext>;
  now?: Date;
};

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

/** נמעני התראת רכישה: PURCHASE_NOTIFICATION_EMAILS, אחרת PLATFORM_ADMIN_EMAILS. */
export function parsePurchaseNotificationEmails(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const dedicated = parseEmailList(env[PURCHASE_NOTIFICATION_EMAILS_ENV]);
  if (dedicated.length > 0) return dedicated;
  return parseEmailList(env.PLATFORM_ADMIN_EMAILS);
}

export function resetPurchaseNotificationIdempotencyForTests(): void {
  sentIdempotencyKeys.clear();
}

/**
 * Stable Resend key for a bank-transfer activation.
 * Uses the new paid period (`plan_expires_at` after the update) so retries
 * and double submits share one key, and a later reactivation gets another.
 */
export function bankPurchaseIdempotencyKey(
  institutionId: string,
  newPlanExpiresAt: string
): string {
  return `bank:${institutionId}:${newPlanExpiresAt}`;
}

function escapeHtml(value: string): string {
  return value
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

export function paymentMethodLabel(method: PaymentMethod): string {
  return method === "bank_transfer" ? "העברה בנקאית" : "כרטיס אשראי";
}

export function planTitleForNotification(planId: string): string {
  if (isCustomPlanId(planId)) return CUSTOM_PLAN_TITLE;
  return getPlanById(planId)?.title ?? planId;
}

export function formatJerusalemDateTime(date: Date): string {
  return date.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** סכום ששולם במייל: סכום רשום בלבד. אגורות שאינן שקל שלם מוצגות עם ספרות אחרי הנקודה. */
export function formatPaidAmount(amountAgorot: number | null): string {
  if (amountAgorot == null || !Number.isFinite(amountAgorot)) return "לא צוין";
  const agorot = Math.round(amountAgorot);
  const hasAgoraFraction = agorot % 100 !== 0;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: hasAgoraFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(agorot / 100);
}

/** סכום ששולם בפועל בלבד — בלי מחירון, מחיר מיוחד או קטלוג. */
export function resolvePaidAmountAgorot(
  input: Pick<PurchaseNotificationInput, "amountAgorot">
): number | null {
  if (typeof input.amountAgorot === "number" && Number.isFinite(input.amountAgorot)) {
    return Math.round(input.amountAgorot);
  }
  return null;
}

export function buildPurchaseNotificationEmail(args: {
  institutionName: string;
  buyerName: string;
  buyerEmail: string;
  planTitle: string;
  amountPaidLabel: string;
  listPriceLabel: string | null;
  couponApplied: boolean;
  paymentMethodLabel: string;
  paidAtLabel: string;
  adminUrl: string;
}): { subject: string; text: string; html: string } {
  const institution = args.institutionName.trim() || "מוסד";
  const buyerName = args.buyerName.trim() || "לא צוין";
  const buyerEmail = args.buyerEmail.trim() || "לא צוין";
  const couponLine = args.couponApplied
    ? args.listPriceLabel
      ? `הוחל קופון (מחיר מחירון: ${args.listPriceLabel})`
      : "הוחל קופון"
    : null;

  const subject = rtlMarkSubjectIfHebrew(
    `[פרוטוקל] רכישה חדשה: ${institution}`
  );

  const text = [
    "פרוטוקל — רכישה חדשה במערכת",
    "",
    `מוסד: ${institution}`,
    `רוכש/ת: ${buyerName}`,
    `אימייל רוכש/ת: ${buyerEmail}`,
    `חבילה: ${args.planTitle}`,
    `סכום ששולם: ${args.amountPaidLabel}`,
    couponLine,
    `אמצעי תשלום: ${args.paymentMethodLabel}`,
    `תאריך ושעה: ${args.paidAtLabel}`,
    "",
    `ניהול מנויים: ${args.adminUrl}`,
  ]
    .filter((line): line is string => line != null && line !== "")
    .join("\n");

  const couponHtml = couponLine
    ? `<p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">קופון:</strong> ${escapeHtml(couponLine)}</p>`
    : "";

  const html = wrapProtocolEmailHtml(`
    <h1 style="margin:0 0 6px;font-size:28px;color:#16295c;font-weight:800;line-height:1.2;">פרוטוקל</h1>
    <p style="margin:0 0 22px;font-size:14px;color:#5a6b96;">רכישה חדשה במערכת</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f4f7fd;border:1px solid #dbe4f5;border-radius:14px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">מוסד:</strong> ${escapeHtml(institution)}</p>
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">רוכש/ת:</strong> ${escapeHtml(buyerName)}</p>
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">אימייל:</strong> ${escapeHtml(buyerEmail)}</p>
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">חבילה:</strong> ${escapeHtml(args.planTitle)}</p>
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">סכום ששולם:</strong> <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-weight:700;font-size:13px;">${escapeHtml(args.amountPaidLabel)}</span></p>
          ${couponHtml}
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">אמצעי תשלום:</strong> ${escapeHtml(args.paymentMethodLabel)}</p>
          <p style="margin:0;color:#334155;"><strong style="color:#16295c;">תאריך ושעה:</strong> <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:#e0eafd;color:#1e40af;font-weight:700;font-size:13px;">${escapeHtml(args.paidAtLabel)}</span></p>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:15px;color:#334155;line-height:1.8;">
      <a href="${escapeHtml(args.adminUrl)}" style="color:#1d4ed8;font-weight:700;">לניהול מנויים באזור הניהול</a>
    </p>
  `);

  return { subject, text, html };
}

async function loadBuyer(
  supabase: ReturnType<typeof createServiceClient>,
  institutionId: string
): Promise<PurchaseBuyer | null> {
  const { data: owners } = await supabase
    .from("user_institutions")
    .select("user_id")
    .eq("institution_id", institutionId)
    .eq("role", "owner")
    .limit(5);

  const ownerIds = (owners ?? [])
    .map((row) => row.user_id as string)
    .filter(Boolean);

  if (ownerIds.length > 0) {
    const { data: ownerProfiles } = await supabase
      .from("user_profiles")
      .select("full_name, email")
      .in("id", ownerIds);
    const withEmail = (ownerProfiles ?? []).find(
      (row) => typeof row.email === "string" && row.email.trim()
    );
    if (withEmail) {
      return {
        fullName: (withEmail.full_name as string) ?? "",
        email: (withEmail.email as string).trim(),
      };
    }
  }

  const { data: flaggedOwner } = await supabase
    .from("user_profiles")
    .select("full_name, email")
    .eq("institution_id", institutionId)
    .eq("is_institution_owner", true)
    .limit(1)
    .maybeSingle();

  if (flaggedOwner?.email) {
    return {
      fullName: (flaggedOwner.full_name as string) ?? "",
      email: (flaggedOwner.email as string).trim(),
    };
  }

  const { data: earliest } = await supabase
    .from("user_profiles")
    .select("full_name, email")
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (earliest?.email) {
    return {
      fullName: (earliest.full_name as string) ?? "",
      email: (earliest.email as string).trim(),
    };
  }

  return null;
}

export async function loadPurchaseContext(
  institutionId: string
): Promise<PurchaseContext> {
  try {
    const supabase = createServiceClient();
    const { data: institution } = await supabase
      .from("institutions")
      .select("id, name, school_name, special_price_agorot")
      .eq("id", institutionId)
      .maybeSingle();

    const institutionName =
      (institution?.name as string | undefined)?.trim() ||
      (institution?.school_name as string | undefined)?.trim() ||
      "מוסד";

    const buyer = await loadBuyer(supabase, institutionId);
    return {
      institutionName,
      buyer,
      specialPriceAgorot:
        typeof institution?.special_price_agorot === "number"
          ? institution.special_price_agorot
          : null,
    };
  } catch (error) {
    console.error("[billing] purchase notification load context:", error);
    return { institutionName: "מוסד", buyer: null, specialPriceAgorot: null };
  }
}

export async function sendPurchaseNotificationEmail(args: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}): Promise<{ sent: boolean; detail?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[billing] purchase notification skipped: missing RESEND_API_KEY");
    return { sent: false, detail: "חסר RESEND_API_KEY" };
  }
  if (args.to.length === 0) {
    return { sent: false, detail: "אין נמענים" };
  }

  try {
    const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "[billing] purchase notification resend failed:",
        response.status,
        detail
      );
      return { sent: false, detail: detail || `Resend ${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("[billing] purchase notification resend error:", error);
    return { sent: false, detail: "RESEND_ERROR" };
  }
}

export async function notifyOwnerOfPurchase(
  input: PurchaseNotificationInput,
  deps: PurchaseNotificationDeps = {}
): Promise<void> {
  try {
    if (sentIdempotencyKeys.has(input.idempotencyKey)) {
      return;
    }

    const recipients = parsePurchaseNotificationEmails();
    if (recipients.length === 0) {
      console.warn(
        "[billing] purchase notification skipped: no PURCHASE_NOTIFICATION_EMAILS or PLATFORM_ADMIN_EMAILS"
      );
      return;
    }

    const loadContext = deps.loadContext ?? loadPurchaseContext;
    const context = await loadContext(input.institutionId);
    const amountAgorot = resolvePaidAmountAgorot({
      amountAgorot: input.amountAgorot,
    });
    const listPrice =
      typeof input.listPriceAgorot === "number" &&
      Number.isFinite(input.listPriceAgorot)
        ? input.listPriceAgorot
        : null;
    const couponApplied =
      input.couponApplied ||
      (listPrice != null &&
        amountAgorot != null &&
        amountAgorot < listPrice);

    const copy = buildPurchaseNotificationEmail({
      institutionName: context.institutionName,
      buyerName: context.buyer?.fullName ?? "",
      buyerEmail: context.buyer?.email ?? "",
      planTitle: planTitleForNotification(input.planId),
      amountPaidLabel: formatPaidAmount(amountAgorot),
      listPriceLabel: listPrice != null ? formatPaidAmount(listPrice) : null,
      couponApplied,
      paymentMethodLabel: paymentMethodLabel(input.paymentMethod),
      paidAtLabel: formatJerusalemDateTime(input.paidAt),
      adminUrl: `${appOrigin()}${PLATFORM_ADMIN_SUBSCRIPTIONS_PATH}`,
    });

    const send = deps.sendEmail ?? sendPurchaseNotificationEmail;
    const result = await send({
      to: recipients,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
      idempotencyKey: input.idempotencyKey,
    });

    if (result.sent) {
      sentIdempotencyKeys.add(input.idempotencyKey);
    }
  } catch (error) {
    console.error("[billing] purchase notification failed:", error);
  }
}

/** אחרי שהרכישה נרשמה — לא חוסם את תשובת ה-API. */
export function schedulePurchaseOwnerNotification(
  input: PurchaseNotificationInput
): void {
  try {
    after(() => notifyOwnerOfPurchase(input));
  } catch (error) {
    console.error("[billing] purchase notification schedule fallback:", error);
    void notifyOwnerOfPurchase(input);
  }
}
