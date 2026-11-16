import { NextResponse } from "next/server";
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
  const studentId = url.searchParams.get("studentId");

  if (!studentId) {
    return NextResponse.json(
      { ok: false, error: "חסר מזהה תלמיד" },
      { status: 400 }
    );
  }

  try {
    const student = await loadStudentForInstitution(studentId);
    if (!student || student.institution_id !== auth.session.institutionId) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לתלמיד זה" },
        { status: 403 }
      );
    }

    const ctx = buildMemberAccessContext(auth.session);
    if (!(await assertMemberCanAccessStudent(studentId, ctx))) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לתלמיד זה" },
        { status: 403 }
      );
    }

    const supabase = createServiceClient();

    const { data: requests, error } = await supabase
      .from("external_document_signature_requests")
      .select("id, document_id, document_name, recipient_email, signer_label, status, created_at, signed_at, expires_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[external-signature/list]", error.message);
      return NextResponse.json(
        { ok: false, error: "שגיאת שרת" },
        { status: 500 }
      );
    }

    const result = (requests ?? []).map((r) => ({
      id: r.id,
      documentId: r.document_id,
      documentName: r.document_name,
      recipientEmail: r.recipient_email,
      signerLabel: r.signer_label,
      status: r.status,
      createdAt: r.created_at,
      signedAt: r.signed_at,
      expiresAt: r.expires_at,
    }));

    return NextResponse.json({ ok: true, requests: result });
  } catch (err) {
    console.error("[external-signature/list]", err);
    return NextResponse.json(
      { ok: false, error: "שגיאת שרת" },
      { status: 500 }
    );
  }
}
