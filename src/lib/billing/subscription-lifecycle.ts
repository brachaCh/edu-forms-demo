import type { SubscriptionStatus } from "@/lib/supabase/types";
import {
  computeSchoolYearExpiry,
  formatSchoolYearExpiryDate,
  jerusalemWallTimeToUtc,
  jerusalemYmd,
  SCHOOL_YEAR_LAST_ACTIVE_MONTH,
} from "@/lib/billing/school-year-expiry";

/**
 * ימים לפני תפוגה לשליחת תזכורת חידוש.
 * TZ-68 SQL backfill (`064_tz68_backfill_school_year_expiry.sql`) uses the
 * same 30-day window: if the new expiry is within it, the migration stamps
 * `renewal_reminder_for_expires_at` so cron/edge reminders do not fire en masse.
 */
export const RENEWAL_REMINDER_DAYS = 30;

export function isPlanExpired(
  planExpiresAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!planExpiresAt) return false;
  const expires = new Date(planExpiresAt);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() <= now.getTime();
}

export function effectiveSubscriptionStatus(
  status: SubscriptionStatus | null | undefined,
  planExpiresAt: string | null | undefined,
  now = new Date()
): SubscriptionStatus {
  if (status === "active" && isPlanExpired(planExpiresAt, now)) {
    return "expired";
  }
  return status ?? "none";
}

