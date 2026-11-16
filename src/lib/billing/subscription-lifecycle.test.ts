import { describe, expect, it } from "vitest";
import {
  bumpSchoolYearExpiry,
  buildRenewalReminderEmail,
  computeExtendedExpiry,
  computeNextExpiry,
  daysUntilExpiry,
  effectiveSubscriptionStatus,
  isPlanExpired,
  shouldSendRenewalReminder,
} from "./subscription-lifecycle";
import { jerusalemWallTimeToUtc } from "./school-year-expiry";

/** חסם בלעדי: 2 באוקטובר 00:00 שעון ישראל של השנה הנתונה. */
function exclusiveOctober2(year: number): string {
  return jerusalemWallTimeToUtc(year, 10, 2).toISOString();
}

describe("subscription-lifecycle", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("marks active subscriptions as expired after plan_expires_at", () => {
    expect(
      effectiveSubscriptionStatus("active", "2026-08-25T12:00:00.000Z", now)
    ).toBe("expired");
    expect(
      effectiveSubscriptionStatus("active", "2026-09-01T12:00:00.000Z", now)
    ).toBe("active");
  });

  it("sets school-year expiry from the purchase date on renewal", () => {
    // 26.8.2026 (אחרי 1.8) → עד 1.10.2027; תפוגה נוכחית בדצמבר 2026 קצרה יותר.
    const next = computeNextExpiry("2026-12-01T12:00:00.000Z", now);
    expect(next.toISOString()).toBe("2027-10-01T21:00:00.000Z");
  });

  it("does not shorten a later remaining expiry", () => {
    const later = "2028-10-01T21:00:00.000Z";
    const next = computeNextExpiry(later, now);
    expect(next.toISOString()).toBe(later);
  });

  it("sends reminder within 30 days of expiry", () => {
    const expires = "2026-09-20T12:00:00.000Z";
    expect(
      shouldSendRenewalReminder("active", expires, null, now)
    ).toBe(true);
    expect(daysUntilExpiry(expires, now)).toBe(25);
  });

  it("skips reminder when already sent for same expiry", () => {
    const expires = "2026-09-20T12:00:00.000Z";
    expect(
      shouldSendRenewalReminder("active", expires, expires, now)
    ).toBe(false);
  });

  it("does not blast a reminder after TZ-68 backfill stamps the new expiry", () => {
    const nearExpiry = "2026-09-20T12:00:00.000Z";
    expect(
      shouldSendRenewalReminder("active", nearExpiry, nearExpiry, now)
    ).toBe(false);
  });

  it("does not send a reminder when backfill extended expiry beyond 30 days", () => {
    const farExpiry = "2027-10-01T21:00:00.000Z";
    expect(
      shouldSendRenewalReminder("active", farExpiry, null, now)
    ).toBe(false);
    expect(daysUntilExpiry(farExpiry, now)).toBeGreaterThan(30);
  });

  it("builds different emails for credit card and bank transfer", () => {
    const credit = buildRenewalReminderEmail({
      fullName: "רבקה",
      institutionName: "גן דוגמה",
      planPriceFormatted: "‏2,100 ‏₪",
      expiresAt: "2026-09-20T12:00:00.000Z",
      paymentMethod: "credit_card",
    });
    const bank = buildRenewalReminderEmail({
      fullName: "רבקה",
      institutionName: "גן דוגמה",
      planPriceFormatted: "‏2,100 ‏₪",
      expiresAt: "2026-09-20T12:00:00.000Z",
      paymentMethod: "bank_transfer",
    });
    expect(credit.text).toContain("יתחדש אוטומטית");
    expect(credit.text).toContain("לפרוטוקל");
    expect(credit.text).toContain("סכום החידוש");
    expect(bank.text).toContain("העברה בנקאית");
    expect(bank.text).toContain("לפרוטוקל");
    expect(credit.subject).toContain("פרוטוקל");
    expect(credit.html).toContain("פרוטוקל");
    expect(credit.html).not.toContain("מתוה");
    expect(credit.html).toContain("סכום:");
  });

  it("extends a future expiry by the given days", () => {
    const next = computeExtendedExpiry("2026-12-01T12:00:00.000Z", 10, now);
    expect(next.toISOString()).toBe("2026-12-11T12:00:00.000Z");
  });

  it("extends from now when current expiry is already past", () => {
    const next = computeExtendedExpiry("2026-08-01T12:00:00.000Z", 5, now);
    expect(next.toISOString()).toBe("2026-08-31T12:00:00.000Z");
  });

  it("detects expired plans", () => {
    expect(isPlanExpired("2026-08-25T12:00:00.000Z", now)).toBe(true);
    expect(isPlanExpired("2026-09-01T12:00:00.000Z", now)).toBe(false);
  });
});

