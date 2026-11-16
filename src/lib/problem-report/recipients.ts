import { PROBLEM_REPORT_DEFAULT_NOTIFY_EMAILS } from "@/lib/email-recipients";
import { PROBLEM_REPORT_NOTIFY_EMAILS_ENV } from "./constants";

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

/**
 * Recipients of Giti's copy. Prefer PROBLEM_REPORT_NOTIFY_EMAILS when set;
 * otherwise the Protokal mailbox (not Giti's personal Gmail / PLATFORM_ADMIN_EMAILS).
 */
export function parseProblemReportNotifyEmails(
  env: Record<string, string | undefined> = process.env
): string[] {
  const dedicated = parseEmailList(env[PROBLEM_REPORT_NOTIFY_EMAILS_ENV]);
  if (dedicated.length > 0) return dedicated;
  return [...PROBLEM_REPORT_DEFAULT_NOTIFY_EMAILS];
}