export function daysUntilExpiry(
  planExpiresAt: string | null | undefined,
  now = new Date()
): number | null {
  if (!planExpiresAt) return null;
  const expires = new Date(planExpiresAt);
  if (Number.isNaN(expires.getTime())) return null;
  const diffMs = expires.getTime() - now.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function shouldSendRenewalReminder(
  subscriptionStatus: SubscriptionStatus | null | undefined,
  planExpiresAt: string | null | undefined,
  renewalReminderForExpiresAt: string | null | undefined,
  now = new Date()
): boolean {
  if (subscriptionStatus !== "active" || !planExpiresAt) return false;

  const days = daysUntilExpiry(planExpiresAt, now);
  if (days === null || days < 0) return false;
  if (days > RENEWAL_REMINDER_DAYS) return false;

  if (!renewalReminderForExpiresAt) return true;

  const remindedFor = new Date(renewalReminderForExpiresAt);
  const expires = new Date(planExpiresAt);
  if (Number.isNaN(remindedFor.getTime()) || Number.isNaN(expires.getTime())) {
    return true;
  }

  return remindedFor.getTime() !== expires.getTime();
}

/**
 * Bump the school-year expiry to the next school year (1 October of the
 * following year). Used when an early renewal before 1 August would otherwise
 * not extend the subscription.
 */
export function bumpSchoolYearExpiry(expiry: Date): Date {
  const ymd = jerusalemYmd(expiry);
  return jerusalemWallTimeToUtc(ymd.year + 1, SCHOOL_YEAR_LAST_ACTIVE_MONTH, 2);
}

/**
 * תוקף לרכישה/חידוש: כלל שנת הלימודים לפי מועד הרכישה.
 *
 * TZ-68 early-renewal rule (Rivki's decision):
 * When renewing an active plan whose existing expiry is still in the future,
 * if the computed school-year date is NOT later than the existing expiry,
 * bump the computed date to the next school year (1 October of the following
 * year). This ensures every completed payment grants one more school season.
 *
 * The final result is never earlier than the existing expiry — a longer manual
 * date (or a special deal) is never shortened. This is an explicit assumption.
 */
export function computeNextExpiry(
  currentExpiresAt: string | null | undefined,
  now = new Date()
): Date {
  const fromPurchase = computeSchoolYearExpiry(now);

  if (!currentExpiresAt || isPlanExpired(currentExpiresAt, now)) {
    return fromPurchase;
  }

  const current = new Date(currentExpiresAt);
  if (Number.isNaN(current.getTime())) {
    return fromPurchase;
  }

  if (fromPurchase.getTime() > current.getTime()) {
    return fromPurchase;
  }

  const bumped = bumpSchoolYearExpiry(fromPurchase);
  return bumped.getTime() > current.getTime() ? bumped : current;
}

/** הארכת תוקף ידנית במספר ימים — מתאריך התפוגה הנוכחי אם עתידי, אחרת מהיום */
export function computeExtendedExpiry(
  currentExpiresAt: string | null | undefined,
  days: number,
  now = new Date()
): Date {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30;
  const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base =
    current && !Number.isNaN(current.getTime()) && current > now
      ? current
      : new Date(now);
  return new Date(base.getTime() + safeDays * 24 * 60 * 60 * 1000);
}

export interface RenewalReminderCopy {
  subject: string;
  text: string;
  html: string;
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

function buildRenewalReminderHtmlBody(args: {
  fullName: string;
  institutionName: string;
  planPriceFormatted: string | null;
  expiresDate: string;
  headline: string;
  intro: string;
  detail: string;
  action: string;
}): string {
  const greeting = args.fullName.trim() || "שלום";
  const amountRow = args.planPriceFormatted
    ? `<p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">סכום:</strong> <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-weight:700;font-size:13px;">${escapeHtml(args.planPriceFormatted)}</span></p>`
    : "";
  return `
    <h1 style="margin:0 0 6px;font-size:28px;color:#16295c;font-weight:800;line-height:1.2;">פרוטוקל</h1>
    <p style="margin:0 0 22px;font-size:14px;color:#5a6b96;">${escapeHtml(args.headline)}</p>
    <p style="margin:0 0 18px;font-size:16px;color:#334155;">שלום ${escapeHtml(greeting)},</p>
    <p style="margin:0 0 18px;font-size:15px;color:#334155;line-height:1.8;">${escapeHtml(args.intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f4f7fd;border:1px solid #dbe4f5;border-radius:14px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 10px;color:#334155;"><strong style="color:#16295c;">מוסד:</strong> ${escapeHtml(args.institutionName)}</p>
          ${amountRow}
          <p style="margin:0;color:#334155;"><strong style="color:#16295c;">תאריך:</strong> <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:#e0eafd;color:#1e40af;font-weight:700;font-size:13px;">${escapeHtml(args.expiresDate)}</span></p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.8;">${escapeHtml(args.detail)}</p>
    <p style="margin:0;font-size:14px;color:#5a6b96;line-height:1.8;">${escapeHtml(args.action)}</p>
  `;
}

function renewalAmountPhrase(planPriceFormatted: string | null): string {
  return planPriceFormatted ? ` סכום החידוש: ${planPriceFormatted}.` : "";
}

export function buildRenewalReminderEmail(args: {
  fullName: string;
  institutionName: string;
  planPriceFormatted: string | null;
  expiresAt: string;
  paymentMethod: "credit_card" | "bank_transfer" | null;
}): RenewalReminderCopy {
  const expiresDate = formatSchoolYearExpiryDate(args.expiresAt, {
    month: "long",
  });
  const greeting = args.fullName.trim() || "שלום";
  const amountPhrase = renewalAmountPhrase(args.planPriceFormatted);

  if (args.paymentMethod === "credit_card") {
    const subject = rtlMarkSubjectIfHebrew(
      "[פרוטוקל] תזכורת: המנוי שלכם יתחדש בקרוב"
    );
    const intro = `המנוי של ${args.institutionName} לפרוטוקל יתחדש אוטומטית.${amountPhrase}`;
    const detail =
      "החיוב יבוצע באמצעות האשראי ששימש לרכישה המקורית.";
    const action =
      "אם ברצונכם לשנות חבילה או לבטל — צרו איתנו קשר לפני תאריך החידוש.";
    const text = [
      "פרוטוקל",
      "",
      `שלום ${greeting},`,
      "",
      `${intro} התאריך: ${expiresDate}.`,
      detail,
      "",
      action,
      "",
      "בברכה,",
      "פרוטוקל",
    ].join("\n");

    return {
      subject,
      text,
      html: wrapProtocolEmailHtml(
        buildRenewalReminderHtmlBody({
          fullName: args.fullName,
          institutionName: args.institutionName,
          planPriceFormatted: args.planPriceFormatted,
          expiresDate,
          headline: "תזכורת חידוש מנוי",
          intro,
          detail,
          action,
        })
      ),
    };
  }

  const subject = rtlMarkSubjectIfHebrew(
    "[פרוטוקל] תזכורת: חידוש מנוי"
  );
  const intro = `המנוי של ${args.institutionName} לפרוטוקל יפוג בקרוב.${amountPhrase}`;
  const detail =
    "כדי להמשיך להשתמש במערכת, נא לבצע תשלום בהעברה בנקאית ולשלוח אישור.";
  const action =
    "ליצירת קשר ופרטי העברה — השיבו למייל זה או השתמשו בטופס «צרו קשר» באתר.";
  const text = [
    "פרוטוקל",
    "",
    `שלום ${greeting},`,
    "",
    `${intro} תאריך התפוגה: ${expiresDate}.`,
    detail,
    "",
    action,
    "",
    "בברכה,",
    "פרוטוקל",
  ].join("\n");

  return {
    subject,
    text,
    html: wrapProtocolEmailHtml(
      buildRenewalReminderHtmlBody({
        fullName: args.fullName,
        institutionName: args.institutionName,
        planPriceFormatted: args.planPriceFormatted,
        expiresDate,
        headline: "תזכורת חידוש מנוי",
        intro,
        detail,
        action,
      })
    ),
  };
}
