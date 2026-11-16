import type { SubscriptionStatus } from "@/lib/supabase/types";

export interface DashboardSubscriptionRow {
  subscription_status: SubscriptionStatus | null;
  plan_expires_at: string | null;
}

export interface DashboardCounts {
  activeSubscriptions: number;
  expiringSubscriptions: number;
  expiredSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
}

const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** מחשב ספירות מנויים ללוח הבקרה — פעיל / עומד לפוג / פג / ממתין / בוטל */
export function computeSubscriptionCounts(
  rows: DashboardSubscriptionRow[],
  now = new Date()
): DashboardCounts {
  const thirtyDaysFromNow = new Date(now.getTime() + EXPIRING_WINDOW_MS);

  const counts: DashboardCounts = {
    activeSubscriptions: 0,
    expiringSubscriptions: 0,
    expiredSubscriptions: 0,
    pendingSubscriptions: 0,
    cancelledSubscriptions: 0,
  };

  for (const row of rows) {
    const status = row.subscription_status;
    const expiresAt = row.plan_expires_at;
    const expiryDate = expiresAt ? new Date(expiresAt) : null;
    const validExpiry =
      expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null;

    if (status === "cancelled") {
      counts.cancelledSubscriptions++;
      continue;
    }

    if (status === "pending_payment") {
      counts.pendingSubscriptions++;
      continue;
    }

    if (status === "active") {
      if (validExpiry && validExpiry < now) {
        counts.expiredSubscriptions++;
      } else if (validExpiry && validExpiry <= thirtyDaysFromNow) {
        counts.expiringSubscriptions++;
        counts.activeSubscriptions++;
      } else {
        counts.activeSubscriptions++;
      }
      continue;
    }

    if (status === "expired") {
      counts.expiredSubscriptions++;
    }
  }

  return counts;
}
