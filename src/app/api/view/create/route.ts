import { NextResponse } from "next/server";
import { z } from "zod";
import { parentFacingOrigin } from "@/lib/app-origin";
import { insertAuditLog } from "@/lib/audit-log";
import {
  consumeFormFillCreateRateLimit,
  FORM_FILL_CREATE_INSTITUTION_LIMIT,
  FORM_FILL_CREATE_USER_LIMIT,
} from "@/lib/form-fill-create-rate-limit";
import { openEmailRateLimitQuery } from "@/lib/email-rate-limit";
import { sendFormViewLinkEmail } from "@/lib/form-view-email";
import {
  hashFormFillToken,
  newFormFillOtpSessionToken,
} from "@/lib/form-fill-otp";
import { isViewableForm, type ViewRecipientRole } from "@/lib/form-view-request";
import { stripScriptsForView } from "@/lib/green-signature";
import { formatStudentDisplayName } from "@/lib/person-name";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import {
  loadFormFillForSigning,
  loadStudentForInstitution,
} from "@/lib/simplesign/server-store";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

const EXPIRY_DAYS = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const recipientSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((e) => EMAIL_RE.test(e), "Invalid email"),
  role: z.enum(["parent", "homeroom", "principal"]),
});

const bodySchema = z.object({
  formFillId: z.string().uuid(),
  formId: z.string().min(1).max(100),
  formTitle: z.string().min(1).max(200).trim(),
  studentName: z.string().min(1).max(200).trim(),
  studentId: z.string().uuid(),
  snapshotHtml: z
    .string()
    .min(100)
    .max(5_000_000),
  recipients: z.array(recipientSchema).min(1).max(10),
});

const RATE_LIMITED =
  "בוצעו יותר מדי שליחות בזמן קצר — נסו שוב מאוחר יותר";
const RATE_UNAVAILABLE =
  "שליחת הצפייה אינה זמינה כרגע. נסו שוב מאוחר יותר.";

function rateLimitResponse(
  result: import("@/lib/email-rate-limit").EmailRateLimitResult
): NextResponse | null {
  if (result.ok) return null;
  if (result.reason === "limited") {
    return NextResponse.json(
      { ok: false, error: RATE_LIMITED },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSec ?? 60),
        },
      }
    );
  }
  return NextResponse.json(
    { ok: false, error: RATE_UNAVAILABLE },
    { status: 503 }
  );
}

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const rateQuery = openEmailRateLimitQuery();
  const userLimit = await consumeFormFillCreateRateLimit(
    rateQuery,
    `form-view-create:user:${auth.session.userId}`,
    FORM_FILL_CREATE_USER_LIMIT
  );
  const userLimited = rateLimitResponse(userLimit);
  if (userLimited) return userLimited;

  const institutionLimit = await consumeFormFillCreateRateLimit(
    rateQuery,
    `form-view-create:institution:${auth.session.institutionId}`,
    FORM_FILL_CREATE_INSTITUTION_LIMIT
  );
  const institutionLimited = rateLimitResponse(institutionLimit);
  if (institutionLimited) return institutionLimited;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "פרטי הבקשה אינם תקינים" },
      { status: 400 }
    );
  }

  const {
    formFillId,
    formId,
    formTitle,
    studentName,
    studentId,
    snapshotHtml,
    recipients,
  } = parsed.data;

  if (!isViewableForm(formId)) {
    return NextResponse.json(
      { ok: false, error: "טופס זה אינו תומך בשליחה לצפייה" },
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
    if (fill.form_id !== formId || fill.student_id !== studentId) {
      return NextResponse.json(
        { ok: false, error: "מזהה הטופס אינו תואם לטיוטה השמורה" },
        { status: 400 }
      );
    }

    const student = await loadStudentForInstitution(fill.student_id);
    if (!student || student.institution_id !== auth.session.institutionId) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לטופס זה" },
        { status: 403 }
      );
    }

    const ctx = buildMemberAccessContext(auth.session);
    if (!(await assertMemberCanAccessStudent(fill.student_id, ctx))) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לטופס זה" },
        { status: 403 }
      );
    }

    const supabase = createServiceClient();
    const origin = parentFacingOrigin(request);
    const expiresAt = new Date(
      Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    let sentCount = 0;
    const failedRoles: string[] = [];
    const processedRoles = new Set<ViewRecipientRole>();

    const sanitizedHtml = stripScriptsForView(snapshotHtml);

    for (const recipient of recipients) {
      const token = newFormFillOtpSessionToken();
      const tokenHash = await hashFormFillToken(token);

      const { error: insertError } = await supabase
        .from("form_view_requests")
        .insert({
          form_fill_id: formFillId,
          form_id: formId,
          form_title: formTitle,
          student_name: studentName,
          token_hash: tokenHash,
          snapshot_html: sanitizedHtml,
          expires_at: expiresAt,
          status: "pending",
        });

      if (insertError) {
        console.error("[view/create] insert:", insertError.message);
        failedRoles.push(recipient.role);
        continue;
      }

      const link = `${origin}/view/${encodeURIComponent(token)}`;
      const mail = await sendFormViewLinkEmail({
        to: recipient.email,
        formTitle,
        studentName,
        link,
        expiryDays: EXPIRY_DAYS,
      });

      if (!mail.sent) {
        console.error("[view/create] email failed:", mail.detail);
        await supabase
          .from("form_view_requests")
          .update({ status: "revoked" })
          .eq("token_hash", tokenHash);
        failedRoles.push(recipient.role);
        continue;
      }

      sentCount++;

      if (!processedRoles.has(recipient.role)) {
        processedRoles.add(recipient.role);
        await supabase.from("form_view_send_log").insert({
          institution_id: auth.session.institutionId,
          form_fill_id: formFillId,
          form_id: formId,
          student_id: studentId,
          recipient_role: recipient.role,
          sent_by: auth.session.userId,
        });
      }
    }

    if (sentCount > 0) {
      await insertAuditLog({
        institutionId: auth.session.institutionId,
        actorUserId: auth.session.userId,
        action: "form_view.send",
        entityType: "form_fill",
        entityId: formFillId,
        summary: `נשלח לצפייה: ${formTitle} — ${formatStudentDisplayName(studentName)}`,
        metadata: {
          form_id: formId,
          student_id: studentId,
          sent_count: sentCount,
          roles: Array.from(processedRoles),
        },
      });
    }

    if (sentCount === 0) {
      return NextResponse.json(
        { ok: false, error: "שליחת המיילים נכשלה — בדקו את כתובות המייל" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sentCount,
      failedRoles:
        failedRoles.length > 0 ? [...new Set(failedRoles)] : undefined,
    });
  } catch (err) {
    console.error("[view/create]", err);
    return NextResponse.json(
      { ok: false, error: "שגיאת שרת" },
      { status: 500 }
    );
  }
}
