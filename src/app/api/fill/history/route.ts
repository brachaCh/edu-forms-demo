import { NextResponse } from "next/server";
import { type FormFillHistoryItem } from "@/lib/form-fill-request";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import { loadStudentForInstitution } from "@/lib/simplesign/server-store";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const url = new URL(request.url);
  const formFillId = url.searchParams.get("formFillId");

  if (!formFillId) {
    return NextResponse.json(
      { ok: false, error: "חסר מזהה מילוי" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceClient();

    const { data: fill, error: fillError } = await supabase
      .from("student_form_fills")
      .select("id, student_id, form_id")
      .eq("id", formFillId)
      .single();

    if (fillError || !fill) {
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

    const ctx = buildMemberAccessContext(auth.session);
    if (!(await assertMemberCanAccessStudent(fill.student_id, ctx))) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לטופס זה" },
        { status: 403 }
      );
    }

    const { data: requests, error: requestsError } = await supabase
      .from("form_fill_requests")
      .select("id, recipient_email, form_title, student_name, status, created_at, submitted_at, expires_at")
      .eq("form_fill_id", formFillId)
      .order("created_at", { ascending: false });

    if (requestsError) {
      console.error("[fill/history]", requestsError.message);
      return NextResponse.json(
        { ok: false, error: "שגיאת שרת" },
        { status: 500 }
      );
    }

    const history: FormFillHistoryItem[] = (requests ?? []).map((r) => ({
      id: r.id,
      recipientEmail: r.recipient_email,
      formTitle: r.form_title,
      studentName: r.student_name,
      status: r.status as FormFillHistoryItem["status"],
      createdAt: r.created_at,
      submittedAt: r.submitted_at,
      expiresAt: r.expires_at,
    }));

    return NextResponse.json({ ok: true, history });
  } catch (err) {
    console.error("[fill/history]", err);
    return NextResponse.json(
      { ok: false, error: "שגיאת שרת" },
      { status: 500 }
    );
  }
}
