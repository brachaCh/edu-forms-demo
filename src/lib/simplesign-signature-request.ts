import { reportClientAudit } from "@/lib/client-audit";

export interface SimpleSignAssignment {
  email: string;
  fieldKey: string;
  signerName?: string;
}

export interface SimpleSignCreatedLink {
  fieldKey: string;
  signingUrl: string;
}

export interface SimpleSignSubmissionStatus {
  id: string;
  parentRole: string;
  signatureFieldKey: string;
  status: string;
  signingUrl: string | null;
  signerEmail: string;
  signerName: string;
  signedAt: string | null;
  createdAt: string;
  signedPdfStored?: boolean;
  signedPdfDocumentId?: string | null;
  errorMessage?: string | null;
}

/** כתובת לצפייה/הורדה של ה-PDF החתום שחזר מ-SimpleSign (דורש סשן צוות) */
export function simpleSignSignedPdfUrl(
  formFillId: string,
  options?: { download?: boolean }
): string {
  const params = new URLSearchParams({ formFillId });
  if (options?.download) params.set("download", "1");
  return `/api/simplesign/signed-pdf?${params}`;
}

async function parseResponse(res: Response): Promise<{
  ok: boolean;
  error?: string;
  count?: number;
  emailsSent?: number;
  warning?: string;
  createdLinks?: SimpleSignCreatedLink[];
  submissions?: SimpleSignSubmissionStatus[];
}> {
  const payload = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    count?: number;
    emailsSent?: number;
    warning?: string;
    submissions?: Array<SimpleSignSubmissionStatus | SimpleSignCreatedLink>;
    unmapped?: string[];
  } | null;
  if (!res.ok) {
    const base = payload?.error || `שגיאת שרת (${res.status})`;
    const unmapped = payload?.unmapped?.filter(Boolean) ?? [];
    const detail =
      unmapped.length > 0
        ? `${base} (${unmapped.slice(0, 6).join(", ")}${unmapped.length > 6 ? "…" : ""})`
        : base;
    return {
      ok: false,
      error: detail,
    };
  }
  const createdLinks = (payload?.submissions ?? [])
    .map((row) => {
      const fieldKey = "fieldKey" in row ? row.fieldKey : "";
      const signingUrl = "signingUrl" in row ? row.signingUrl : null;
      if (!fieldKey || !signingUrl) return null;
      return { fieldKey, signingUrl };
    })
    .filter((row): row is SimpleSignCreatedLink => row != null);
  return {
    ok: Boolean(payload?.ok),
    error: payload?.error,
    count: payload?.count,
    emailsSent: payload?.emailsSent,
    warning: payload?.warning,
    createdLinks,
    submissions: payload?.submissions as SimpleSignSubmissionStatus[] | undefined,
  };
}

export async function createSimpleSignSubmissions(input: {
  formFillId: string;
  assignments: SimpleSignAssignment[];
}): Promise<{
  ok: boolean;
  error?: string;
  count?: number;
  emailsSent?: number;
  warning?: string;
  createdLinks?: SimpleSignCreatedLink[];
}> {
  try {
    const res = await fetch("/api/simplesign/create-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await parseResponse(res);
    if (result.ok) {
      reportClientAudit({
        action: "simplesign.request",
        entityType: "form_fill",
        entityId: input.formFillId,
        summary: `נשלח ל-SimpleSign (${input.assignments.length} חתימות)`,
        metadata: {
          form_fill_id: input.formFillId,
          recipients: input.assignments.map((a) => a.email),
        },
      });
    }
    return {
      ok: result.ok,
      error: result.error,
      count: result.count ?? input.assignments.length,
      emailsSent: result.emailsSent,
      warning: result.warning,
      createdLinks: result.createdLinks,
    };
  } catch (err) {
    console.error("[simplesign-create]", err);
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? `שליחה ל-SimpleSign נכשלה: ${err.message}`
          : "שליחה ל-SimpleSign נכשלה — נסו שוב",
    };
  }
}

export async function loadSimpleSignSubmissions(
  formFillId: string
): Promise<{ ok: boolean; error?: string; submissions: SimpleSignSubmissionStatus[] }> {
  try {
    const params = new URLSearchParams({ formFillId });
    const res = await fetch(`/api/simplesign/submissions?${params}`);
    const result = await parseResponse(res);
    return {
      ok: result.ok,
      error: result.error,
      submissions: result.submissions ?? [],
    };
  } catch (err) {
    console.error("[simplesign-list]", err);
    return {
      ok: false,
      error: "טעינת סטטוס SimpleSign נכשלה",
      submissions: [],
    };
  }
}

export async function resendSimpleSignEmail(input: {
  formFillId: string;
  signatureFieldKey: string;
}): Promise<{ ok: boolean; error?: string; renewed?: boolean }> {
  try {
    const res = await fetch("/api/simplesign/resend-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      renewed?: boolean;
    } | null;
    if (!res.ok) {
      return { ok: false, error: payload?.error || `שגיאת שרת (${res.status})` };
    }
    return { ok: Boolean(payload?.ok), error: payload?.error, renewed: payload?.renewed };
  } catch (err) {
    console.error("[simplesign-resend-email]", err);
    return {
      ok: false,
      error: "שליחת מייל חוזרת נכשלה",
    };
  }
}
