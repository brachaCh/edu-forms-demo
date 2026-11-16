import { invokeEdgeFunction } from "./invokeEdgeFunction";

export type SendParentQuestionnaireResult = {
  ok?: boolean;
  error?: string;
  sentTo?: string[];
};

export async function invokeSendParentQuestionnaire(payload: {
  to: string[];
  formTitle: string;
  formId?: string;
  studentName: string;
  className?: string;
  intro?: string;
  teacherNote?: string;
  replyTo?: string;
  questions: Array<{ section?: string; label: string }>;
  /** Honeypot — must stay empty */
  website?: string;
}): Promise<SendParentQuestionnaireResult> {
  return invokeEdgeFunction("send-parent-questionnaire", {
    ...payload,
    website: payload.website ?? "",
  }) as Promise<SendParentQuestionnaireResult>;
}
