import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export type SendStaffMeetingParentResult = {
  ok: boolean;
  error?: string;
  sentTo?: string[];
};

export async function invokeSendStaffMeetingParent(payload: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  studentName?: string;
}): Promise<SendStaffMeetingParentResult> {
  return invokeEdgeFunction("send-staff-meeting-parent", {
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    studentName: payload.studentName,
  }) as Promise<SendStaffMeetingParentResult>;
}
