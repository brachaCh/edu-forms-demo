import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import { loadFormFillForSigning, loadStudentForInstitution } from "@/lib/simplesign/server-store";
import { archiveSignedFormIfComplete } from "@/lib/form-signed-archive-server";
import { archiveSignedBodySchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, archiveSignedBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const fill = await loadFormFillForSigning(parsed.data.formFillId);
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

    const result = await archiveSignedFormIfComplete(fill.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[forms/archive-signed]", error);
    return NextResponse.json(
      { ok: false, error: "שמירת הארכיון נכשלה" },
      { status: 500 }
    );
  }
}
