import {
  createSignedBlob,
  sessionCookieOptions,
  verifySignedBlob,
} from "@/lib/session";

export const PENDING_PAYMENT_COOKIE = "matoah_pending_payment";
const PENDING_PAYMENT_MAX_AGE = 60 * 60; // 1 hour

export interface PendingPaymentCookiePayload {
  paymentId: string;
  institutionId: string;
  planId: string;
  userId: string;
  exp: number;
}

export async function createPendingPaymentToken(
  paymentId: string,
  institutionId: string,
  planId: string,
  userId: string
): Promise<string> {
  const payload: PendingPaymentCookiePayload = {
    paymentId,
    institutionId,
    planId,
    userId,
    exp: Math.floor(Date.now() / 1000) + PENDING_PAYMENT_MAX_AGE,
  };
  return createSignedBlob({ ...payload });
}

export async function verifyPendingPaymentToken(
  token: string
): Promise<PendingPaymentCookiePayload | null> {
  const payload = await verifySignedBlob<PendingPaymentCookiePayload & Record<string, unknown>>(token);
  if (
    !payload?.paymentId ||
    !payload.institutionId ||
    !payload.planId ||
    !payload.userId ||
    !payload.exp
  ) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function pendingPaymentCookieOptions() {
  return sessionCookieOptions(PENDING_PAYMENT_MAX_AGE);
}
