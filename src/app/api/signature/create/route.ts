import { NextResponse } from "next/server";
import { parentFacingOrigin } from "@/lib/app-origin";
import { insertAuditLog } from "@/lib/audit-log";
import { hashFormFillToken, newFormFillOtpSessionToken } from "@/lib/form-fill-otp";
import { sendFormSignatureLinkEmail } from "@/lib/form-signature-otp-email";
import { getFormSchema, listFormFields } from "@/lib/form-schemas";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import {
  formSupportsSimpleSign,
  isSimpleSignSignerField,
} from "@/lib/simplesign/config";
import {
  loadFormFillForSigning,
  loadStudentForInstitution,
} from "@/lib/simplesign/server-store";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseJsonBody, signatureCreateBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

const EXPIRY_DAYS = 7;

function isMissingTable(message: string): boolean {
  return /does not exist|schema cache|Could not find the table/i.test(message);
}

/**
 * יצירת קישורי חתימה אישיים (/sign/<token>) לטופס במתוה.
 * דורש סשן צוות; ה-fill חייב להשתייך למוסד של המשתמש, וכל fieldKey חייב
 * להיות שדה חתימה אמיתי בסכמת הטופס.
 */
export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, signatureCreateBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "פרטי בקשת החתימה אינם תקינים" },
      { status: 400 }
    );
  }
  const { formFillId, formTitle, studentName, snapshotHtml, assignments } =
    parsed.data;

  const pairKeys = assignments.map((a) => `${a.fieldKey}\0${a.email}`);
  if (new Set(pairKeys).size !== pairKeys.length) {
    return NextResponse.json(
      { ok: false, error: "אותה כתובת כבר משויכת לאותו שדה חתימה" },
      { status: 400 }
    );
  }

  try {
    const fill = await loadFormFillForSigning(formFillId);
    if (!fill) {
      return NextResponse.json(
        {
          ok: false,
          error: "טיוטת הטופס לא נמצאה בשרת. שמרו את הטופס ונסו שוב.",
        },
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

    const signatureKeys = new Set(
      listFormFields(schema)
        .filter((field) => field.type === "signature")
        .map((field) => field.key)
    );
    const simpleSignActive = formSupportsSimpleSign(fill.form_id);
    for (const assignment of assignments) {
      if (!signatureKeys.has(assignment.fieldKey)) {
        return NextResponse.json(
          { ok: false, error: `שדה חתימה לא מוגדר בטופס: ${assignment.fieldKey}` },
          { status: 400 }
        );
      }
      if (
        simpleSignActive &&
        isSimpleSignSignerField(fill.form_id, assignment.fieldKey)
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "שדה זה נחתם ב-SimpleSign — יש להשתמש ב«שלח לחתימה ב-SimpleSign»",
          },
          { status: 400 }
        );
      }
    }

    const supabase = createServiceClient();
    const origin = parentFacingOrigin(request);
    const expiresAt = new Date(
      Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // מבטלים בקשות ממתינות קודמות לשדות האלה — פעם אחת, לפני הוספת הנמענים
    const fieldKeys = [...new Set(assignments.map((item) => item.fieldKey))];
    for (const fieldKey of fieldKeys) {
      const { error } = await supabase
        .from("form_signature_requests")
        .update({ status: "revoked" })
        .eq("form_fill_id", formFillId)
        .eq("signature_field_key", fieldKey)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
    }

    const sentTo: string[] = [];
    for (const assignment of assignments) {
      const token = newFormFillOtpSessionToken();
      const tokenHash = await hashFormFillToken(token);
      const { error: insertError } = await supabase
        .from("form_signature_requests")
        .insert({
          form_fill_id: formFillId,
          recipient_email: assignment.email,
          signature_field_key: assignment.fieldKey,
          signature_field_label: assignment.fieldLabel,
          form_title: formTitle,
          student_name: studentName,
          snapshot_html: snapshotHtml,
          token_hash: tokenHash,
          expires_at: expiresAt,
        });
      if (insertError) {
        console.error("[signature/create] insert:", insertError.message);
        return NextResponse.json(
          {
            ok: false,
            error: isMissingTable(insertError.message)
              ? "טבלת בקשות החתימה חסרה בבסיס הנתונים — יש להריץ את המיגרציה 019_form_signature_requests.sql"
              : `יצירת קישור החתימה נכשלה: ${insertError.message}`,
          },
          { status: 500 }
        );
      }

      const link = `${origin}/sign/${encodeURIComponent(token)}`;
      const mail = await sendFormSignatureLinkEmail({
        to: assignment.email,
        formTitle,
        studentName,
        fieldLabel: assignment.fieldLabel,
        link,
        expiryDays: EXPIRY_DAYS,
      });
      if (!mail.sent) {
        await supabase
          .from("form_signature_requests")
          .update({ status: "revoked" })
          .eq("token_hash", tokenHash);
        return NextResponse.json(
          {
            ok: false,
            error: mail.detail
              ? `שליחת המייל נכשלה: ${mail.detail}`
              : "שליחת המייל נכשלה",
            sentTo,
          },
          { status: 502 }
        );
      }
      sentTo.push(assignment.email);
    }

    await insertAuditLog({
      institutionId: auth.session.institutionId,
      actorUserId: auth.session.userId,
      action: "signature.request",
      entityType: "form_fill",
      entityId: formFillId,
      summary: `נשלח לחתימה: ${formTitle} — ${studentName}`,
      metadata: {
        form_id: fill.form_id,
        student_id: fill.student_id,
        fields: fieldKeys,
        recipients: sentTo,
      },
    });

    return NextResponse.json({ ok: true, sentTo });
  } catch (err) {
    console.error("[signature/create]", err);
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
