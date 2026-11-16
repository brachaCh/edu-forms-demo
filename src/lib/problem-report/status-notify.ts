import { buildReporterStatusEmail } from "./email";
import { sendProblemReportMail, type SendMailResult } from "./send-mail";
import {
  problemReportStatusLabel,
  type ProblemReportStatus,
} from "./status-label";
import { bugNumberFromTicketId } from "./ticket-id";
import { fetchGitiBugReporter } from "./tzavta";

export type StatusNotifyInput = {
  ticketId: string;
  status: ProblemReportStatus;
};

export type StatusNotifyResult =
  | { ok: true; ticketId: string; statusLabel: string }
  | { ok: false; status: number; error: string };

export type StatusNotifyDeps = {
  fetchReporter?: typeof fetchGitiBugReporter;
  sendMail?: typeof sendProblemReportMail;
};

export async function notifyProblemReportStatus(
  input: StatusNotifyInput,
  deps: StatusNotifyDeps = {}
): Promise<StatusNotifyResult> {
  const bugNumber = bugNumberFromTicketId(input.ticketId);
  if (bugNumber == null) {
    return { ok: false, status: 400, error: "VALIDATION_ERROR" };
  }

  const fetchReporter = deps.fetchReporter ?? fetchGitiBugReporter;
  const sendMail = deps.sendMail ?? sendProblemReportMail;
  const fetched = await fetchReporter(bugNumber);

  if (!fetched.ok) {
    if (fetched.reason === "not_found") {
      return { ok: false, status: 404, error: "הפנייה לא נמצאה" };
    }
    return {
      ok: false,
      status: 422,
      error: "לא ניתן לאתר את מייל המדווח בצוותא",
    };
  }

  const statusLabel = problemReportStatusLabel(input.status);
  const mail = buildReporterStatusEmail({
    ticketId: input.ticketId,
    statusLabel,
  });
  const sent: SendMailResult = await sendMail({
    to: [fetched.reporterEmail],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (!sent.sent) {
    return { ok: false, status: 502, error: "שליחת עדכון הסטטוס נכשלה" };
  }
  return { ok: true, ticketId: input.ticketId, statusLabel };
}
