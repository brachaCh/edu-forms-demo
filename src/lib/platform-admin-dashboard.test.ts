import { describe, expect, it } from "vitest";
import { computeSubscriptionCounts } from "./platform-admin-dashboard";

describe("computeSubscriptionCounts", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");

  it("counts active, expiring, expired, pending and cancelled", () => {
    const counts = computeSubscriptionCounts(
      [
        { subscription_status: "active", plan_expires_at: "2027-01-01T00:00:00.000Z" },
        { subscription_status: "active", plan_expires_at: "2026-10-20T00:00:00.000Z" },
        { subscription_status: "active", plan_expires_at: "2026-09-01T00:00:00.000Z" },
        { subscription_status: "expired", plan_expires_at: "2026-08-01T00:00:00.000Z" },
        { subscription_status: "pending_payment", plan_expires_at: null },
        { subscription_status: "cancelled", plan_expires_at: "2027-01-01T00:00:00.000Z" },
        { subscription_status: "none", plan_expires_at: null },
      ],
      now
    );

    expect(counts.activeSubscriptions).toBe(2);
    expect(counts.expiringSubscriptions).toBe(1);
    expect(counts.expiredSubscriptions).toBe(2);
    expect(counts.pendingSubscriptions).toBe(1);
    expect(counts.cancelledSubscriptions).toBe(1);
  });
});
