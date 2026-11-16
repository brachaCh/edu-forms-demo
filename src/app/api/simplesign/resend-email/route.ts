import { NextResponse } from "next/server";
import { resolveSignatureRequestLabel } from "@/lib/form-fields";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import {
  createSimpleSignSubmission,
  createMultiSignerSubmission,
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
  type SimpleSignFormConfig,
} from "@/lib/simplesign/config";
import {
  buildSimpleSignPrefillBySignerSlot,
  buildSimpleSignPrefillForDocument,
  parseSimpleSignDocumentInputs,
  splitSimpleSignPrefillBySigner,
} from "@/lib/simplesign/prefill";
import {
  mapResendErrorToHebrew,
  resolveSchoolYearLabel,
  sendSimpleSignSigningEmail,
} from "@/lib/simplesign/signing-email";
import {
  isStaleRenewing,
  listSimpleSignSubmissions,
  loadFormFillForSigning,
  loadInstitutionDisplayName,
  loadStudentForInstitution,
  markAllSubmissionsRenewing,
  markSubmissionRenewing,
  replaceExpiredSubmission,
  replaceExpiredSubmissionMultiSigner,
  revertAllRenewingToExpired,
  revertRenewingToExpired,
  type SimpleSignSubmissionRow,
} from "@/lib/simplesign/server-store";
import type { Student } from "@/lib/supabase/types";
import { parseJsonBody, simpleSignResendEmailBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, simpleSignResendEmailBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "בקשה לא תקינה" },
      { status: 400 }
    );
  }

  const { formFillId, signatureFieldKey } = parsed.data;

  try {
    const fill = await loadFormFillForSigning(formFillId);
    if (!fill) {
      return NextResponse.json(
        { ok: false, error: "טיוטת הטופס לא נמצאה" },
        { status: 404 }
      );
    }

    const student = await loadStudentForInstitution(fill.student_id);
    if (!student || student.institution_id !== auth.session.institutionId) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לטופס זה" },
        { status: 403 }
      );
    }

    // TZ-28: Check member-scoped access
    const ctx = buildMemberAccessContext(auth.session);
    if (!(await assertMemberCanAccessStudent(fill.student_id, ctx))) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לטופס זה" },
        { status: 403 }
      );
    }

    const schema = getFormSchema(fill.form_id);
    if (!schema) {
      return NextResponse.json(
        { ok: false, error: "סכמת הטופס לא נמצאה" },
        { status: 400 }
      );
    }

    const rows = await listSimpleSignSubmissions(formFillId);
    const pendingRow = rows.find(
      (item) =>
        item.signature_field_key === signatureFieldKey &&
        item.status === "pending"
    );
    const expiredRow = rows.find(
      (item) =>
        item.signature_field_key === signatureFieldKey &&
        (item.status === "expired" || isStaleRenewing(item))
    );
    const renewingRow = rows.find(
      (item) =>
        item.signature_field_key === signatureFieldKey &&
        item.status === "renewing" &&
        !isStaleRenewing(item)
    );

    if (renewingRow) {
      return NextResponse.json(
        { ok: false, error: "הקישור כבר בתהליך חידוש, נסו שוב בעוד דקה" },
        { status: 409 }
      );
    }

    const row = pendingRow ?? expiredRow;
    if (!row) {
      return NextResponse.json(
        {
          ok: false,
          error: "אין שליחה ממתינה לשדה זה",
        },
        { status: 409 }
      );
    }

    const field = listFormFields(schema).find(
      (item) => item.key === signatureFieldKey
    );
    const sectionTitle =
      schema.sections.find((section) =>
        section.fields.some((item) => item.key === signatureFieldKey)
      )?.title ?? null;
    const fieldLabel = field
      ? resolveSignatureRequestLabel(field, sectionTitle)
      : signatureFieldKey;

    const institutionName = student.institution_id
      ? (await loadInstitutionDisplayName(student.institution_id)) ?? ""
      : "";
    const schoolYearLabel = resolveSchoolYearLabel(
      fill.data,
      student.calendar_year
    );

    let signingUrl: string | null = row.signing_url;
    let renewed = false;

    const needsRenewal =
      row.status === "expired" ||
      isStaleRenewing(row) ||
      !signingUrl;

    if (needsRenewal) {
      const config = getSimpleSignFormConfig(fill.form_id);
      const expiredSameToken = rows.filter(
        (r) =>
          r.submission_token === row.submission_token &&
          (r.status === "expired" || r.status === "renewing" || isStaleRenewing(r)) &&
          r.signed_at === null
      );
      const allSignersExpired =
        config &&
        expiredSameToken.length > 1 &&
        expiredSameToken.every((r) => r.signed_at === null);

      if (allSignersExpired && config) {
        const allFieldKeys = expiredSameToken.map((r) => r.signature_field_key);
        let markedKeys: string[] = [];
        let succeeded = false;

        try {
          markedKeys = await markAllSubmissionsRenewing(row.submission_token, allFieldKeys);

          if (markedKeys.length === 0) {
            return NextResponse.json(
              { ok: false, error: "הקישורים כבר בתהליך חידוש או לא נמצאו" },
              { status: 409 }
            );
          }

          if (markedKeys.length !== allFieldKeys.length) {
            return NextResponse.json(
              { ok: false, error: "חידוש כבר מתבצע עבור חלק מהחותמים" },
              { status: 409 }
            );
          }

          const lockedRows = expiredSameToken.filter((r) =>
            markedKeys.includes(r.signature_field_key)
          );

          const renewResult = await renewAllSigners({
            fill,
            student: student as Student,
            expiredRows: lockedRows,
            config,
            schoolYearLabel,
          });
          if (!renewResult.ok) {
            return NextResponse.json(
              { ok: false, error: renewResult.error },
              { status: renewResult.status }
            );
          }

          const updatedCount = await replaceExpiredSubmissionMultiSigner({
            oldSubmissionToken: row.submission_token,
            newSubmissionToken: renewResult.submissionToken,
            signerUpdates: renewResult.signerUpdates,
            lockedKeys: markedKeys,
          });

          if (updatedCount !== renewResult.signerUpdates.length) {
            return NextResponse.json(
              { ok: false, error: "עדכון הקישורים נכשל — נסו שוב" },
              { status: 500 }
            );
          }

          const myUpdate = renewResult.signerUpdates.find(
            (u) => u.signatureFieldKey === signatureFieldKey
          );
          signingUrl = myUpdate?.signingUrl ?? renewResult.signerUpdates[0]?.signingUrl ?? "";

          let emailFailures = 0;
          let firstFailure: Awaited<ReturnType<typeof sendSimpleSignSigningEmail>> | null = null;
          for (const signerUpdate of renewResult.signerUpdates) {
            const signerRow = lockedRows.find(
              (r) => r.signature_field_key === signerUpdate.signatureFieldKey
            );
            if (signerRow) {
              const signerFieldLabel =
                listFormFields(schema).find((f) => f.key === signerUpdate.signatureFieldKey)?.label ??
                signerUpdate.signatureFieldKey;
              const mail = await sendSimpleSignSigningEmail({
                to: signerRow.signer_email,
                signerName: signerRow.signer_name,
                formTitle: schema.title,
                studentName: String(student.full_name ?? "").trim(),
                institutionName,
                schoolYearLabel,
                fieldLabel: signerFieldLabel,
                signingUrl: signerUpdate.signingUrl,
              });
              if (!mail.sent) {
                emailFailures++;
                if (!firstFailure) firstFailure = mail;
              }
            }
          }

          if (emailFailures > 0 && firstFailure) {
            return NextResponse.json({
              ok: false,
              error: `הקישורים חודשו אך שליחת המיילים נכשלה: ${mapResendErrorToHebrew(firstFailure)}`,
              renewed: true,
              allSignersRenewed: true,
              emailFailures,
            });
          }

          succeeded = true;
          return NextResponse.json({ ok: true, renewed: true, allSignersRenewed: true });
        } finally {
          if (!succeeded && markedKeys.length > 0) {
            await revertAllRenewingToExpired(row.submission_token, markedKeys);
          }
        }
      }

      const markedRenewing = await markSubmissionRenewing(
        row.submission_token,
        signatureFieldKey
      );
      if (!markedRenewing) {
        return NextResponse.json(
          { ok: false, error: "הקישור כבר בתהליך חידוש או לא נמצא" },
          { status: 409 }
        );
      }

      let succeeded = false;
      try {
        const newSubmissionResult = await createNewSubmission({
          fill,
          student: student as Student,
          row,
          signatureFieldKey,
          schoolYearLabel,
        });
        if (!newSubmissionResult.ok) {
          return NextResponse.json(
            { ok: false, error: newSubmissionResult.error },
            { status: newSubmissionResult.status }
          );
        }
        signingUrl = newSubmissionResult.signingUrl;

        const updated = await replaceExpiredSubmission({
          oldSubmissionToken: row.submission_token,
          newSubmissionToken: newSubmissionResult.submissionToken,
          newSigningUrl: signingUrl,
          signatureFieldKey,
        });

        if (!updated) {
          return NextResponse.json(
            { ok: false, error: "עדכון הקישור נכשל — נסו שוב" },
            { status: 500 }
          );
        }
        renewed = true;
        succeeded = true;
      } finally {
        if (!succeeded) {
          await revertRenewingToExpired(row.submission_token, signatureFieldKey);
        }
      }
    }

    if (!signingUrl) {
      return NextResponse.json(
        { ok: false, error: "לא נמצא קישור חתימה" },
        { status: 500 }
      );
    }

    const mail = await sendSimpleSignSigningEmail({
      to: row.signer_email,
      signerName: row.signer_name,
      formTitle: schema.title,
      studentName: String(student.full_name ?? "").trim(),
      institutionName,
      schoolYearLabel,
      fieldLabel,
      signingUrl,
    });

    if (!mail.sent) {
      return NextResponse.json(
        {
          ok: false,
          error: mapResendErrorToHebrew(mail),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, renewed });
  } catch (err) {
    if (err instanceof SimpleSignApiError) {
      console.error("[simplesign/resend-email] SimpleSign API error:", err.message);
      return NextResponse.json(
        { ok: false, error: "שגיאה בתקשורת עם שירות החתימה" },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      );
    }
    console.error("[simplesign/resend-email]", err);
    return NextResponse.json(
      { ok: false, error: "שגיאת שרת" },
      { status: 500 }
    );
  }
}

