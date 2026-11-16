import { reportClientAudit } from "@/lib/client-audit";

export interface PublicFormFillRequest {
  formId: string;
  formTitle: string;
  studentName: string;
  data: Record<string, string>;
  expiresAt: string;
  status: "pending" | "submitted" | "expired" | "revoked";
}

async function invokeFillPublic<T>(
  body: Record<string, unknown>
): Promise<{
  ok: boolean;
  data?: T;
  error?: string;
  maskedEmail?: string;
}> {
  try {
    const response = await fetch("/api/fill/public", {
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

/**
 * יצירת קישור מילוי — דרך API מאומת (סשן צוות + בדיקת מוסד).
 * רישום ה-audit נעשה בשרת.
 */
export async function createFormFillRequest(input: {
  formFillId: string;
  formId: string;
  formTitle: string;
  studentName: string;
  recipientEmail: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string; sentTo?: string[] }> {
  try {
    const response = await fetch("/api/fill/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      sentTo?: string[];
    } | null;
    if (payload?.ok) {
      reportClientAudit({
        action: "form_fill.request",
        entityType: "form_fill",
        entityId: input.formFillId,
        summary: `נשלח למילוי: ${input.formTitle} — ${input.studentName}`,
        metadata: {
          form_id: input.formId,
          form_fill_id: input.formFillId,
          recipient: input.recipientEmail,
        },
      });
      return { ok: true, sentTo: payload.sentTo };
    }
    if (response.status === 401) {
      return { ok: false, error: "יש להתחבר מחדש כדי לשלוח למילוי" };
    }
    return {
      ok: false,
      error: payload?.error || "שליחת הטופס נכשלה — נסו שוב",
    };
  } catch (err) {
    console.error("[form-fill-request]", err);
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? `שליחת הטופס נכשלה: ${err.message}`
          : "שליחת הטופס נכשלה — נסו שוב",
    };
  }
}

export function loadPublicFormFill(token: string) {
  return invokeFillPublic<PublicFormFillRequest>({ action: "get", token });
}

export async function savePublicFormFill(
  token: string,
  data: Record<string, string>,
  complete: boolean
): Promise<{ ok: boolean; error?: string }> {
  const result = await invokeFillPublic<never>({
    action: "submit",
    token,
    data,
    complete,
  });
  return { ok: result.ok, error: result.error };
}

export async function requestFormFillOtp(token: string): Promise<{
  ok: boolean;
  error?: string;
  maskedEmail?: string;
}> {
  try {
    const response = await fetch("/api/fill/otp/request", {
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

export async function verifyFormFillOtp(
  token: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/fill/otp/verify", {
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
    return { ok: false, error: payload?.error || "INVALID_CREDENTIALS" };
  } catch {
    return { ok: false, error: "OTP_UNAVAILABLE" };
  }
}

export interface FormFillHistoryItem {
  id: string;
  recipientEmail: string;
  formTitle: string;
  studentName: string;
  status: "pending" | "submitted" | "expired" | "revoked";
  createdAt: string;
  submittedAt: string | null;
  expiresAt: string;
}

export async function loadFormFillHistory(
  formFillId: string
): Promise<{ ok: boolean; error?: string; history: FormFillHistoryItem[] }> {
  try {
    const params = new URLSearchParams({ formFillId });
    const response = await fetch(`/api/fill/history?${params}`, {
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      history?: FormFillHistoryItem[];
    } | null;
    if (!payload) {
      return { ok: false, error: "שגיאת שרת", history: [] };
    }
    if (payload.ok) {
      return { ok: true, history: payload.history ?? [] };
    }
    return { ok: false, error: payload.error || "שגיאת שרת", history: [] };
  } catch {
    return { ok: false, error: "שגיאת רשת", history: [] };
  }
}
