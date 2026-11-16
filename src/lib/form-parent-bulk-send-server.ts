import { buildFormSnapshotHtml } from "@/lib/form-snapshot";
import { buildFormInitialData } from "@/lib/form-sync";
import {
  parentFormSendKind,
  shouldSkipBulkRecipient,
  type StudentParentFormSendStatus,
} from "@/lib/form-parent-send-status";
import { fetchStudentParentFormSendStatuses } from "@/lib/form-parent-send-status-server";
import {
  resolveParentFacingOrigin,
  revokePendingFormFillRequestsForRecipients,
  sendFormFillLink,
} from "@/lib/form-fill-create-server";
import { sendSignatureRequests } from "@/lib/form-signature-create-server";
import { isParentSignatureField } from "@/lib/form-fields";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { formatStudentDisplayName } from "@/lib/person-name";
import {
  buildParentEmailMapping,
  parentRecipientEmails,
} from "@/lib/parent-email";
import type { SignatureAssignment } from "@/lib/form-signature-request";
import {
  buildSignerEmailRows,
  collectSignatureAssignments,
  prepareSignerEmailRowsForSend,
} from "@/lib/simplesign/signer-email-rows";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Student } from "@/lib/supabase/types";
import {
  tenantFetchStudentFormFills,
  tenantUpsertStudentFormFill,
  type MemberAccessContext,
} from "@/lib/server-tenant-data";
import { formFillStatusAfterParentSignatureSend } from "@/lib/form-fill-status";
import { formMayUseSimpleSign } from "@/lib/simplesign/config";
import { runSimpleSignCreateSubmissions } from "@/lib/simplesign/create-submissions-server";

export type ParentFormBulkSendResult = {
  sent: string[];
  skipped: string[];
  failed: Array<{ studentId: string; error: string }>;
};

export type ParentFormBulkSendRateLimit = {
  consumeEmailSlot: () => Promise<
    { ok: true } | { ok: false; error: string; status: number }
  >;
};

