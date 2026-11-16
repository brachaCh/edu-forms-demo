import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import { runSimpleSignCreateSubmissions } from "@/lib/simplesign/create-submissions-server";
import { loadFormFillForSigning } from "@/lib/simplesign/server-store";
import { parseJsonBody, simpleSignCreateBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, simpleSignCreateBodySchema);
  if (!parsed.ok) {
    const error =
      parsed.message?.includes("מכילה תווים לא תקינים")
        ? parsed.message
        : "בקשה לא תקינה";
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  const fill = await loadFormFillForSigning(parsed.data.formFillId);
  if (fill) {
    const ctx = buildMemberAccessContext(auth.session);
    if (!(await assertMemberCanAccessStudent(fill.student_id, ctx))) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לטופס זה" },
        { status: 403 }
      );
    }
  }

  const result = await runSimpleSignCreateSubmissions({
    institutionId: auth.session.institutionId,
    actorUserId: auth.session.userId,
    requesterEmail: auth.session.profile.email,
    formFillId: parsed.data.formFillId,
    assignments: parsed.data.assignments,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    count: result.count,
    emailsSent: result.emailsSent,
    warning: result.warning,
  });
}
