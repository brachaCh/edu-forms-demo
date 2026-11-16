import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import {
  listSimpleSignSubmissions,
  loadFormFillForSigning,
  loadSignedPdfDocument,
  loadStudentForInstitution,
} from "@/lib/simplesign/server-store";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * מגיש את ה-PDF החתום שחזר מ-SimpleSign עבור טופס — זה המסמך שבו נראית
 * החתימה עצמה. רק לצוות של המוסד שהתלמיד שייך אליו.
 */
export async function GET(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const url = new URL(request.url);
  const formFillId = url.searchParams.get("formFillId")?.trim();
  const download = url.searchParams.get("download") === "1";
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
        { ok: false, error: "הטופס לא נמצא" },
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

    const rows = await listSimpleSignSubmissions(formFillId);
    const documentId =
      rows.find((row) => row.signed_pdf_document_id)?.signed_pdf_document_id ??
      null;
    if (!documentId) {
      return NextResponse.json(
        { ok: false, error: "המסמך החתום עדיין לא התקבל מ-SimpleSign" },
        { status: 404 }
      );
    }

    const doc = await loadSignedPdfDocument(documentId);
    if (!doc || doc.studentId !== fill.student_id) {
      return NextResponse.json(
        { ok: false, error: "המסמך החתום לא נמצא" },
        { status: 404 }
      );
    }

    const safeName = doc.name.replace(/["\r\n]/g, "").trim() || "signed.pdf";
    const disposition = download ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(doc.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(doc.bytes.byteLength),
        "Content-Disposition": `${disposition}; filename="signed.pdf"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[simplesign/signed-pdf]", err);
    return NextResponse.json(
      { ok: false, error: "טעינת המסמך החתום נכשלה" },
      { status: 500 }
    );
  }
}