async function createNewSubmission(input: {
  fill: { id: string; student_id: string; form_id: string; data: Record<string, string> };
  student: Student;
  row: { signer_email: string; signer_name: string; document_token: string; signer_slot: number | null };
  signatureFieldKey: string;
  schoolYearLabel: string;
}): Promise<
  | { ok: true; submissionToken: string; signingUrl: string }
  | { ok: false; error: string; status: number }
> {
  const { fill, student, row, signatureFieldKey, schoolYearLabel } = input;

  const config = getSimpleSignFormConfig(fill.form_id);
  if (!config) {
    return { ok: false, error: "טופס זה אינו מוגדר ל-SimpleSign", status: 400 };
  }

  const singleResponsibleParty = student.single_responsible_party;
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

  const documentPayload = await getDocumentInputs(documentToken);
  const documentIsMultiSigner = isMultiSignerDocument(documentPayload);
  const documentInputs = parseSimpleSignDocumentInputs(documentPayload);

  const signer = findSignerByFieldKey(config, signatureFieldKey);
  if (!signer) {
    return { ok: false, error: `שדה חתימה לא מוגדר: ${signatureFieldKey}`, status: 400 };
  }

  if (documentIsMultiSigner) {
    const { shared, bySigner } = splitSimpleSignPrefillBySigner(
      buildSimpleSignPrefillBySignerSlot(
        schema,
        fill.data,
        documentInputs,
        schoolYearLabel
      )
    );

    const slot = resolveSignerSlot(config, signer);
    const apiResult = await createMultiSignerSubmission({
      documentToken,
      lockPrefill: true,
      sendEmail: false,
      prefill: shared,
      signers: [
        {
          slot,
          signerName: row.signer_name,
          signerEmail: row.signer_email,
          prefill: bySigner[slot] ?? {},
        },
      ],
    });

    const apiSigner = apiResult.signers.find((s) => s.slot === slot);
    if (!apiSigner) {
      return { ok: false, error: `SimpleSign לא החזיר קישור לחותם ${slot}`, status: 502 };
    }

    return {
      ok: true,
      submissionToken: apiResult.submissionToken,
      signingUrl: apiSigner.signingUrl,
    };
  } else {
    const prefill = buildSimpleSignPrefillForDocument(
      schema,
      fill.data,
      documentInputs,
      schoolYearLabel
    );

    const apiResult = await createSimpleSignSubmission({
      documentToken,
      signerName: row.signer_name,
      signerEmail: row.signer_email,
      prefill,
      lockPrefill: true,
    });

    return {
      ok: true,
      submissionToken: apiResult.submissionToken,
      signingUrl: apiResult.signingUrl,
    };
  }
}

