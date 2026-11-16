import { NextResponse } from "next/server";
import { isParentBulkSendFormId } from "@/lib/form-parent-send-status";
import { fetchStudentParentFormSendStatuses } from "@/lib/form-parent-send-status-server";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import { loadStudentForInstitution } from "@/lib/simplesign/server-store";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseJsonBody, formParentSendStatusBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, formParentSendStatusBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "פרטי הבקשה אינם תקינים" },
      { status: 400 }
    );
  }

  const { formId, studentIds } = parsed.data;
  if (!isParentBulkSendFormId(formId)) {
    return NextResponse.json(
      { ok: false, error: "סוג הטופס אינו נתמך" },
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

  const studentsById = new Map();
  for (const studentId of allowedIds) {
    const student = await loadStudentForInstitution(studentId);
    if (student && student.institution_id === auth.session.institutionId) {
      studentsById.set(studentId, student);
    }
  }

  try {
    const supabase = createServiceClient();
    const statuses = await fetchStudentParentFormSendStatuses({
      supabase,
      formId,
      studentIds: [...studentsById.keys()],
      studentsById,
    });
    return NextResponse.json({ ok: true, statuses });
  } catch (err) {
    console.error("[fill/send-status]", err);
    return NextResponse.json(
      { ok: false, error: "שגיאת שרת" },
      { status: 500 }
    );
  }
}
