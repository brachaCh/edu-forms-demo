import { NextResponse } from "next/server";
import { insertAuditLog } from "@/lib/audit-log";
import type { EmailRateLimitResult } from "@/lib/email-rate-limit";
import { openEmailRateLimitQuery } from "@/lib/email-rate-limit";
import {
  consumeFormFillCreateRateLimit,
  FORM_FILL_CREATE_INSTITUTION_LIMIT,
  FORM_FILL_CREATE_USER_LIMIT,
} from "@/lib/form-fill-create-rate-limit";
import { runParentFormBulkSend } from "@/lib/form-parent-bulk-send-server";
import { isParentBulkSendFormId } from "@/lib/form-parent-send-status";
import { getFormSchema } from "@/lib/form-schemas";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import { parseJsonBody, parentFormBulkSendBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

const RATE_LIMITED = "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.";
const RATE_UNAVAILABLE = "שליחת הבקשה אינה זמינה כרגע. נסו שוב מאוחר יותר.";

function rateLimitFailure(
  result: Extract<EmailRateLimitResult, { ok: false }>
): { ok: false; error: string; status: number } {
  if (result.reason === "limited") {
    return { ok: false, error: RATE_LIMITED, status: 429 };
  }
  return { ok: false, error: RATE_UNAVAILABLE, status: 503 };
}

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, parentFormBulkSendBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "פרטי הבקשה אינם תקינים" },
      { status: 400 }
    );
  }

  const { formId, studentIds, skipAlreadySent, skipAlreadyFilled, note } =
    parsed.data;
  if (!isParentBulkSendFormId(formId)) {
    return NextResponse.json(
      { ok: false, error: "סוג הטופס אינו נתמך לשליחה גורפת" },
      { status: 400 }
    );
  }

  const ctx = buildMemberAccessContext(auth.session);
  const allowedIds: string[] = [];
  for (const studentId of studentIds) {
    if (await assertMemberCanAccessStudent(studentId, ctx)) {
      allowedIds.push(studentId);
    }
  }
  if (allowedIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "אין תלמידות לשליחה" },
      { status: 403 }
    );
  }

  const schema = getFormSchema(formId);
  const formTitle = schema?.title?.trim() ?? formId;

  const rateQuery = openEmailRateLimitQuery();

  try {
    const result = await runParentFormBulkSend({
      institutionId: auth.session.institutionId,
      actorUserId: auth.session.userId,
      requesterEmail: auth.session.profile.email,
      formId,
      studentIds: allowedIds,
      skipAlreadySent,
      skipAlreadyFilled,
      note,
      ctx,
      request,
      rateLimit: {
        consumeEmailSlot: async () => {
          const userLimit = await consumeFormFillCreateRateLimit(
            rateQuery,
            `form-fill-create:user:${auth.session.userId}`,
            FORM_FILL_CREATE_USER_LIMIT
          );
          if (!userLimit.ok) return rateLimitFailure(userLimit);

          const institutionLimit = await consumeFormFillCreateRateLimit(
            rateQuery,
            `form-fill-create:institution:${auth.session.institutionId}`,
            FORM_FILL_CREATE_INSTITUTION_LIMIT
          );
          if (!institutionLimit.ok) return rateLimitFailure(institutionLimit);

          return { ok: true };
        },
      },
    });

    if (result.sent.length > 0) {
      await insertAuditLog({
        institutionId: auth.session.institutionId,
        actorUserId: auth.session.userId,
        action: "form_fill.bulk_send",
        entityType: "form",
        entityId: formId,
        summary: `שליחה גורפת: ${formTitle} — ${result.sent.length} נשלחו`,
        metadata: {
          form_id: formId,
          sent_count: result.sent.length,
          skipped_count: result.skipped.length,
          failed_count: result.failed.length,
        },
      });
    }

    const hitRateLimit = result.failed.some(
      (row) =>
        row.error === RATE_LIMITED || row.error === RATE_UNAVAILABLE
    );

    return NextResponse.json(
      { ok: true, ...result },
      { status: hitRateLimit ? 429 : 200 }
    );
  } catch (err) {
    console.error("[parent-forms/bulk-send]", err);
    return NextResponse.json(
      { ok: false, error: "שגיאה בשליחה הגורפת" },
      { status: 500 }
    );
  }
}
