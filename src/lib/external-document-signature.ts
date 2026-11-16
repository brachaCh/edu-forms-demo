export interface ExternalDocumentSignatureRequest {
  id: string;
  documentId: string;
  documentName: string;
  recipientEmail: string;
  signerLabel: string;
  status: "pending" | "signed" | "expired" | "revoked";
  createdAt: string;
  signedAt: string | null;
  expiresAt: string;
}

export async function createExternalDocumentSignature(input: {
  studentId: string;
  documentId: string;
  documentName: string;
  recipientEmail: string;
  signerLabel: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/external-signature/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (payload?.ok) {
      return { ok: true };
    }
    if (response.status === 401) {
      return { ok: false, error: "יש להתחבר מחדש כדי לשלוח לחתימה" };
    }
    return {
      ok: false,
      error: payload?.error || "שליחת המסמך לחתימה נכשלה — נסו שוב",
    };
  } catch (err) {
    console.error("[external-signature-create]", err);
    return {
      ok: false,
      error: "שליחת המסמך לחתימה נכשלה — נסו שוב",
    };
  }
}

export async function loadExternalDocumentSignatures(
  studentId: string
): Promise<{
  ok: boolean;
  error?: string;
  requests: ExternalDocumentSignatureRequest[];
}> {
  try {
    const params = new URLSearchParams({ studentId });
    const response = await fetch(`/api/external-signature/list?${params}`, {
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      requests?: ExternalDocumentSignatureRequest[];
    } | null;
    if (!payload) {
      return { ok: false, error: "שגיאת שרת", requests: [] };
    }
    if (payload.ok) {
      return { ok: true, requests: payload.requests ?? [] };
    }
    return { ok: false, error: payload.error || "שגיאת שרת", requests: [] };
  } catch {
    return { ok: false, error: "שגיאת רשת", requests: [] };
  }
}

export async function resendExternalDocumentSignature(
  requestId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/external-signature/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ requestId }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (payload?.ok) {
      return { ok: true };
    }
    return {
      ok: false,
      error: payload?.error || "שליחת תזכורת נכשלה",
    };
  } catch {
    return { ok: false, error: "שגיאת רשת" };
  }
}
