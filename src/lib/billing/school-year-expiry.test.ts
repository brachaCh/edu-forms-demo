import { describe, expect, it } from "vitest";
import {
  computeSchoolYearExpiry,
  computeSchoolYearExpiryForBackfill,
  formatSchoolYearExpiryDate,
  jerusalemWallTimeToUtc,
} from "./school-year-expiry";

/** חסם בלעדי: 2 באוקטובר 00:00 שעון ישראל של השנה הנתונה. */
function exclusiveOctober2(year: number): string {
  return jerusalemWallTimeToUtc(year, 10, 2).toISOString();
}

describe("computeSchoolYearExpiry", () => {
  it("expires on 1 October of the same year for a purchase on 31.7", () => {
    const purchasedAt = new Date("2026-07-31T12:00:00+03:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2026)
    );
  });

  it("expires on 1 October of the next year for a purchase on 1.8", () => {
    const purchasedAt = new Date("2026-08-01T00:00:00+03:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2027)
    );
  });

  it("keeps 31.7 23:59 Israel on the same-year October boundary", () => {
    const purchasedAt = new Date("2026-07-31T23:59:59.999+03:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2026)
    );
  });

  it("expires on 1 October of the next year for a purchase on 30.9", () => {
    const purchasedAt = new Date("2026-09-30T12:00:00+03:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2027)
    );
  });

  it("expires on 1 October of the next year for a purchase on 1.10", () => {
    const purchasedAt = new Date("2026-10-01T12:00:00+03:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2027)
    );
  });

  it("expires on 1 October of the next year for a purchase on 2.10", () => {
    const purchasedAt = new Date("2026-10-02T00:00:00+03:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2027)
    );
  });

  it("uses Israel time so late-evening UTC on 31.7 can already be 1.8 in Jerusalem", () => {
    // 31.7.2026 21:00 UTC = 1.8.2026 00:00 IDT
    const purchasedAt = new Date("2026-07-31T21:00:00.000Z");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2027)
    );
  });

  it("handles a winter purchase (IST +2) before 1 August", () => {
    const purchasedAt = new Date("2027-01-15T12:00:00+02:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2027)
    );
  });

  it("handles leap-day purchases (29.2) before 1 August", () => {
    const purchasedAt = new Date("2028-02-29T12:00:00+02:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2028)
    );
  });

  it("handles leap-year purchases on/after 1 August", () => {
    const purchasedAt = new Date("2028-08-01T00:00:00+03:00");
    expect(computeSchoolYearExpiry(purchasedAt).toISOString()).toBe(
      exclusiveOctober2(2029)
    );
  });

  it("stores the exclusive end at 00:00 on 2 October Israel time", () => {
    const expiry = computeSchoolYearExpiry(new Date("2026-08-01T00:00:00+03:00"));
    expect(expiry.toISOString()).toBe("2027-10-01T21:00:00.000Z");
  });

  it("applies the same rule to purchases from before TZ-68 shipped", () => {
    // 1.8.2024 → until 1.10.2025 (exclusive 2.10.2025 00:00 Israel).
    expect(
      computeSchoolYearExpiry(new Date("2024-08-01T00:00:00+03:00")).toISOString()
    ).toBe(exclusiveOctober2(2025));
    expect(
      computeSchoolYearExpiry(new Date("2024-08-01T00:00:00+03:00")).toISOString()
    ).toBe("2025-10-01T21:00:00.000Z");

    // 31.7.2025 (before the season start) → until 1.10.2025.
    expect(
      computeSchoolYearExpiry(new Date("2025-07-31T12:00:00+03:00")).toISOString()
    ).toBe(exclusiveOctober2(2025));

    // 1.8.2025 → until 1.10.2026.
    expect(
      computeSchoolYearExpiry(new Date("2025-08-01T00:00:00+03:00")).toISOString()
    ).toBe(exclusiveOctober2(2026));
  });
});

describe("computeSchoolYearExpiryForBackfill", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");
  const purchasedAt = new Date("2026-08-01T00:00:00+03:00");

  it("extends an active row when the current expiry is earlier than the school-year date", () => {
    const current = new Date("2027-08-01T00:00:00.000Z");
    expect(
      computeSchoolYearExpiryForBackfill({
        purchasedAt,
        currentExpiresAt: current,
        subscriptionStatus: "active",
        paidAt: purchasedAt,
        now,
      })?.toISOString()
    ).toBe(exclusiveOctober2(2027));
  });

  it("never shortens a later remaining expiry (manual extension / special deal)", () => {
    const later = exclusiveOctober2(2028);
    expect(
      computeSchoolYearExpiryForBackfill({
        purchasedAt: new Date("2026-07-31T12:00:00+03:00"),
        currentExpiresAt: later,
        subscriptionStatus: "active",
        paidAt: new Date("2026-07-31T12:00:00+03:00"),
        now,
      })
    ).toBeNull();
  });

  it("is a no-op when the current expiry already equals the computed value", () => {
    expect(
      computeSchoolYearExpiryForBackfill({
        purchasedAt,
        currentExpiresAt: exclusiveOctober2(2027),
        subscriptionStatus: "active",
        paidAt: purchasedAt,
        now,
      })
    ).toBeNull();
  });

  it("L1: never touches an active row with NULL expiry (unlimited access)", () => {
    expect(
      computeSchoolYearExpiryForBackfill({
        purchasedAt,
        currentExpiresAt: null,
        subscriptionStatus: "active",
        paidAt: purchasedAt,
        now,
      })
    ).toBeNull();
  });

  it("L1: skips when the computed school-year expiry is already in the past", () => {
    expect(
      computeSchoolYearExpiryForBackfill({
        purchasedAt: new Date("2024-08-01T00:00:00+03:00"),
        currentExpiresAt: "2025-08-01T00:00:00.000Z",
        subscriptionStatus: "active",
        paidAt: new Date("2024-08-01T00:00:00+03:00"),
        now: new Date("2026-10-20T00:00:00.000Z"),
      })
    ).toBeNull();
  });

  it("L2: never considers an expired row without paid_at (unpaid)", () => {
    expect(
      computeSchoolYearExpiryForBackfill({
        purchasedAt,
        currentExpiresAt: "2026-09-01T00:00:00.000Z",
        subscriptionStatus: "expired",
        paidAt: null,
        now,
      })
    ).toBeNull();
  });

  it("L2: may set expiry on a paid expired row with no current date when the result is still in the future", () => {
    expect(
      computeSchoolYearExpiryForBackfill({
        purchasedAt,
        currentExpiresAt: null,
        subscriptionStatus: "expired",
        paidAt: purchasedAt,
        now,
      })?.toISOString()
    ).toBe(exclusiveOctober2(2027));
  });
});

describe("formatSchoolYearExpiryDate", () => {
  it("shows the last inclusive day (1 October) in Israel time", () => {
    expect(formatSchoolYearExpiryDate("2027-10-01T21:00:00.000Z")).toBe(
      "1.10.2027"
    );
  });

  it("formats a long Hebrew month for emails", () => {
    expect(
      formatSchoolYearExpiryDate("2027-10-01T21:00:00.000Z", { month: "long" })
    ).toContain("אוקטובר");
  });
});
