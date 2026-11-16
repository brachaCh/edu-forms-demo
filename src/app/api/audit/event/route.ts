import { NextResponse } from "next/server";
import { insertAuditLog } from "@/lib/audit-log";
import { requireTenantSession } from "@/lib/server-auth";
import { auditEventBodySchema, parseJsonBody } from "@/lib/validation";

/** רישום פעולת לקוח (הדפסה, שליחת חתימה וכו') — כל משתמש מחובר במוסד */
export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, auditEventBodySchema);
  if (!parsed.ok) return parsed.response;

  const { action, summary, entityType, entityId, metadata } = parsed.data;

  await insertAuditLog({
    institutionId: auth.session.institutionId,
    actorUserId: auth.session.userId,
    action,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    summary: summary ?? null,
    metadata: metadata ?? {},
  });

  return NextResponse.json({ ok: true });
}
