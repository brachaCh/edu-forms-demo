import { insertAuditLog } from "@/lib/audit-log";
import { resolveSignatureRequestLabel } from "@/lib/form-fields";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import {
  createMultiSignerSubmission,
  createSimpleSignSubmission,
  getDocumentInputs,
  isMultiSignerDocument,
  SimpleSignApiError,
} from "@/lib/simplesign/client";
import {
  findSignerByFieldKey,
  getSimpleSignDocumentTokenForStudent,
  getSimpleSignFormConfig,
  resolveSignerSlot,
  sortSimpleSignAssignments,
  validateStaffSignaturesBeforeSimpleSign,
} from "@/lib/simplesign/config";
import { hasFilledSignatureValue } from "@/lib/simplesign/constants";
import {
  getSingleParentWaiverTemplateError,
  resolveSimpleSignSignerPlan,
  shouldUseSingleSignerSimpleSign,
} from "@/lib/simplesign/signer-plan";
import {
  buildMatoahPrefillValues,
  buildSimpleSignPrefillBySignerSlot,
  buildSimpleSignPrefillForDocument,
  listUnmappedMatoahPrefillKeys,
  parseSimpleSignDocumentInputs,
  splitSimpleSignPrefillBySigner,
} from "@/lib/simplesign/prefill";
import {
  insertSimpleSignSubmission,
  listSimpleSignSubmissions,
  loadFormFillForSigning,
  loadInstitutionDisplayName,
  loadStudentForInstitution,
} from "@/lib/simplesign/server-store";
import {
  resolveSchoolYearLabel,
  sendSimpleSignSigningEmail,
} from "@/lib/simplesign/signing-email";
import type { Student } from "@/lib/supabase/types";
import { normalizeEmail } from "@/lib/normalize-email";
import { simpleSignEmailSendWarning } from "@/lib/simplesign/email-send-warning";
export type SimpleSignCreateSubmissionsInput = {
  institutionId: string;
  actorUserId: string;
  requesterEmail: string;
  formFillId: string;
  assignments: Array<{
    fieldKey: string;
    email: string;
    signerName?: string;
  }>;
};

export type SimpleSignCreateSubmissionsResult =
  | { ok: true; count: number; emailsSent: number; warning?: string }
  | { ok: false; error: string; status: number };

