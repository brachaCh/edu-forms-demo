import {
  consumeEmailRateLimit,
  openEmailRateLimitQuery,
  type RateLimitQuery,
} from "@/lib/email-rate-limit";
import { parseProblemReportNotifyEmails } from "./recipients";
import {
  buildOwnerAckEmail,
  buildReporterAckEmail,
} from "./email";
import { sendProblemReportMail, type SendMailResult } from "./send-mail";
import {
  isForbiddenReportPath,
  normalizeReportPath,
  redactPagePath,
  sanitizeBrowser,
  sanitizePagePath,
} from "./sanitize";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import {
  buildReporterContactsDescription,
  buildTzavtaReportDescription,
} from "./report-body";
import { createTzavtaBug, type CreateTzavtaBugResult } from "./tzavta";
import { normalizeSessionEmail } from "./session-email";

export type ProblemReportSubmitInput = {
  reporterEmail: string;
  description: string;
  pagePath?: string;
  browser?: string;
  website?: string;
  userId: string;
  reporterName?: string | null;
  institutionName?: string | null;
  institutionCode?: string | null;
};

export type ProblemReportSubmitResult =
  | { ok: true; ticketId: string; bugId: string | null }
  | { ok: true; ignored: true }
  | {
      ok: false;
      status: number;
      error: string;
      retryAfterSec?: number;
    };

export type ProblemReportSubmitDeps = {
  rateLimitQuery?: RateLimitQuery | null;
  createBug?: typeof createTzavtaBug;
  sendMail?: typeof sendProblemReportMail;
  notifyEmails?: string[];
};

const RATE_UNAVAILABLE =
  "שליחת הדיווח אינה זמינה כרגע. נסו שוב מאוחר יותר.";
const RATE_LIMITED = "נשלחו יותר מדי הודעות. נסו שוב בעוד כמה דקות.";
const CREATE_FAILED = "פתיחת הפנייה נכשלה. נסו שוב מאוחר יותר.";
const NOT_CONFIGURED = "דיווח על תקלה אינו מוגדר בשרת.";
const FORBIDDEN_PATH = "לא ניתן לדווח מתצוגת טופס ציבורי.";
const EMPTY_DESCRIPTION = "נא לתאר את התקלה.";

export function problemReportRateLimitBucket(userId: string): string {
  return `problem-report:${userId}`;
}

export async function submitProblemReport(
  input: ProblemReportSubmitInput,
  deps: ProblemReportSubmitDeps = {}
): Promise<ProblemReportSubmitResult> {
  const description = input.description?.trim() ?? "";
  if (!description) {
    return { ok: false, status: 400, error: EMPTY_DESCRIPTION };
  }

  const website = input.website?.trim() ?? "";
  if (website) {
    return { ok: true, ignored: true };
  }

  const rawPath = sanitizePagePath(input.pagePath);
  const normalizedPath = rawPath ? normalizeReportPath(rawPath) : null;
  if (normalizedPath && isForbiddenReportPath(normalizedPath)) {
    return { ok: false, status: 400, error: FORBIDDEN_PATH };
  }

  const query =
    deps.rateLimitQuery !== undefined
      ? deps.rateLimitQuery
      : openEmailRateLimitQuery();
  const rate = await consumeEmailRateLimit(
    query,
    problemReportRateLimitBucket(input.userId)
  );
  if (!rate.ok && rate.reason === "limited") {
    return {
      ok: false,
      status: 429,
      error: RATE_LIMITED,
      retryAfterSec: rate.retryAfterSec,
    };
  }
  if (!rate.ok) {
    return { ok: false, status: 503, error: RATE_UNAVAILABLE };
  }

  const pagePath = normalizedPath ? redactPagePath(normalizedPath) : null;
  const browser = sanitizeBrowser(input.browser);
  const reporterCtx = {
    reporterEmail: input.reporterEmail,
    reporterName: input.reporterName,
    institutionName: input.institutionName,
    institutionCode: input.institutionCode,
  };
  const tzavtaDescription = buildTzavtaReportDescription(description, reporterCtx);
  const contactsDescription = buildReporterContactsDescription(
    description,
    reporterCtx
  );
  const createBug = deps.createBug ?? createTzavtaBug;
  const created: CreateTzavtaBugResult = await createBug({
    description: tzavtaDescription,
    contactsDescription,
    reporterEmail: input.reporterEmail,
    pagePath,
    browser,
  });

  if (!created.ok) {
    if (created.reason === "not_configured") {
      return { ok: false, status: 503, error: NOT_CONFIGURED };
    }
    return { ok: false, status: 502, error: CREATE_FAILED };
  }

  const ticketId = created.ticketId;
  const sendMail = deps.sendMail ?? sendProblemReportMail;
  const notifyEmails = deps.notifyEmails ?? parseProblemReportNotifyEmails();

  const reporterMail = buildReporterAckEmail({ ticketId, description });
  const reporterEmail = normalizeSessionEmail(input.reporterEmail);
  const ownerMail = buildOwnerAckEmail({
    ticketId,
    reporterEmail: input.reporterEmail,
    reporterName: input.reporterName,
    institutionName: input.institutionName,
    institutionCode: input.institutionCode,
    description,
    pagePath,
    browser,
  });

  let reporterSend: Promise<SendMailResult> | null = null;
  if (reporterEmail && !isPlatformAdminEmail(reporterEmail)) {
    reporterSend = sendMail({
      to: [reporterEmail],
      subject: reporterMail.subject,
      html: reporterMail.html,
      text: reporterMail.text,
    });
  }
  let ownerSend: Promise<SendMailResult> | null = null;
  if (notifyEmails.length > 0) {
    ownerSend = sendMail({
      to: notifyEmails,
      subject: ownerMail.subject,
      html: ownerMail.html,
      text: ownerMail.text,
      replyTo: input.reporterEmail,
    });
  } else {
    console.warn(
      "[problem-report] no PROBLEM_REPORT_NOTIFY_EMAILS / PROBLEM_REPORT_OWNER_EMAIL"
    );
  }

  const [reporterResult, ownerResult] = await Promise.all([
    reporterSend,
    ownerSend,
  ]);
  const attempted: SendMailResult[] = [];
  if (reporterResult) attempted.push(reporterResult);
  if (ownerResult) attempted.push(ownerResult);

  if (
    reporterResult &&
    !reporterResult.sent &&
    ownerResult?.sent === true
  ) {
    console.error(
      "[problem-report] reporter thank-you email failed after ticket",
      ticketId
    );
  }
  if (attempted.length > 0 && !attempted.some((r) => r.sent)) {
    console.error("[problem-report] emails failed after ticket", ticketId);
  }

  return { ok: true, ticketId, bugId: created.bugId };
}