describe("bumpSchoolYearExpiry", () => {
  it("bumps 1.10.2027 exclusive end to 1.10.2028 exclusive end", () => {
    const oct2027 = jerusalemWallTimeToUtc(2027, 10, 2);
    const result = bumpSchoolYearExpiry(oct2027);
    expect(result.toISOString()).toBe(exclusiveOctober2(2028));
  });
});

describe("computeNextExpiry — early-renewal rule (TZ-68 Rivki's decision)", () => {
  it("early renewal on 15.7.2027 with existing 1.10.2027 gives 1.10.2028", () => {
    const renewalDate = new Date("2027-07-15T12:00:00+03:00");
    const existingExpiry = exclusiveOctober2(2027);
    const result = computeNextExpiry(existingExpiry, renewalDate);
    expect(result.toISOString()).toBe(exclusiveOctober2(2028));
  });

  it("renewal on/after 1.8.Y with existing 1.10.Y gives 1.10.Y+1 without extra bump", () => {
    const renewalDate = new Date("2027-08-01T00:00:00+03:00");
    const existingExpiry = exclusiveOctober2(2027);
    const result = computeNextExpiry(existingExpiry, renewalDate);
    expect(result.toISOString()).toBe(exclusiveOctober2(2028));
  });

  it("renewal on 2.10.2027 with existing 1.10.2028 gives 1.10.2029", () => {
    const renewalDate = new Date("2027-10-02T00:00:00+03:00");
    const existingExpiry = exclusiveOctober2(2028);
    const result = computeNextExpiry(existingExpiry, renewalDate);
    expect(result.toISOString()).toBe(exclusiveOctober2(2029));
  });

  it("existing manual 1.10.2030 stays — never shortens a longer manual expiry", () => {
    const renewalDate = new Date("2027-07-15T12:00:00+03:00");
    const manualExpiry = exclusiveOctober2(2030);
    const result = computeNextExpiry(manualExpiry, renewalDate);
    expect(result.toISOString()).toBe(exclusiveOctober2(2030));
  });

  it("expired-plan renewal uses normal school-year rule (no bump)", () => {
    const renewalDate = new Date("2027-07-15T12:00:00+03:00");
    const expiredExpiry = "2026-10-01T21:00:00.000Z";
    const result = computeNextExpiry(expiredExpiry, renewalDate);
    expect(result.toISOString()).toBe(exclusiveOctober2(2027));
  });

  it("new purchase with no existing expiry uses normal school-year rule", () => {
    const purchaseDate = new Date("2027-07-15T12:00:00+03:00");
    const result = computeNextExpiry(null, purchaseDate);
    expect(result.toISOString()).toBe(exclusiveOctober2(2027));
  });

  it("new purchase after 1.8 with no existing expiry gives next year", () => {
    const purchaseDate = new Date("2027-08-01T00:00:00+03:00");
    const result = computeNextExpiry(null, purchaseDate);
    expect(result.toISOString()).toBe(exclusiveOctober2(2028));
  });
});