async function renewAllSigners(input: {
  fill: { id: string; student_id: string; form_id: string; data: Record<string, string> };
  student: Student;
  expiredRows: SimpleSignSubmissionRow[];
  config: SimpleSignFormConfig;
  schoolYearLabel: string;
}): Promise<
  | { ok: true; submissionToken: string; signerUpdates: Array<{ signatureFieldKey: string; signingUrl: string; signerSlot: number }> }
  | { ok: false; error: string; status: number }
> {
  const { fill, student, expiredRows, config, schoolYearLabel } = input;

  const singleResponsibleParty = student.single_responsible_party;
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

  const documentPayload = await getDocumentInputs(documentToken);
  const documentIsMultiSigner = isMultiSignerDocument(documentPayload);
  const documentInputs = parseSimpleSignDocumentInputs(documentPayload);

  if (!documentIsMultiSigner) {
    return { ok: false, error: "טופס זה אינו רב-חותמים", status: 400 };
  }

  const { shared, bySigner } = splitSimpleSignPrefillBySigner(
    buildSimpleSignPrefillBySignerSlot(
      schema,
      fill.data,
      documentInputs,
      schoolYearLabel
    )
  );

  const assignments = expiredRows.map((row) => ({
    fieldKey: row.signature_field_key,
    email: row.signer_email,
    signerName: row.signer_name,
  }));
  const orderedAssignments = sortSimpleSignAssignments(config, assignments);

  const signers = orderedAssignments.map((assignment) => {
    const signer = findSignerByFieldKey(config, assignment.fieldKey)!;
    const slot = resolveSignerSlot(config, signer);
    return {
      slot,
      signerName: assignment.signerName,
      signerEmail: assignment.email,
      prefill: bySigner[slot] ?? {},
    };
  });

  const apiResult = await createMultiSignerSubmission({
    documentToken,
    lockPrefill: true,
    sendEmail: false,
    prefill: shared,
    signers,
  });

  const signerUpdates: Array<{ signatureFieldKey: string; signingUrl: string; signerSlot: number }> = [];
  for (const assignment of orderedAssignments) {
    const signer = findSignerByFieldKey(config, assignment.fieldKey)!;
    const slot = resolveSignerSlot(config, signer);
    const apiSigner = apiResult.signers.find((s) => s.slot === slot);
    if (!apiSigner) {
      return { ok: false, error: `SimpleSign לא החזיר קישור לחותם ${slot}`, status: 502 };
    }
    signerUpdates.push({
      signatureFieldKey: assignment.fieldKey,
      signingUrl: apiSigner.signingUrl,
      signerSlot: slot,
    });
  }

  return {
    ok: true,
    submissionToken: apiResult.submissionToken,
    signerUpdates,
  };
}
