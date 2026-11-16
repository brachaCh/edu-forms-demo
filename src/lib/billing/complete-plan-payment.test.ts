import { beforeEach, describe, expect, it, vi } from "vitest";

const schedulePurchaseOwnerNotification = vi.fn();

vi.mock("@/lib/billing/purchase-notification", () => ({
  schedulePurchaseOwnerNotification: (...args: unknown[]) =>
    schedulePurchaseOwnerNotification(...args),
}));

vi.mock("@/lib/sumit/plan-catalog", async () => {
  const { getPlanById } = await import("@/lib/purchase-plans");
  return {
    getBillingPlanById: async (planId: string) => {
      const plan = getPlanById(planId);
      return plan
        ? { ...plan, sumitItemId: null, sumitSku: null, source: "fallback" }
        : null;
    },
  };
});

type PaymentRow = {
  id: string;
  institution_id: string;
  plan_id: string;
  status: string;
  amount_agorot: number;
  allow_discount: boolean;
};

let payment: PaymentRow;
let institution: { plan_expires_at: string | null };
let lastPlanPaymentUpdateRows: { id: string }[] = [];
let paymentUpdateMatches = true;

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const self = builder as {
        select: () => typeof self;
        eq: () => typeof self;
        update: (payload: Record<string, unknown>) => typeof self;
        maybeSingle: () => Promise<{ data: unknown; error: null }>;
        then: (
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject: (reason: unknown) => unknown
        ) => Promise<unknown>;
      };
      self.select = () => self;
      self.eq = () => self;
      self.update = (payload: Record<string, unknown>) => {
        if (table === "plan_payments" && payload.status === "completed") {
          if (paymentUpdateMatches && payment.status === "pending") {
            payment = { ...payment, ...payload } as PaymentRow;
            lastPlanPaymentUpdateRows = [{ id: payment.id }];
          } else {
            lastPlanPaymentUpdateRows = [];
          }
        }
        if (table === "institutions") {
          institution = {
            plan_expires_at:
              (payload.plan_expires_at as string | null) ??
              institution.plan_expires_at,
          };
        }
        return self;
      };
      self.maybeSingle = async () => {
        if (table === "plan_payments") {
          return { data: { ...payment }, error: null };
        }
        return { data: { ...institution }, error: null };
      };
      self.then = (resolve, reject) => {
        if (table === "plan_payments") {
          return Promise.resolve({
            data: lastPlanPaymentUpdateRows,
            error: null,
          }).then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      };
      return self;
    },
  }),
}));

import { completePlanPayment, paymentAmountMatchesPlan } from "./complete-plan-payment";

describe("complete-plan-payment", () => {
  it("matches plan amounts in ILS", async () => {
    await expect(paymentAmountMatchesPlan("plan-1", 2100)).resolves.toBe(true);
    await expect(paymentAmountMatchesPlan("plan-1", 2100.001)).resolves.toBe(true);
    await expect(paymentAmountMatchesPlan("plan-1", 2000)).resolves.toBe(false);
  });

  it("accepts discounted amounts when a coupon is allowed", async () => {
    await expect(
      paymentAmountMatchesPlan("plan-1", 2000, undefined, true)
    ).resolves.toBe(true);
    await expect(
      paymentAmountMatchesPlan("plan-1", 2100, undefined, true)
    ).resolves.toBe(true);
    await expect(
      paymentAmountMatchesPlan("plan-1", 1, undefined, true)
    ).resolves.toBe(true);
  });

  it("rejects non-positive or over-full amounts even with a coupon", async () => {
    await expect(
      paymentAmountMatchesPlan("plan-1", 0, undefined, true)
    ).resolves.toBe(false);
    await expect(
      paymentAmountMatchesPlan("plan-1", 2100.5, undefined, true)
    ).resolves.toBe(false);
  });
});

describe("completePlanPayment purchase notification", () => {
  beforeEach(() => {
    schedulePurchaseOwnerNotification.mockReset();
    lastPlanPaymentUpdateRows = [];
    paymentUpdateMatches = true;
    payment = {
      id: "pay-1",
      institution_id: "inst-1",
      plan_id: "plan-1",
      status: "pending",
      amount_agorot: 210_000,
      allow_discount: false,
    };
    institution = { plan_expires_at: null };
  });

  const input = {
    planPaymentId: "pay-1",
    institutionId: "inst-1",
    planId: "plan-1",
    sumitTransactionId: "sumit-tx-1",
  };

  it("notifies after a successful card payment", async () => {
    const result = await completePlanPayment(input);
    expect(result).toEqual({ ok: true });
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledTimes(1);
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: "inst-1",
        planId: "plan-1",
        paymentMethod: "credit_card",
        amountAgorot: 210_000,
        listPriceAgorot: 210_000,
        couponApplied: false,
        idempotencyKey: "plan-payment:pay-1",
      })
    );
  });

  it("flags a coupon when the paid amount is below list price", async () => {
    payment.allow_discount = true;
    const result = await completePlanPayment({
      ...input,
      actualAmountAgorot: 100_000,
    });
    expect(result).toEqual({ ok: true });
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        amountAgorot: 100_000,
        listPriceAgorot: 210_000,
        couponApplied: true,
        idempotencyKey: "plan-payment:pay-1",
      })
    );
  });

  it("does not notify when the payment is already completed", async () => {
    payment.status = "completed";
    const result = await completePlanPayment(input);
    expect(result).toEqual({ ok: true, reason: "ALREADY_COMPLETED" });
    expect(schedulePurchaseOwnerNotification).not.toHaveBeenCalled();
  });

  it("does not notify when the pending→completed update matches no row", async () => {
    paymentUpdateMatches = false;
    const result = await completePlanPayment(input);
    expect(result).toEqual({ ok: true, reason: "ALREADY_COMPLETED" });
    expect(schedulePurchaseOwnerNotification).not.toHaveBeenCalled();
  });

  it("still completes the purchase if notification scheduling throws", async () => {
    schedulePurchaseOwnerNotification.mockImplementation(() => {
      throw new Error("notify exploded");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(completePlanPayment(input)).resolves.toEqual({ ok: true });
    errorSpy.mockRestore();
  });
});
