import type { PaymentMethod, SubscriptionStatus } from "@/lib/supabase/types";

/** שדות שמספיקים לבחירת שם תצוגה בשורת מנוי */
export interface SubscriptionRowNameFields {
  institutionName?: string | null;
  schoolName?: string | null;
  userFullName?: string | null;
  institutionCode?: string | null;
}

export const FALLBACK_SUBSCRIPTION_NAME = "המוסד";

const REMOVE_CONFIRM_BODY =
  "החבילה והתשלום יימחקו מהרשומה. אפשר אחר כך לבחור חבילה מחדש ולהפעיל מנוי.";

/** אחרי «הסר מנוי» — מאפסים רק שדות חיוב, בלי למחוק את המוסד */
export const CLEARED_SUBSCRIPTION_FIELDS = {
  planId: null,
  planTitle: null,
  planCustomClasses: null,
  planCustomStudents: null,
  subscriptionStatus: "none" as const satisfies SubscriptionStatus,
  paymentMethod: null as PaymentMethod | null,
  paidAt: null,
  planExpiresAt: null,
};

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** שם לדיאלוג אישור — לא משאירים רווח כפול אחרי «של» כשחסר שם מוסד */
export function subscriptionRowDisplayName(
  row: SubscriptionRowNameFields
): string {
  return (
    firstNonEmpty(
      row.institutionName,
      row.schoolName,
      row.userFullName,
      row.institutionCode
    ) ?? FALLBACK_SUBSCRIPTION_NAME
  );
}

export function removeSubscriptionConfirmMessage(
  name: string | null | undefined
): string {
  const label = firstNonEmpty(name) ?? FALLBACK_SUBSCRIPTION_NAME;
  return `להסיר את המנוי של «${label}»?\n\n${REMOVE_CONFIRM_BODY}`;
}

export function subscriptionActionSuccessMessage(action: string): string {
  switch (action) {
    case "remove":
      return "המנוי הוסר. אפשר לבחור חבילה מחדש ולהפעיל מנוי.";
    case "cancel":
      return "המנוי בוטל.";
    case "activate_bank":
      return "המנוי הופעל בהעברה בנקאית.";
    case "update_plan":
      return "החבילה עודכנה.";
    case "extend_expiry":
      return "תוקף המנוי הוארך.";
    default:
      return "הפעולה הושלמה.";
  }
}

export function subscriptionActionErrorMessage(
  status: number,
  errorCode?: string | null
): string {
  if (status === 401) return "יש להתחבר מחדש כדי להמשיך.";
  if (status === 403) return "אין הרשאה לבצע פעולה זו.";
  if (status === 404) return "המוסד לא נמצא.";
  if (status === 503) return "השרת אינו זמין כרגע. נסו שוב.";
  if (errorCode === "PLAN_REQUIRED") return "יש לבחור חבילה לפני הפעולה.";
  if (errorCode === "PLAN_NOT_ALLOWED") return "החבילה אינה זמינה למוסד זה.";
  if (errorCode === "INVALID_CUSTOM_PLAN") return "פרטי החבילה האישית אינם תקינים.";
  if (errorCode === "INVALID_ID") return "לא ניתן לזהות את המוסד.";
  return "לא ניתן להשלים את הפעולה. נסו שוב.";
}

export function applyClearedSubscriptionFields<T>(
  row: T
): Omit<T, keyof typeof CLEARED_SUBSCRIPTION_FIELDS> &
  typeof CLEARED_SUBSCRIPTION_FIELDS {
  return { ...row, ...CLEARED_SUBSCRIPTION_FIELDS };
}

export async function readSubscriptionActionError(
  response: Response
): Promise<string> {
  let errorCode: string | null = null;
  try {
    const data = (await response.json()) as { error?: string };
    errorCode = data.error ?? null;
  } catch {
    errorCode = null;
  }
  return subscriptionActionErrorMessage(response.status, errorCode);
}
