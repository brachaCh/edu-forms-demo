import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import {
  listSimpleSignSubmissions,
  loadFormFillForSigning,
  loadStudentForInstitution,
} from "@/lib/simplesign/server-store";
import { syncPendingSimpleSignSubmissions } from "@/lib/simplesign/sync-status";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const formFillId = new URL(request.url).searchParams.get("formFillId")?.trim();
  if (!formFillId || !UUID_RE.test(formFillId)) {
    return NextResponse.json(
      { ok: false, error: "מזהה טופס לא תקין" },
      { status: 400 }
    );
  }

  try {
    const fill = await loadFormFillForSigning(formFillId);
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

    await syncPendingSimpleSignSubmissions(formFillId);

    const rows = await listSimpleSignSubmissions(formFillId);
    return NextResponse.json({
      ok: true,
      submissions: rows.map((row) => ({
        id: row.id,
        parentRole: row.parent_role,
        signatureFieldKey: row.signature_field_key,
        status: row.status,
        signingUrl: row.signing_url,
        signerEmail: row.signer_email,
        signerName: row.signer_name,
        signedAt: row.signed_at,
        createdAt: row.created_at,
        signedPdfStored: Boolean(row.signed_pdf_document_id),
        signedPdfDocumentId: row.signed_pdf_document_id,
        errorMessage: row.error_message,
      })),
    });
  } catch (err) {
    console.error("[simplesign/submissions]", err);
    return NextResponse.json(
      { ok: false, error: "טעינת הסטטוס נכשלה" },
      { status: 500 }
    );
  }
}
