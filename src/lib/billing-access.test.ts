import { describe, expect, it } from "vitest";
import {
  getBillingGateHref,
  getPersonalAreaGateHref,
  isSubscriptionActive,
  REGISTER_PLAN_PATH,
  MANAGE_PLAN_PATH,
} from "./billing-access";

describe("billing-access", () => {
  const baseProfile = {
    setup_completed_at: null as string | null,
    plan_id: null as string | null,
    subscription_status: "none" as const,
    is_admin: false,
  };

  it("detects active subscriptions", () => {
    const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const pastExpiry = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isSubscriptionActive("active")).toBe(true);
    expect(isSubscriptionActive("active", futureExpiry)).toBe(true);
    expect(isSubscriptionActive("active", pastExpiry)).toBe(false);
    expect(isSubscriptionActive("pending_payment")).toBe(false);
  });

  it("sends new users without billing to register plan", () => {
    expect(getBillingGateHref(baseProfile)).toBe(REGISTER_PLAN_PATH);
  });

  it("allows access when plan is selected and payment is not required", () => {
    expect(
      getBillingGateHref(
        {
          ...baseProfile,
          plan_id: "plan-1",
          subscription_status: "pending_payment",
        },
        { paymentRequired: false }
      )
    ).toBeNull();
  });

  it("still requires payment when sumit is configured", () => {
    expect(
      getBillingGateHref(
        {
          ...baseProfile,
          setup_completed_at: "2026-08-16T12:00:00.000Z",
          plan_id: "plan-1",
          subscription_status: "pending_payment",
        },
        { paymentRequired: true }
      )
    ).toBe(MANAGE_PLAN_PATH);
  });

  it("sends users with a plan but no active billing to manage plan", () => {
    expect(
      getBillingGateHref({
        ...baseProfile,
        setup_completed_at: "2026-08-16T12:00:00.000Z",
        plan_id: "plan-1",
        subscription_status: "pending_payment",
      })
    ).toBe(MANAGE_PLAN_PATH);
  });

  it("sends onboarded users without a plan to register plan", () => {
    expect(
      getBillingGateHref({
        ...baseProfile,
        setup_completed_at: "2026-08-16T12:00:00.000Z",
      })
    ).toBe(REGISTER_PLAN_PATH);
  });

  it("allows manage plan path without redirect when billing pending", () => {
    expect(
      getPersonalAreaGateHref(
        {
          ...baseProfile,
          setup_completed_at: "2026-08-16T12:00:00.000Z",
          plan_id: "plan-1",
          subscription_status: "pending_payment",
        },
        MANAGE_PLAN_PATH
      )
    ).toBeNull();
  });

  it("allows setup before billing when onboarding is incomplete", () => {
    expect(getPersonalAreaGateHref(baseProfile, "/personal-area/setup")).toBeNull();
    expect(getPersonalAreaGateHref(baseProfile, "/personal-area")).toBe(
      "/personal-area/setup"
    );
  });

  it("keeps the framework setup screen open after a plan was selected", () => {
    const pendingPlan = {
      ...baseProfile,
      setup_completed_at: "2026-08-16T12:00:00.000Z",
      plan_id: "plan-1",
      subscription_status: "pending_payment" as const,
    };
    expect(getPersonalAreaGateHref(pendingPlan, "/personal-area/setup")).toBeNull();
    expect(getPersonalAreaGateHref(pendingPlan, "/personal-area")).toBe(
      MANAGE_PLAN_PATH
    );
  });

  it("redirects to register plan after setup when billing is missing", () => {
    expect(
      getPersonalAreaGateHref(
        {
          ...baseProfile,
          setup_completed_at: "2026-08-16T12:00:00.000Z",
        },
        "/personal-area"
      )
    ).toBe(REGISTER_PLAN_PATH);
  });

  it("requires setup after active billing", () => {
    expect(
      getPersonalAreaGateHref(
        {
          ...baseProfile,
          plan_id: "plan-1",
          subscription_status: "active",
        },
        "/personal-area"
      )
    ).toBe("/personal-area/setup");
  });

  it("skips billing gate for admins", () => {
    expect(
      getPersonalAreaGateHref(
        { ...baseProfile, is_admin: true },
        "/personal-area"
      )
    ).toBe("/personal-area/setup");
  });

  it("lets a platform admin in without setup or an active plan", () => {
    expect(
      getPersonalAreaGateHref(baseProfile, "/personal-area", {
        isPlatformAdmin: true,
      })
    ).toBeNull();
  });
});