export async function runParentFormBulkSend(input: {
  institutionId: string;
  actorUserId: string;
  requesterEmail: string;
  formId: string;
  studentIds: string[];
  skipAlreadySent: boolean;
  skipAlreadyFilled: boolean;
  note?: string;
  ctx: MemberAccessContext;
  request?: Request;
  rateLimit?: ParentFormBulkSendRateLimit;
}): Promise<ParentFormBulkSendResult> {
  const kind = parentFormSendKind(input.formId);
  if (!kind) {
    return {
      sent: [],
      skipped: [],
      failed: input.studentIds.map((studentId) => ({
        studentId,
        error: "סוג הטופס אינו נתמך לשליחה גורפת",
      })),
    };
  }

  const schema = getFormSchema(input.formId);
  if (!schema) {
    return {
      sent: [],
      skipped: [],
      failed: input.studentIds.map((studentId) => ({
        studentId,
        error: "סכמת הטופס לא נמצאה",
      })),
    };
  }

  const supabase = createServiceClient();
  const origin = resolveParentFacingOrigin(input.request);
  const formTitle = schema.title.trim();
  const studentsById = new Map<string, Student>();

  const { data: studentRows, error: studentsError } = await supabase
    .from("students")
    .select("*")
    .eq("institution_id", input.institutionId)
    .in("id", input.studentIds);
  if (studentsError) {
    return {
      sent: [],
      skipped: [],
      failed: input.studentIds.map((studentId) => ({
        studentId,
        error: studentsError.message,
      })),
    };
  }
  for (const row of studentRows ?? []) {
    studentsById.set(row.id, row as Student);
  }

  const consumeEmailSlot = async () => {
    if (!input.rateLimit) return { ok: true as const };
    return input.rateLimit.consumeEmailSlot();
  };

  const eligibleIds = input.studentIds.filter((id) => studentsById.has(id));
  const statuses = await fetchStudentParentFormSendStatuses({
    supabase,
    formId: input.formId,
    studentIds: eligibleIds,
    studentsById,
  });
  const statusByStudent = new Map<string, StudentParentFormSendStatus>(
    statuses.map((row) => [row.studentId, row])
  );

  const result: ParentFormBulkSendResult = { sent: [], skipped: [], failed: [] };

  for (const studentId of input.studentIds) {
    const student = studentsById.get(studentId);
    if (!student) {
      result.failed.push({ studentId, error: "התלמידה לא נמצאה או שאין הרשאה" });
      continue;
    }

    const sendStatus = statusByStudent.get(studentId) ?? {
      studentId,
      formFillId: null,
      fillStatus: null,
      lastSentAt: null,
      filled: false,
    };

    if (
      shouldSkipBulkRecipient(sendStatus, {
        skipAlreadySent: input.skipAlreadySent,
        skipAlreadyFilled: input.skipAlreadyFilled,
      })
    ) {
      result.skipped.push(studentId);
      continue;
    }

    try {
      const allFills = await tenantFetchStudentFormFills(
        input.institutionId,
        studentId,
        input.ctx
      );
      let fill = allFills.find((row) => row.form_id === input.formId);
      const initialData = buildFormInitialData(
        schema,
        student,
        fill?.data ?? null,
        allFills
      );

      fill = await tenantUpsertStudentFormFill(
        input.institutionId,
        {
          id: fill?.id,
          student_id: studentId,
          form_id: input.formId,
          data: initialData,
          status:
            kind === "signature"
              ? formFillStatusAfterParentSignatureSend(fill?.status)
              : fill?.status ?? "draft",
        },
        input.ctx
      );

      const studentName = formatStudentDisplayName(student.full_name);

      if (kind === "fill") {
        const emails = parentRecipientEmails(student);
        if (emails.length === 0) {
          result.failed.push({
            studentId,
            error: "חסר מייל הורים בכרטיס",
          });
          continue;
        }
        let anyFailed = false;
        const succeededEmails: string[] = [];
        for (const email of emails) {
          const limited = await consumeEmailSlot();
          if (!limited.ok) {
            anyFailed = true;
            result.failed.push({ studentId, error: limited.error });
            break;
          }
          const send = await sendFormFillLink({
            supabase,
            origin,
            formFillId: fill.id,
            formId: input.formId,
            formTitle,
            studentName,
            recipientEmail: email,
            note: input.note,
          });
          if (!send.ok) {
            anyFailed = true;
            result.failed.push({
              studentId,
              error: send.error,
            });
            break;
          }
          succeededEmails.push(email);
        }
        if (anyFailed) {
          await revokePendingFormFillRequestsForRecipients(
            supabase,
            fill.id,
            succeededEmails
          );
        } else {
          result.sent.push(studentId);
        }
        continue;
      }

      const signatureFields = listFormFields(schema).filter(
        (field) => field.type === "signature"
      );
      const parentKeys = signatureFields
        .map((field) => field.key)
        .filter((key) => isParentSignatureField(key));
      if (parentKeys.length === 0) {
        result.failed.push({
          studentId,
          error: "לא נמצאו שדות חתימת הורים בטופס",
        });
        continue;
      }

      const { parentEmailByFieldKey, parentEmailsFallback } =
        buildParentEmailMapping(student);
      const prepared = prepareSignerEmailRowsForSend(
        buildSignerEmailRows({
          signatureKeys: parentKeys,
          parentEmails: parentEmailsFallback,
          parentEmailByFieldKey,
        }),
        {
          formId: input.formId,
          singleResponsibleParty: student.single_responsible_party,
        }
      );
      const dialogRows = prepared.map((row) => ({
        ...row,
        fieldLabel:
          signatureFields.find((field) => field.key === row.fieldKey)?.label ??
          row.fieldKey,
      }));
      const collected = collectSignatureAssignments(dialogRows);
      if (!collected.ok) {
        result.failed.push({ studentId, error: collected.error });
        continue;
      }
      const assignments: SignatureAssignment[] = collected.assignments;
      if (assignments.length === 0) {
        result.failed.push({
          studentId,
          error: "חסר מייל הורים לחתימה",
        });
        continue;
      }

      if (formMayUseSimpleSign(input.formId)) {
        let rateLimited = false;
        for (const _assignment of assignments) {
          const limited = await consumeEmailSlot();
          if (!limited.ok) {
            result.failed.push({ studentId, error: limited.error });
            rateLimited = true;
            break;
          }
        }
        if (rateLimited) continue;

        const send = await runSimpleSignCreateSubmissions({
          institutionId: input.institutionId,
          actorUserId: input.actorUserId,
          requesterEmail: input.requesterEmail,
          formFillId: fill.id,
          assignments: assignments.map((row) => ({
            fieldKey: row.fieldKey,
            email: row.email,
          })),
        });
        if (!send.ok) {
          result.failed.push({ studentId, error: send.error });
          continue;
        }
        result.sent.push(studentId);
        continue;
      }

      const snapshotHtml = buildFormSnapshotHtml(
        schema,
        fill.data ?? initialData,
        studentName,
        undefined
      );

      let signatureRateLimited = false;
      for (const _assignment of assignments) {
        const limited = await consumeEmailSlot();
        if (!limited.ok) {
          result.failed.push({ studentId, error: limited.error });
          signatureRateLimited = true;
          break;
        }
      }
      if (signatureRateLimited) continue;

      const send = await sendSignatureRequests({
        supabase,
        origin,
        formFillId: fill.id,
        formTitle,
        studentName,
        snapshotHtml,
        assignments,
      });
      if (!send.ok) {
        result.failed.push({ studentId, error: send.error });
        continue;
      }
      result.sent.push(studentId);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "שגיאה בשליחה";
      result.failed.push({ studentId, error: message });
    }
  }

  return result;
}
