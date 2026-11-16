import { isConfidentialityWaiverFormId } from "@/lib/confidentiality-waiver-gate";
import {
  isParentQuestionnaireForm,
  parentQuestionnaireLooksReturned,
} from "@/lib/parent-questionnaire-email";
import type { FormFillStatus } from "@/lib/supabase/types";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { isParentSignatureField } from "@/lib/form-fields";

export type ParentFormSendKind = "fill" | "signature";

export const PARENT_BULK_SEND_FORM_IDS = [
  "parent-questionnaire",
  "parent-questionnaire-tla",
  "moe-parent-questionnaire-alt",
  "waiver-confidentiality",
  "moe-school-website-photo-consent",
] as const;

export type ParentBulkSendFormId = (typeof PARENT_BULK_SEND_FORM_IDS)[number];

export function parentFormSendKind(formId: string): ParentFormSendKind | null {
  if (isParentQuestionnaireForm({ id: formId })) return "fill";
  if (
    isConfidentialityWaiverFormId(formId) ||
    formId === "moe-school-website-photo-consent"
  ) {
    return "signature";
  }
  return null;
}

export function isParentBulkSendFormId(
  formId: string
): formId is ParentBulkSendFormId {
  return (PARENT_BULK_SEND_FORM_IDS as readonly string[]).includes(formId);
}

export function requestCountsAsSent(status: string): boolean {
  return status !== "revoked";
}

export function computeLastSentAtIso(
  rows: Array<{ created_at: string; status: string }>
): string | null {
  let best: number | null = null;
  for (const row of rows) {
    if (!requestCountsAsSent(row.status)) continue;
    const ms = new Date(row.created_at).getTime();
    if (Number.isNaN(ms)) continue;
    if (best === null || ms > best) best = ms;
  }
  return best === null ? null : new Date(best).toISOString();
}

function waiverParentSlotsFilled(
  data: Record<string, string>,
  singleResponsibleParty: boolean
): boolean {
  const father = String(data.father_signature ?? "").trim();
  const mother = String(data.mother_signature ?? "").trim();
  if (singleResponsibleParty) return Boolean(father || mother);
  return Boolean(father && mother);
}

export function isParentFormFilled(input: {
  formId: string;
  fillStatus?: FormFillStatus | null;
  data?: Record<string, string> | null;
  singleResponsibleParty?: boolean | null;
}): boolean {
  const { formId, fillStatus, data, singleResponsibleParty } = input;
  if (isParentQuestionnaireForm({ id: formId })) {
    return (
      fillStatus === "completed" ||
      parentQuestionnaireLooksReturned(
        fillStatus ? [{ status: fillStatus, data: data ?? undefined }] : []
      )
    );
  }
  if (isConfidentialityWaiverFormId(formId)) {
    return waiverParentSlotsFilled(data ?? {}, Boolean(singleResponsibleParty));
  }
  const schema = getFormSchema(formId);
  if (!schema) return fillStatus === "completed";
  const parentSignatureKeys = listFormFields(schema)
    .filter(
      (field) => field.type === "signature" && isParentSignatureField(field.key)
    )
    .map((field) => field.key);
  if (parentSignatureKeys.length === 0) {
    return fillStatus === "completed";
  }
  const payload = data ?? {};
  return parentSignatureKeys.every((key) => String(payload[key] ?? "").trim());
}

export function formatHebrewDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatParentFormSendStatusLine(input: {
  lastSentAt: string | null;
  filled: boolean;
}): string {
  const sentPart = input.lastSentAt
    ? `נשלח: ${formatHebrewDateTime(input.lastSentAt)}`
    : "לא נשלח";
  const fillPart = input.filled ? "מולא" : "לא מולא";
  return `${sentPart} · ${fillPart}`;
}

export type StudentParentFormSendStatus = {
  studentId: string;
  formFillId: string | null;
  fillStatus: FormFillStatus | null;
  lastSentAt: string | null;
  filled: boolean;
};

export function shouldSkipBulkRecipient(
  status: Pick<StudentParentFormSendStatus, "lastSentAt" | "filled">,
  options: { skipAlreadySent: boolean; skipAlreadyFilled: boolean }
): boolean {
  if (options.skipAlreadyFilled && status.filled) return true;
  if (options.skipAlreadySent && status.lastSentAt) return true;
  return false;
}
