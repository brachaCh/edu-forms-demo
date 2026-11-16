export interface PublicExternalSignatureRequest {
  id: string;
  documentName: string;
  signerLabel: string;
  expiresAt: string;
  documentUrl: string;
}

async function invokeExternalSignaturePublic<T>(
  body: Record<string, unknown>
): Promise<{
  ok: boolean;
  data?: T;
  error?: string;
  maskedEmail?: string;
}> {
  try {
    const response = await fetch("/api/external-signature/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      request?: T;
      maskedEmail?: string;
    } | null;
    if (!payload) {
      return { ok: false, error: "שגיאת שרת" };
    }
    if (payload.ok) {
      return { ok: true, data: payload.request };
    }
    return {
      ok: false,
      error: payload.error || "שגיאת שרת",
      maskedEmail: payload.maskedEmail,
    };
  } catch {
    return { ok: false, error: "שגיאת רשת — בדקו חיבור לאינטרנט" };
  }
}

export function loadPublicExternalSignature(token: string) {
  return invokeExternalSignaturePublic<PublicExternalSignatureRequest>({ action: "get", token });
}

export async function requestExternalSignatureOtp(token: string): Promise<{
  ok: boolean;
  error?: string;
  maskedEmail?: string;
}> {
  try {
    const response = await fetch("/api/external-signature/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      maskedEmail?: string;
    } | null;
    if (response.status === 429) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    if (!payload) return { ok: false, error: "OTP_UNAVAILABLE" };
    if (payload.ok) {
      return { ok: true, maskedEmail: payload.maskedEmail };
    }
    return { ok: false, error: payload.error || "OTP_UNAVAILABLE" };
  } catch {
    return { ok: false, error: "OTP_UNAVAILABLE" };
  }
}

export async function verifyExternalSignatureOtp(
  token: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/external-signature/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, code }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (response.status === 429) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    if (payload?.ok) return { ok: true };
    return { ok: false, error: payload?.error || "INVALID_CREDENTIALS" };
  } catch {
    return { ok: false, error: "OTP_UNAVAILABLE" };
  }
}

export async function submitExternalSignature(
  token: string,
  signatureData: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/external-signature/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, signatureData }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (payload?.ok) return { ok: true };
    return { ok: false, error: payload?.error || "שמירת החתימה נכשלה" };
  } catch {
    return { ok: false, error: "שגיאת רשת" };
  }
}
