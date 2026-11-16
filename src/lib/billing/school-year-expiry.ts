/**
 * TZ-68 — תוקף מנוי לפי שנת לימודים, לא שנה קלנדרית מרגע הרכישה.
 *
 * כלל (קל לתיקון אם הלקוחה תדייק):
 * - רכישה ב-1 באוגוסט של שנה Y או אחריו → תפוגה ב-1 באוקטובר של שנה Y+1.
 * - רכישה לפני 1 באוגוסט של שנה Y → תפוגה ב-1 באוקטובר של שנה Y.
 * גבולות התאריך לפי שעון ישראל (`Asia/Jerusalem`).
 *
 * משמעות «עד 1 באוקטובר»: המנוי פעיל לאורך כל ה-1 באוקטובר בישראל,
 * ופוקע ברגע הראשון של ה-2 באוקטובר. הערך שנשמר ב-`plan_expires_at`
 * הוא חסם בלעדי (exclusive) — `00:00:00` ב-2 באוקטובר, שעון ישראל.
 * תצוגה למשתמש משתמשת ביום האחרון שעדיין פעיל (1 באוקטובר).
 *
 * SQL mirror (must stay identical): `tz68_compute_school_year_expiry`
 * in `supabase/migrations/064_tz68_backfill_school_year_expiry.sql`,
 * and the same CASE in `scripts/tz68-backfill-dry-run.sql`.
 */

export const SCHOOL_YEAR_TIME_ZONE = "Asia/Jerusalem";

/** תחילת עונת הרכישה: 1 באוגוסט (כולל), שעון ישראל. */
export const PURCHASE_SEASON_START_MONTH = 8;
export const PURCHASE_SEASON_START_DAY = 1;

/** היום האחרון שבו המנוי עדיין פעיל, שעון ישראל. */
export const SCHOOL_YEAR_LAST_ACTIVE_MONTH = 10;
export const SCHOOL_YEAR_LAST_ACTIVE_DAY = 1;

export interface JerusalemYmd {
  year: number;
  month: number;
  day: number;
}

function partNumber(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): number {
  return Number(parts.find((part) => part.type === type)?.value);
}

/** תאריך לוח (שנה/חודש/יום) בשעון ישראל עבור הרגע הנתון. */
export function jerusalemYmd(date: Date): JerusalemYmd {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHOOL_YEAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: partNumber(parts, "year"),
    month: partNumber(parts, "month"),
    day: partNumber(parts, "day"),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const asUtc = Date.UTC(
    partNumber(parts, "year"),
    partNumber(parts, "month") - 1,
    partNumber(parts, "day"),
    partNumber(parts, "hour"),
    partNumber(parts, "minute"),
    partNumber(parts, "second")
  );
  return asUtc - date.getTime();
}

/** רגע UTC שקול לשעון קיר בשעון ישראל (עם תיקון DST). */
export function jerusalemWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const offset1 = timeZoneOffsetMs(new Date(utcGuess), SCHOOL_YEAR_TIME_ZONE);
  const instant = new Date(utcGuess - offset1);
  const offset2 = timeZoneOffsetMs(instant, SCHOOL_YEAR_TIME_ZONE);
  if (offset2 !== offset1) {
    return new Date(utcGuess - offset2);
  }
  return instant;
}

function isOnOrAfterPurchaseSeasonStart(ymd: JerusalemYmd): boolean {
  if (ymd.month > PURCHASE_SEASON_START_MONTH) return true;
  if (ymd.month < PURCHASE_SEASON_START_MONTH) return false;
  return ymd.day >= PURCHASE_SEASON_START_DAY;
}

/**
 * חסם בלעדי של תוקף המנוי לרכישה במועד `purchasedAt`:
 * תחילת ה-2 באוקטובר (שעון ישראל) בשנת היעד.
 */
export function computeSchoolYearExpiry(purchasedAt: Date = new Date()): Date {
  const ymd = jerusalemYmd(purchasedAt);
  const lastActiveYear = isOnOrAfterPurchaseSeasonStart(ymd)
    ? ymd.year + 1
    : ymd.year;
  // יום אחרי היום האחרון הפעיל → 2 באוקטובר 00:00 שעון ישראל.
  return jerusalemWallTimeToUtc(lastActiveYear, SCHOOL_YEAR_LAST_ACTIVE_MONTH, 2);
}

export interface SchoolYearBackfillRow {
  purchasedAt: Date;
  currentExpiresAt: string | Date | null | undefined;
  subscriptionStatus: string;
  /** Completed-payment timestamp; required for `expired` rows (L2). */
  paidAt?: string | Date | null;
  now?: Date;
}

function isMissingTimestamp(value: string | Date | null | undefined): boolean {
  return value == null || value === "";
}

/**
 * TZ-68 backfill predicate — mirrors `064_tz68_backfill_school_year_expiry.sql`.
 * Returns the school-year exclusive end iff the row would be updated.
 *
 * Guards (same as SQL):
 * - L1: never touch `active` rows with NULL expiry (unlimited access).
 * - L1: only update when the computed expiry is still in the future (`now`).
 * - L2: `expired` rows only if `paidAt` is set; never flip unpaid → active.
 * - Never shorten an expiry that is already later or equal.
 */
export function computeSchoolYearExpiryForBackfill(
  row: SchoolYearBackfillRow
): Date | null {
  const now = row.now ?? new Date();
  const status = row.subscriptionStatus;

  if (status === "active" && isMissingTimestamp(row.currentExpiresAt)) {
    return null;
  }
  if (status === "expired" && isMissingTimestamp(row.paidAt)) {
    return null;
  }
  if (status !== "active" && status !== "expired") {
    return null;
  }

  const computed = computeSchoolYearExpiry(row.purchasedAt);
  if (computed.getTime() <= now.getTime()) return null;

  if (isMissingTimestamp(row.currentExpiresAt)) return computed;
  const current =
    typeof row.currentExpiresAt === "string"
      ? new Date(row.currentExpiresAt)
      : row.currentExpiresAt;
  if (current == null || Number.isNaN(current.getTime())) return computed;
  if (current.getTime() >= computed.getTime()) return null;
  return computed;
}

/** תאריך לתצוגה: היום האחרון שעדיין פעיל (1 באוקטובר), שעון ישראל. */
export function formatSchoolYearExpiryDate(
  expiresAt: string | Date | null | undefined,
  options?: { month?: "numeric" | "long" }
): string {
  if (expiresAt == null || expiresAt === "") return "—";
  const expires =
    typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(expires.getTime())) return "—";
  const lastInclusive = new Date(expires.getTime() - 1);
  return lastInclusive.toLocaleDateString("he-IL", {
    timeZone: SCHOOL_YEAR_TIME_ZONE,
    day: "numeric",
    month: options?.month ?? "numeric",
    year: "numeric",
  });
}
