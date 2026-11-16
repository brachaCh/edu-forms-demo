/** Giti Feder's Tzavta project. Hardcoded in the Tzavta RPC as well. */
export const GITI_TZAVTA_PROJECT_ID = "p-mrhm9jwc-2";

export const TZAVTA_CREATE_RPC = "create_giti_bug_report";
export const TZAVTA_GET_REPORTER_RPC = "get_giti_bug_reporter";

export const PROBLEM_REPORT_DESCRIPTION_MAX = 4000;

/** Room for Tzavta `left('דיווח מפרוטוקל · ' || id || …, 4000)` heading wrapper. */
export const TZAVTA_REPORT_DESCRIPTION_MAX = 3800;
export const PROBLEM_REPORT_PATH_MAX = 300;
export const PROBLEM_REPORT_BROWSER_MAX = 300;

export const PROBLEM_REPORT_NOTIFY_EMAILS_ENV = "PROBLEM_REPORT_NOTIFY_EMAILS";

/** Max characters of the reporter's text echoed in the thank-you email. */
export const REPORTER_ACK_SUMMARY_MAX = 320;
