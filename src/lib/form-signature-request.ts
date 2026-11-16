export interface SignatureAssignment {
  email: string;
  fieldKey: string;
  fieldLabel: string;
}

export interface PublicSignatureCompanionIdField {
  key: string;
  label: string;
  value: string;
}

export interface PublicSignatureRequest {
  formTitle: string;
  studentName: string;
  fieldKey?: string;
  fieldLabel: string;
  snapshotHtml: string;
  expiresAt: string;
  status: "pending" | "signed" | "expired" | "revoked";
  companionIdField?: PublicSignatureCompanionIdField | null;
}

/**
 * יצירת קישורי חתימה במתוה — דרך API מאומת (סשן צוות + בדיקת מוסד).
 * רישום ה-audit נעשה בשרת.
 */
export async function createSignatureRequests(input: {
  formFillId: string;
  formTitle: string;
  studentName: string;
  snapshotHtml: string;
  assignments: SignatureAssignment[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/signature/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (payload?.ok) return { ok: true };
    if (response.status === 401) {
      return { ok: false, error: "יש להתחבר מחדש כדי לשלוח לחתימה" };
    }
    if (response.status === 413) {
      return {
        ok: false,
        error:
          "הטופס כבד מדי לשליחה לחתימה. הסירו תמונות או חתימות קיימות ונסו שוב.",
      };
    }
    return {
      ok: false,
      error: payload?.error || "שליחת החתימה נכשלה — נסו שוב",
    };
  } catch (err) {
    console.error("[form-signature]", err);
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? `שליחת החתימה נכשלה: ${err.message}`
          : "שליחת החתימה נכשלה — נסו שוב",
    };
  }
}

async function invokeSignaturePublic<T>(
  body: Record<string, unknown>
): Promise<{
  ok: boolean;
  data?: T;
  error?: string;
  maskedEmail?: string;
}> {
  try {
    const response = await fetch("/api/signature/public", {
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

export function loadPublicSignatureRequest(token: string) {
  return invokeSignaturePublic<PublicSignatureRequest>({
    action: "get",
    token,
  });
}

export async function submitPublicSignature(
  token: string,
  signature: string,
  companionIdValue?: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await invokeSignaturePublic<never>({
    action: "submit",
    token,
    signature,
    ...(companionIdValue !== undefined
      ? { companionIdValue: companionIdValue.trim() }
      : {}),
  });
  return { ok: result.ok, error: result.error };
}

export async function requestFormSignatureOtp(token: string): Promise<{
  ok: boolean;
  error?: string;
  maskedEmail?: string;
}> {
  try {
    const response = await fetch("/api/signature/otp/request", {
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

export async function verifyFormSignatureOtp(
  token: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/signature/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, code }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (payload?.ok) return { ok: true };
    if (response.status === 429) return { ok: false, error: "RATE_LIMITED" };
    return { ok: false, error: payload?.error || "INVALID_CREDENTIALS" };
  } catch {
    return { ok: false, error: "OTP_UNAVAILABLE" };
  }
}

export async function requestArchiveSignedForm(
  formFillId: string
): Promise<{ archived: boolean; error?: string }> {
  try {
    const response = await fetch("/api/forms/archive-signed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ formFillId }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      archived?: boolean;
      error?: string;
      skipped?: string;
    } | null;
    if (payload?.ok && payload.archived) {
      return { archived: true };
    }
    if (!response.ok) {
      return {
        archived: false,
        error: payload?.error || `HTTP_${response.status}`,
      };
    }
    return {
      archived: false,
      error: payload?.error || payload?.skipped || undefined,
    };
  } catch (error) {
    return {
      archived: false,
      error: error instanceof Error ? error.message : "NETWORK",
    };
  }
}
