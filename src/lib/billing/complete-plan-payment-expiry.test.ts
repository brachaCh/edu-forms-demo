import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeSchoolYearExpiry,
  jerusalemWallTimeToUtc,
} from "./school-year-expiry";

/** חסם בלעדי: 2 באוקטובר 00:00 שעון ישראל של השנה הנתונה. */
function exclusiveOctober2(year: number): string {
  return jerusalemWallTimeToUtc(year, 10, 2).toISOString();
}

const paymentUpdates: Record<string, unknown>[] = [];
const institutionUpdates: Record<string, unknown>[] = [];

let mockPaymentStatus = "pending";
let mockInstitutionExpiry: string | null = null;

function thenable(result: { error: null; data?: { id: string }[] }) {
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (
      resolve: (value: { error: null; data?: { id: string }[] }) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock("@/lib/sumit/plan-catalog", () => ({
  getBillingPlanById: async (planId: string) =>
    planId === "plan-1"
      ? { id: "plan-1", title: "plan-1", priceAg: 210000 }
      : null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            if (table === "plan_payments") {
              return Promise.resolve({
                data: {
                  id: "pay-1",
                  institution_id: "inst-1",
                  plan_id: "plan-1",
                  status: mockPaymentStatus,
                  amount_agorot: 210000,
                },
                error: null,
              });
            }
            return Promise.resolve({
              data: { plan_expires_at: mockInstitutionExpiry },
              error: null,
            });
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        if (table === "plan_payments") paymentUpdates.push(payload);
        if (table === "institutions") institutionUpdates.push(payload);
        return thenable({ error: null, data: [{ id: "row-1" }] });
      },
    }),
  }),
}));

import { completePlanPayment } from "./complete-plan-payment";

describe("completePlanPayment school-year expiry", () => {
  beforeEach(() => {
    paymentUpdates.length = 0;
    institutionUpdates.length = 0;
    mockPaymentStatus = "pending";
    mockInstitutionExpiry = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets plan_expires_at from the school-year rule on card/coupon success", async () => {
    vi.setSystemTime(new Date("2026-08-01T00:00:00+03:00"));

    const result = await completePlanPayment({
      planPaymentId: "pay-1",
      institutionId: "inst-1",
      planId: "plan-1",
      sumitTransactionId: "txn-1",
    });

    expect(result).toEqual({ ok: true });
    expect(institutionUpdates).toHaveLength(1);
    expect(institutionUpdates[0]?.plan_expires_at).toBe(
      computeSchoolYearExpiry(new Date("2026-08-01T00:00:00+03:00")).toISOString()
    );
    expect(institutionUpdates[0]?.plan_expires_at).toBe(
      "2027-10-01T21:00:00.000Z"
    );
    expect(institutionUpdates[0]?.subscription_status).toBe("active");
  });

  it("early renewal on 15.7.2027 with existing 1.10.2027 gives 1.10.2028", async () => {
    vi.setSystemTime(new Date("2027-07-15T12:00:00+03:00"));
    mockInstitutionExpiry = exclusiveOctober2(2027);

    const result = await completePlanPayment({
      planPaymentId: "pay-1",
      institutionId: "inst-1",
      planId: "plan-1",
      sumitTransactionId: "txn-1",
    });

    expect(result).toEqual({ ok: true });
    expect(institutionUpdates).toHaveLength(1);
    expect(institutionUpdates[0]?.plan_expires_at).toBe(exclusiveOctober2(2028));
  });

  it("renewal on 1.8.2027 with existing 1.10.2027 gives 1.10.2028 without extra bump", async () => {
    vi.setSystemTime(new Date("2027-08-01T00:00:00+03:00"));
    mockInstitutionExpiry = exclusiveOctober2(2027);

    const result = await completePlanPayment({
      planPaymentId: "pay-1",
      institutionId: "inst-1",
      planId: "plan-1",
      sumitTransactionId: "txn-1",
    });

    expect(result).toEqual({ ok: true });
    expect(institutionUpdates).toHaveLength(1);
    expect(institutionUpdates[0]?.plan_expires_at).toBe(exclusiveOctober2(2028));
  });

  it("existing manual 1.10.2030 stays — never shortens a longer manual expiry", async () => {
    vi.setSystemTime(new Date("2027-07-15T12:00:00+03:00"));
    mockInstitutionExpiry = exclusiveOctober2(2030);

    const result = await completePlanPayment({
      planPaymentId: "pay-1",
      institutionId: "inst-1",
      planId: "plan-1",
      sumitTransactionId: "txn-1",
    });

    expect(result).toEqual({ ok: true });
    expect(institutionUpdates).toHaveLength(1);
    expect(institutionUpdates[0]?.plan_expires_at).toBe(exclusiveOctober2(2030));
  });
});

describe("completePlanPayment idempotency", () => {
  beforeEach(() => {
    paymentUpdates.length = 0;
    institutionUpdates.length = 0;
    mockPaymentStatus = "pending";
    mockInstitutionExpiry = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("duplicate return+webhook for one payment extends once (ALREADY_COMPLETED)", async () => {
    vi.setSystemTime(new Date("2027-07-15T12:00:00+03:00"));
    mockInstitutionExpiry = exclusiveOctober2(2027);
    mockPaymentStatus = "completed";

    const result = await completePlanPayment({
      planPaymentId: "pay-1",
      institutionId: "inst-1",
      planId: "plan-1",
      sumitTransactionId: "txn-1",
    });

    expect(result).toEqual({ ok: true, reason: "ALREADY_COMPLETED" });
    expect(paymentUpdates).toHaveLength(0);
    expect(institutionUpdates).toHaveLength(0);
  });
});
