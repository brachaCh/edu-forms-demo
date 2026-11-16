import type { SubscriptionStatus, UserProfile } from "@/lib/supabase/types";
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-lifecycle";

export const REGISTER_PLAN_PATH = "/register/plan";
export const MANAGE_PLAN_PATH = "/personal-area/plan";
const SETUP_PATH = "/personal-area/setup";
const PLATFORM_SUBSCRIPTIONS_PATH = "/personal-area/subscriptions";

export function isSubscriptionActive(
  status: SubscriptionStatus | null | undefined,
  planExpiresAt?: string | null
): boolean {
  return effectiveSubscriptionStatus(status, planExpiresAt) === "active";
}

export function isBillingExemptProfile(
  profile: Pick<UserProfile, "is_admin">
): boolean {
  return profile.is_admin === true;
}

export function isPersonalAreaPlanPath(pathname: string): boolean {
  return (
    pathname === MANAGE_PLAN_PATH || pathname.startsWith(`${MANAGE_PLAN_PATH}/`)
  );
}

export function isRegisterPlanPath(pathname: string): boolean {
  return pathname === REGISTER_PLAN_PATH;
}

export function isPersonalAreaSetupPath(pathname: string): boolean {
  return pathname === SETUP_PATH || pathname.startsWith(`${SETUP_PATH}/`);
}

export function isPersonalAreaSubscriptionsPath(pathname: string): boolean {
  return (
    pathname === "/personal-area/subscriptions" ||
    pathname.startsWith("/personal-area/subscriptions/")
  );
}

type GateProfile = Pick<
  UserProfile,
  | "setup_completed_at"
  | "plan_id"
  | "subscription_status"
  | "plan_expires_at"
  | "is_admin"
>;

export function needsActiveBilling(
  profile: GateProfile,
  options?: { billingExempt?: boolean; paymentRequired?: boolean }
): boolean {
  const billingExempt =
    options?.billingExempt ?? isBillingExemptProfile(profile);
  if (billingExempt) return false;

  const paymentRequired = options?.paymentRequired ?? true;
  if (profile.plan_id && !paymentRequired) return false;

  return (
    !profile.plan_id ||
    !isSubscriptionActive(profile.subscription_status, profile.plan_expires_at)
  );
}

export function getBillingGateHref(
  profile: GateProfile,
  options?: { billingExempt?: boolean; paymentRequired?: boolean }
): string | null {
  if (!needsActiveBilling(profile, options)) return null;
  return profile.plan_id ? MANAGE_PLAN_PATH : REGISTER_PLAN_PATH;
}

export function getPersonalAreaGateHref(
  profile: GateProfile,
  pathname: string,
  options?: {
    billingExempt?: boolean;
    paymentRequired?: boolean;
    isPlatformAdmin?: boolean;
  }
): string | null {
  // מנהלת פלטפורמה נכנסת גם בלי מוסד ובלי מנוי פעיל.
  if (options?.isPlatformAdmin) return null;

  if (isPersonalAreaPlanPath(pathname) || isPersonalAreaSubscriptionsPath(pathname)) {
    return null;
  }

  const billingExempt =
    options?.billingExempt ?? isBillingExemptProfile(profile);

  if (isPersonalAreaSetupPath(pathname)) {
    return null;
  }

  if (!profile.setup_completed_at) {
    return SETUP_PATH;
  }

  const billingGate = getBillingGateHref(profile, {
    billingExempt,
    paymentRequired: options?.paymentRequired,
  });
  if (billingGate) {
    return billingGate;
  }

  return null;
}
