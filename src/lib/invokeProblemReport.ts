export type AttachmentPayload = {
  kind: "screenshot" | "techlog";
  data: string;
  mime: string;
};

export type ProblemReportResult = {
  ok?: boolean;
  ticketId?: string;
  bugId?: string;
  recordingGrant?: string;
  attachmentWarnings?: string[];
  error?: string;
};

export async function invokeProblemReport(payload: {
  description: string;
  pagePath?: string;
  browser?: string;
  /** Honeypot — must stay empty */
  website?: string;
  recordingMime?: "video/webm" | "video/mp4";
  attachments?: AttachmentPayload[];
}): Promise<ProblemReportResult> {
  try {
    const response = await fetch("/api/problem-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: payload.description,
        pagePath: payload.pagePath ?? "",
        browser: payload.browser ?? "",
        website: payload.website ?? "",
        recordingMime: payload.recordingMime,
        attachments: payload.attachments ?? [],
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | ProblemReportResult
      | null;

    if (!response.ok) {
      return {
        ok: false,
        error:
          data?.error ||
          (response.status === 429
            ? "נשלחו יותר מדי הודעות. נסו שוב בעוד כמה דקות."
            : "שליחת הדיווח נכשלה"),
      };
    }

    if (data?.error && !data.ok) {
      return { ok: false, error: data.error };
    }

    return {
      ok: true,
      ticketId: data?.ticketId,
      bugId: data?.bugId,
      recordingGrant: data?.recordingGrant,
      attachmentWarnings: data?.attachmentWarnings,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? `שליחה נכשלה: ${err.message}`
          : "שליחה נכשלה — נסו שוב",
    };
  }
}

export type SignedUploadUrlResult = {
  ok: boolean;
  signedUrl?: string;
  storagePath?: string;
  uploadTicket?: string;
  error?: string;
};

export async function requestRecordingUploadUrl(
  recordingGrant: string
): Promise<SignedUploadUrlResult> {
  try {
    const response = await fetch("/api/problem-report/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingGrant }),
    });

    const data = (await response.json().catch(() => null)) as SignedUploadUrlResult | null;

    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? "לא ניתן ליצור קישור העלאה" };
    }

    return {
      ok: true,
      signedUrl: data.signedUrl,
      storagePath: data.storagePath,
      uploadTicket: data.uploadTicket,
    };
  } catch {
    return { ok: false, error: "בקשת קישור העלאה נכשלה" };
  }
}

export async function confirmRecordingUpload(
  uploadTicket: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/problem-report/confirm-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "recording", uploadTicket }),
    });

    const data = (await response.json().catch(() => null)) as { ok: boolean; error?: string } | null;

    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? "אישור העלאה נכשל" };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "אישור העלאה נכשל" };
  }
}
