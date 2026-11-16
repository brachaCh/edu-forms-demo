/** תוקף קישור הזמנת מורה — שנה */
export const TEACHER_INVITE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export type TeacherInviteErrorCode =
  | "NO_EMAIL"
  | "ALREADY_HAS_ACCOUNT"
  | "ALREADY_LINKED"
  | "NOT_STAFF_CARD"
  | "NOT_FOUND"
  | "EMAIL_SEND_FAILED"
  | "RATE_LIMITED"
  | "INVITE_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SERVER_UNAVAILABLE";

const INVITE_ERROR_MESSAGES: Record<TeacherInviteErrorCode, string> = {
  NO_EMAIL: "יש להוסיף כתובת מייל בכרטיס לפני שליחת הזמנה",
  ALREADY_HAS_ACCOUNT: "כבר קיים חשבון עם כתובת מייל זו במוסד",
  ALREADY_LINKED: "למורה כבר יש חשבון מקושר",
  NOT_STAFF_CARD: "ניתן לשלוח הזמנה רק מכרטיס איש צוות",
  NOT_FOUND: "לא נמצא",
  EMAIL_SEND_FAILED: "שליחת ההזמנה נכשלה — נסו שוב",
  RATE_LIMITED: "נשלחו יותר מדי הזמנות — נסו שוב בעוד מספר דקות",
  INVITE_UNAVAILABLE: "שליחת ההזמנה נכשלה — נסו שוב",
  UNAUTHORIZED: "יש להתחבר מחדש",
  FORBIDDEN: "רק רכזת השילוב של המוסד יכולה לשלוח הזמנות למורות",
  SERVER_UNAVAILABLE: "שליחת ההזמנה נכשלה — נסו שוב",
};

export function teacherInviteErrorMessage(
  code?: TeacherInviteErrorCode
): string {
  return INVITE_ERROR_MESSAGES[code ?? "INVITE_UNAVAILABLE"];
}

export async function sendTeacherInvite(
  studentId: string
): Promise<{ ok: boolean; message?: string; error?: TeacherInviteErrorCode }> {
  try {
    const response = await fetch(`/api/teachers/${encodeURIComponent(studentId)}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      error?: TeacherInviteErrorCode;
    };

    if (response.ok && payload.ok) {
      return { ok: true, message: payload.message };
    }

    return {
      ok: false,
      error: payload.error ?? "INVITE_UNAVAILABLE",
      message: payload.message,
    };
  } catch {
    return { ok: false, error: "INVITE_UNAVAILABLE" };
  }
}
