import type { BugScreenshotPayload, BugUrgency } from "./bugs/bugReport";

export type BugReportResult = {
  ok?: boolean;
  error?: string;
};

export async function invokeBugReport(payload: {
  urgency: BugUrgency;
  message: string;
  pageUrl: string;
  reporterEmail?: string;
  screenshots?: BugScreenshotPayload[];
  /** Honeypot — must stay empty */
  website?: string;
}): Promise<BugReportResult> {
  try {
    const response = await fetch("/api/bug-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urgency: payload.urgency,
        message: payload.message,
        pageUrl: payload.pageUrl,
        reporterEmail: payload.reporterEmail,
        screenshots: payload.screenshots ?? [],
        website: payload.website ?? "",
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | BugReportResult
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

    return { ok: true };
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