export async function runSimpleSignCreateSubmissions(
  input: SimpleSignCreateSubmissionsInput
): Promise<SimpleSignCreateSubmissionsResult> {
  const formFillId = input.formFillId;
  const assignments = input.assignments.map((assignment) => ({
    ...assignment,
    email: normalizeEmail(assignment.email),
  }));

  try {
    const fill = await loadFormFillForSigning(formFillId);
    if (!fill) {
      return { ok: false, error: "טיוטת הטופס לא נמצאה", status: 404 };
    }

    const student = await loadStudentForInstitution(fill.student_id);
    if (!student || student.institution_id !== input.institutionId) {
      return { ok: false, error: "אין הרשאה לטופס זה", status: 403 };
    }


    const config = getSimpleSignFormConfig(fill.form_id);
    if (!config) {
      return { ok: false, error: "טופס זה אינו מוגדר ל-SimpleSign", status: 400 };
    }

    const singleResponsibleParty = (student as Student).single_responsible_party;
    const missingSingleParentTemplate = getSingleParentWaiverTemplateError({
      formId: fill.form_id,
      singleResponsibleParty,
    });
    if (missingSingleParentTemplate) {
      return { ok: false, error: missingSingleParentTemplate, status: 400 };
    }

    const documentToken = getSimpleSignDocumentTokenForStudent(
      fill.form_id,
      singleResponsibleParty
    );
    if (!documentToken) {
      return {
        ok: false,
        error: "חסר document_token לטופס — הגדירו משתני SIMPLESIGN_DOC_*",
        status: 503,
      };
    }

    const schema = getFormSchema(fill.form_id);
    if (!schema) {
      return { ok: false, error: "סכמת הטופס לא נמצאה", status: 400 };
    }

    const staffError = validateStaffSignaturesBeforeSimpleSign(
      config,
      schema,
      fill.data
    );
    if (staffError) {
      return { ok: false, error: staffError, status: 400 };
    }

    const pairKeys = assignments.map((a) => `${a.fieldKey}\0${a.email}`);
    if (new Set(pairKeys).size !== pairKeys.length) {
      return { ok: false, error: "אותה כתובת כבר משויכת לאותו שדה חתימה", status: 400 };
    }

    const existing = await listSimpleSignSubmissions(formFillId);
    const studentRecord = student as Student;

    const signatureLabelByKey = new Map(
      listFormFields(schema).map((field) => {
        const sectionTitle =
          schema.sections.find((section) =>
            section.fields.some((item) => item.key === field.key)
          )?.title ?? null;
        return [
          field.key,
          resolveSignatureRequestLabel(field, sectionTitle),
        ] as const;
      })
    );

    for (const assignment of assignments) {
      const signer = findSignerByFieldKey(config, assignment.fieldKey);
      if (!signer) {
        return { ok: false, error: `שדה חתימה לא מוגדר: ${assignment.fieldKey}`, status: 400 };
      }
      if (hasFilledSignatureValue(fill.data[assignment.fieldKey])) {
        const label =
          signatureLabelByKey.get(assignment.fieldKey) ?? assignment.fieldKey;
        return { ok: false, error: `${label} כבר חתום — אין צורך לשלוח שוב`, status: 409 };
      }
      const pending = existing.find(
        (row) =>
          row.signature_field_key === assignment.fieldKey &&
          row.status === "pending"
      );
      if (pending) {
        const label =
          signatureLabelByKey.get(assignment.fieldKey) ?? assignment.fieldKey;
        return {
          ok: false,
          error: `${label} כבר נשלח וממתין לחתימה. השתמשי ב«קישור חתימה» למטה או «שליחת מייל חוזרת».`,
          status: 409,
        };
      }
      const expiredOrRenewing = existing.find(
        (row) =>
          row.signature_field_key === assignment.fieldKey &&
          (row.status === "expired" || row.status === "renewing")
      );
      if (expiredOrRenewing) {
        const label =
          signatureLabelByKey.get(assignment.fieldKey) ?? assignment.fieldKey;
        return {
          ok: false,
          error: `${label} — הקישור פג. לחצי על «הקישור פג – שליחת קישור חדש» לחידוש.`,
          status: 409,
        };
      }
    }

    const documentPayload = await getDocumentInputs(documentToken);
    const documentIsMultiSigner = isMultiSignerDocument(documentPayload);
    const incompatibleSingleParentTemplate = getSingleParentWaiverTemplateError({
      formId: fill.form_id,
      singleResponsibleParty,
      documentIsMultiSigner,
    });
    if (incompatibleSingleParentTemplate) {
      return { ok: false, error: incompatibleSingleParentTemplate, status: 400 };
    }

    const documentInputs = parseSimpleSignDocumentInputs(documentPayload);
    if (documentPayload.ready === false) {
      return {
        ok: false,
        error:
          "תבנית SimpleSign עדיין לא מוכנה — סיימי לסמן שדות (כולל חתימות) ושמרי את המסמך ב-SimpleSign, ואז נסי שוב.",
        status: 409,
      };
    }
    if (documentInputs.length === 0) {
      return {
        ok: false,
        error: "תבנית SimpleSign ללא שדות מסומנים — סמני שדות ונסי שוב",
        status: 409,
      };
    }

    const schoolYearLabel = resolveSchoolYearLabel(
      fill.data,
      student.calendar_year
    );
    const matoahPrefill = buildMatoahPrefillValues(schema, fill.data);
    const prefill = buildSimpleSignPrefillForDocument(
      schema,
      fill.data,
      documentInputs,
      schoolYearLabel
    );
    const unmapped = listUnmappedMatoahPrefillKeys(matoahPrefill, documentInputs);
    if (Object.keys(matoahPrefill).length > 0 && Object.keys(prefill).length === 0) {
      const sample = unmapped.slice(0, 8).join(", ");
      const more =
        unmapped.length > 8 ? ` (+${unmapped.length - 8} נוספים)` : "";
      return {
        ok: false,
        error:
          `לא נמצא מיפוי שדות ל-SimpleSign עבור «${schema.title}». ` +
          "ודאי שבתבנית ב-SimpleSign «מפתח ל-API» של כל שדה זהה למפתח מתוה (התווית בעברית חופשית). " +
          (sample ? `שדות ללא התאמה: ${sample}${more}` : ""),
        status: 422,
      };
    }

    // TZ-30: one parent → SimpleSign single-signer API (one email, one sign)
    const useSingleSigner = shouldUseSingleSignerSimpleSign({
      formId: fill.form_id,
      singleResponsibleParty,
      documentIsMultiSigner,
    });
    const multiSigner = documentIsMultiSigner && !useSingleSigner;

    const parentSignerKeys = config.parentSigners.map(
      (signer) => signer.signatureFieldKey
    );
    const signerPlan = resolveSimpleSignSignerPlan({
      formId: fill.form_id,
      singleResponsibleParty,
      parentSignerKeys,
      assignments,
    });
    if (!signerPlan.ok) {
      return { ok: false, error: signerPlan.error, status: 400 };
    }
    const extraAssignments = signerPlan.extras;
    const effectivePrimary = signerPlan.primary;
    const orderedAssignments = sortSimpleSignAssignments(config, effectivePrimary);

    const created: Array<{ fieldKey: string; signingUrl: string }> = [];
    let emailsSent = 0;
    const studentLabel = String(studentRecord.full_name ?? "").trim();
    const institutionName =
      (await loadInstitutionDisplayName(input.institutionId)) ?? "";

    if (multiSigner) {
      const { shared, bySigner } = splitSimpleSignPrefillBySigner(
        buildSimpleSignPrefillBySignerSlot(
          schema,
          fill.data,
          documentInputs,
          schoolYearLabel
        )
      );

      const apiResult = await createMultiSignerSubmission({
        documentToken,
        lockPrefill: true,
        sendEmail: false,
        prefill: shared,
        signers: orderedAssignments.map((assignment) => {
          const signer = findSignerByFieldKey(config, assignment.fieldKey)!;
          const slot = resolveSignerSlot(config, signer);
          const signerName =
            assignment.signerName?.trim() ||
            signer.defaultSignerName(studentRecord, fill.data);
          return {
            slot,
            signerName,
            signerEmail: assignment.email,
            prefill: bySigner[slot] ?? {},
          };
        }),
      });

      for (const assignment of orderedAssignments) {
        const signer = findSignerByFieldKey(config, assignment.fieldKey)!;
        const slot = resolveSignerSlot(config, signer);
        const apiSigner = apiResult.signers.find((row) => row.slot === slot);
        if (!apiSigner) {
          throw new SimpleSignApiError(
            `SimpleSign לא החזיר קישור לחותם ${slot}`,
            502
          );
        }

        const signerName =
          assignment.signerName?.trim() ||
          signer.defaultSignerName(studentRecord, fill.data);

        await insertSimpleSignSubmission({
          formFillId,
          formId: fill.form_id,
          studentId: fill.student_id,
          institutionId: student.institution_id,
          parentRole: signer.role,
          signatureFieldKey: assignment.fieldKey,
          submissionToken: apiResult.submissionToken,
          documentToken,
          signingUrl: apiSigner.signingUrl,
          signerEmail: assignment.email,
          signerName,
          signerSlot: slot,
          requestedByUserId: input.actorUserId,
          requesterEmail: input.requesterEmail,
        });

        created.push({
          fieldKey: assignment.fieldKey,
          signingUrl: apiSigner.signingUrl,
        });

        const mail = await sendSimpleSignSigningEmail({
          to: assignment.email,
          signerName,
          formTitle: schema.title,
          studentName: studentLabel,
          institutionName,
          schoolYearLabel,
          fieldLabel:
            signatureLabelByKey.get(assignment.fieldKey) ?? assignment.fieldKey,
          signingUrl: apiSigner.signingUrl,
        });
        if (mail.sent) emailsSent += 1;
        else if (mail.detail) {
          console.warn(
            `[simplesign/create-submissions] email not sent for ${assignment.fieldKey}:`,
            mail.detail
          );
        }
      }
    } else {
      for (const assignment of orderedAssignments) {
        const signer = findSignerByFieldKey(config, assignment.fieldKey)!;
        const signerName =
          assignment.signerName?.trim() ||
          signer.defaultSignerName(studentRecord, fill.data);

        const apiResult = await createSimpleSignSubmission({
          documentToken,
          signerName,
          signerEmail: assignment.email,
          prefill,
          lockPrefill: true,
        });

        await insertSimpleSignSubmission({
          formFillId,
          formId: fill.form_id,
          studentId: fill.student_id,
          institutionId: student.institution_id,
          parentRole: signer.role,
          signatureFieldKey: assignment.fieldKey,
          submissionToken: apiResult.submissionToken,
          documentToken,
          signingUrl: apiResult.signingUrl,
          signerEmail: assignment.email,
          signerName,
          requestedByUserId: input.actorUserId,
          requesterEmail: input.requesterEmail,
        });

        created.push({
          fieldKey: assignment.fieldKey,
          signingUrl: apiResult.signingUrl,
        });

        const mail = await sendSimpleSignSigningEmail({
          to: assignment.email,
          signerName,
          formTitle: schema.title,
          studentName: studentLabel,
          institutionName,
          schoolYearLabel,
          fieldLabel:
            signatureLabelByKey.get(assignment.fieldKey) ?? assignment.fieldKey,
          signingUrl: apiResult.signingUrl,
        });
        if (mail.sent) emailsSent += 1;
        else if (mail.detail) {
          console.warn(
            `[simplesign/create-submissions] email not sent for ${assignment.fieldKey}:`,
            mail.detail
          );
        }
      }
    }

    for (const extra of extraAssignments) {
      const match = created.find((row) => row.fieldKey === extra.fieldKey);
      if (!match) continue;
      const signer = findSignerByFieldKey(config, extra.fieldKey);
      const signerName =
        extra.signerName?.trim() ||
        signer?.defaultSignerName(studentRecord, fill.data) ||
        extra.fieldKey;
      const mail = await sendSimpleSignSigningEmail({
        to: extra.email,
        signerName,
        formTitle: schema.title,
        studentName: studentLabel,
        institutionName,
        schoolYearLabel,
        fieldLabel:
          signatureLabelByKey.get(extra.fieldKey) ?? extra.fieldKey,
        signingUrl: match.signingUrl,
      });
      if (mail.sent) emailsSent += 1;
      else if (mail.detail) {
        console.warn(
          `[simplesign/create-submissions] extra email not sent for ${extra.fieldKey}:`,
          mail.detail
        );
      }
    }

    await insertAuditLog({
      institutionId: input.institutionId,
      actorUserId: input.actorUserId,
      action: "simplesign.create_submissions",
      entityType: "form_fill",
      entityId: formFillId,
      summary: multiSigner
        ? `SimpleSign: מסמך רב-חותמים (${created.length} קישורים) ל-${schema.title}`
        : `SimpleSign: ${created.length} שליחות ל-${schema.title}`,
      metadata: {
        form_id: fill.form_id,
        student_id: fill.student_id,
        multi_signer: multiSigner,
        fields: created.map((c) => c.fieldKey),
      },
    });

    const warning = simpleSignEmailSendWarning(emailsSent, created.length);

    return {
      ok: true,
      count: created.length,
      emailsSent,
      warning,
    };
  } catch (err) {
    if (err instanceof SimpleSignApiError) {
      return {
        ok: false,
        error: err.message,
        status: err.status >= 400 && err.status < 600 ? err.status : 502,
      };
    }
    console.error("[simplesign/create-submissions]", err);
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return { ok: false, error: message, status: 500 };
  }
}

