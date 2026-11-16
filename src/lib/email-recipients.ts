/** נמען טופס "צרו קשר" — חייב להתאים ל-supabase/functions/contact */
export const CONTACT_TO_EMAIL = "demo@example.com";

/** נמעני "צרו קשר" במסך «קטגוריה בהרצה» (גנים / תיכונים) */
export const COMING_SOON_CONTACT_TO_EMAILS = [
  "demo@example.com",
] as const;

/** נמען להרשמת מייל בכניסה חופשית — חייב להתאים ל-supabase/functions/contact */
export const FREE_ACCESS_SIGNUP_TO_EMAIL = "demo@example.com";

/** נמען לבקשת תשלום בהעברה בנקאית. המייל שהלקוח ממלא הוא רק reply-to */
export const BANK_TRANSFER_CONTACT_TO_EMAIL = "demo@example.com";

/** מייל לחזרה כשאין מייל מחובר — נשלח מאחורי הקלעים בלי שדה בטופס */
export const BUG_REPORT_FALLBACK_REPLY_TO = "demo@example.com";

/** נמען העתק דיווח על תקלה — ברירת מחדל כש-PROBLEM_REPORT_NOTIFY_EMAILS ריק */
export const PROBLEM_REPORT_OWNER_EMAIL = "demo@example.com";

/** נמענים קבועים לכל דיווח תקלה כשאין PROBLEM_REPORT_NOTIFY_EMAILS */
export const PROBLEM_REPORT_DEFAULT_NOTIFY_EMAILS = [
  PROBLEM_REPORT_OWNER_EMAIL,
  "demo@example.com",
] as const;

/** נמענות "תיבת ההשבחות" — חייב להתאים ל-supabase/functions/bug-report */
export const BUG_REPORT_RECIPIENTS = [
  "demo@example.com",
  "demo@example.com",
  "demo@example.com",
  "demo@example.com",
] as const;
