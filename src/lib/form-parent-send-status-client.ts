import type { StudentParentFormSendStatus } from "@/lib/form-parent-send-status";

export async function fetchStudentParentFormSendStatuses(
  formId: string,
  studentIds: string[]
): Promise<{ ok: boolean; statuses?: StudentParentFormSendStatus[]; error?: string }> {
  try {
    const response = await fetch("/api/fill/send-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ formId, studentIds }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      statuses?: StudentParentFormSendStatus[];
      error?: string;
    } | null;
    if (payload?.ok && payload.statuses) {
      return { ok: true, statuses: payload.statuses };
    }
  } catch (err) {
    console.error("[form-parent-send-status-client]", err);
  }
  return {
    ok: false,
    error: "לא ניתן לטעון סטטוס שליחה. בדקו חיבור לרשת והתחברות.",
  };
}

export type ParentFormBulkSendResponse = {
  ok: boolean;
  sent?: string[];
  skipped?: string[];
  failed?: Array<{ studentId: string; error: string }>;
  error?: string;
};

export async function runParentFormBulkSendClient(input: {
  formId: string;
  studentIds: string[];
  skipAlreadySent: boolean;
  skipAlreadyFilled: boolean;
  note?: string;
}): Promise<ParentFormBulkSendResponse> {
  try {
    const response = await fetch("/api/parent-forms/bulk-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as ParentFormBulkSendResponse | null;
    if (!payload) {
      return { ok: false, error: "שגיאת שרת" };
    }
    return payload;
  } catch (err) {
    console.error("[parent-form-bulk-send-client]", err);
    return { ok: false, error: "שגיאת רשת — בדקו חיבור לאינטרנט" };
  }
}
