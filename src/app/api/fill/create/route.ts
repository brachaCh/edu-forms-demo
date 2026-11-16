import { NextResponse } from "next/server";
import { parentFacingOrigin } from "@/lib/app-origin";
import { insertAuditLog } from "@/lib/audit-log";
import type { EmailRateLimitResult } from "@/lib/email-rate-limit";
import { openEmailRateLimitQuery } from "@/lib/email-rate-limit";
import {
  consumeFormFillCreateRateLimit,
  FORM_FILL_CREATE_INSTITUTION_LIMIT,
  FORM_FILL_CREATE_USER_LIMIT,
} from "@/lib/form-fill-create-rate-limit";
import { sendFormFillLink } from "@/lib/form-fill-create-server";
import { getFormSchema } from "@/lib/form-schemas";
import { isFillRequestForm } from "@/lib/homeroom-fill-forms";
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
import { parseJsonBody, formFillCreateBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

const RATE_LIMITED = "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.";
const RATE_UNAVAILABLE = "שליחת הבקשה אינה זמינה כרגע. נסו שוב מאוחר יותר.";
const CREATE_FAILED = "יצירת קישור המילוי נכשלה";
const SEND_FAILED = "שליחת המייל נכשלה";
const SERVER_ERROR = "שגיאת שרת";

function rateLimitResponse(result: EmailRateLimitResult): NextResponse | null {
  if (result.ok) return null;
  if (result.reason === "limited") {
    return NextResponse.json(
      { ok: false, error: RATE_LIMITED },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfterSec) },
      }
    );
  }
  return NextResponse.json(
    { ok: false, error: RATE_UNAVAILABLE },
    { status: 503 }
  );
}

/**
 * יצירת קישור מילוי אישי (/fill/<token>) לטופס במתוה.
 * דורש סשן צוות; ה-fill חייב להשתייך למוסד של המשתמש.
 * המילוי עצמו נשאר ציבורי דרך הקישור + OTP ב-/api/fill/public.
 */
export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, formFillCreateBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "פרטי בקשת המילוי אינם תקינים" },
      { status: 400 }
    );
  }
  const { formFillId, formId, recipientEmail, note } = parsed.data;

  const rateQuery = openEmailRateLimitQuery();
  const userLimit = await consumeFormFillCreateRateLimit(
    rateQuery,
    `form-fill-create:user:${auth.session.userId}`,
    FORM_FILL_CREATE_USER_LIMIT
  );
  const userLimited = rateLimitResponse(userLimit);
  if (userLimited) return userLimited;

  const institutionLimit = await consumeFormFillCreateRateLimit(
    rateQuery,
    `form-fill-create:institution:${auth.session.institutionId}`,
    FORM_FILL_CREATE_INSTITUTION_LIMIT
  );
  const institutionLimited = rateLimitResponse(institutionLimit);
  if (institutionLimited) return institutionLimited;

  if (!isFillRequestForm(formId)) {
    return NextResponse.json(
      { ok: false, error: "פרטי בקשת המילוי אינם תקינים" },
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
    if (fill.form_id !== formId) {
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

    const schema = getFormSchema(fill.form_id);
    const formTitle = schema?.title?.trim() ?? "";
    const studentName = formatStudentDisplayName(student.full_name);
    if (!formTitle) {
      return NextResponse.json(
        { ok: false, error: "פרטי בקשת המילוי אינם תקינים" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const origin = parentFacingOrigin(request);
    const send = await sendFormFillLink({
      supabase,
      origin,
      formFillId,
      formId,
      formTitle,
      studentName,
      recipientEmail,
      note,
    });
    if (!send.ok) {
      return NextResponse.json(
        { ok: false, error: send.error === "שליחת המייל נכשלה" ? SEND_FAILED : CREATE_FAILED },
        { status: send.status ?? 500 }
      );
    }

    await insertAuditLog({
      institutionId: auth.session.institutionId,
      actorUserId: auth.session.userId,
      action: "form_fill.request",
      entityType: "form_fill",
      entityId: formFillId,
      summary: `נשלח למילוי: ${formTitle} — ${studentName}`,
      metadata: {
        form_id: formId,
        student_id: fill.student_id,
        recipient: recipientEmail,
      },
    });

    return NextResponse.json({ ok: true, sentTo: [recipientEmail] });
  } catch (err) {
    console.error("[fill/create]", err);
    return NextResponse.json({ ok: false, error: SERVER_ERROR }, { status: 500 });
  }
}
