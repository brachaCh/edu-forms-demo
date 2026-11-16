import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAllowedAppOrigin } from "@/lib/app-request-origin";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
  storageRefAlreadyUsed,
  tenantInsertStudentDocument,
  tenantUpsertPaperWaiverScan,
} from "@/lib/server-tenant-data";
import { buildStudentDocumentStorageRef } from "@/lib/student-document-storage-ref";
import { parseJsonBody } from "@/lib/validation";
import {
  confirmStudentDocumentObject,
  isStudentDocumentUploadConfigured,
  removeStudentDocumentObject,
  verifyStudentDocumentUploadTicket,
} from "@/lib/student-document-storage";
import { assertPaperWaiverScanUpload } from "@/lib/paper-waiver-scan";

export const runtime = "nodejs";

const bodySchema = z.object({
  uploadTicket: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
  if (!assertAllowedAppOrigin(request).ok) {
    return NextResponse.json(
      { ok: false, error: "מקור בקשה לא מורשה" },
      { status: 403 }
    );
  }

  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  if (!isStudentDocumentUploadConfigured()) {
    return NextResponse.json(
      { ok: false, error: "שירות ההעלאה אינו זמין כרגע" },
      { status: 503 }
    );
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const ticketResult = verifyStudentDocumentUploadTicket(
    parsed.data.uploadTicket,
    auth.session.userId,
    auth.session.institutionId
  );
  if (!ticketResult.ok) {
    return NextResponse.json(
      { ok: false, error: "טוקן אישור לא תקין או שפג תוקפו" },
      { status: 403 }
    );
  }

  const ticket = ticketResult.ticket;
  const ctx = buildMemberAccessContext(auth.session);
  const allowed = await assertMemberCanAccessStudent(ticket.studentId, ctx);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "STUDENT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const storageRef = buildStudentDocumentStorageRef(ticket.storagePath);
  if (await storageRefAlreadyUsed(storageRef)) {
    return NextResponse.json(
      { ok: false, error: "TICKET_ALREADY_USED" },
      { status: 409 }
    );
  }

  const confirmed = await confirmStudentDocumentObject({
    storagePath: ticket.storagePath,
    mappedMime: ticket.mimeType,
    institutionId: auth.session.institutionId,
  });
  if (!confirmed.ok) {
    const status = confirmed.error === "FILE_TOO_LARGE" ? 413 : 400;
    return NextResponse.json(
      { ok: false, error: confirmed.error },
      { status }
    );
  }

  if (ticket.kind === "paper-waiver") {
    const paper = assertPaperWaiverScanUpload({
      name: ticket.fileName,
      mimeType: confirmed.mimeType,
      size: confirmed.sizeBytes,
      dataUrl: confirmed.dataUrl,
    });
    if (!paper.ok) {
      await removeStudentDocumentObject(ticket.storagePath, auth.session.institutionId);
      return NextResponse.json(
        { ok: false, error: paper.error },
        { status: paper.error === "FILE_TOO_LARGE" ? 413 : 400 }
      );
    }
  }

  const doc = {
    student_id: ticket.studentId,
    name: ticket.fileName,
    mime_type: confirmed.mimeType,
    size: confirmed.sizeBytes,
    data_url: confirmed.dataUrl,
    folder: ticket.folder,
  };

  try {
    const data =
      ticket.kind === "paper-waiver"
        ? await tenantUpsertPaperWaiverScan(auth.session.institutionId, doc, ctx)
        : await tenantInsertStudentDocument(auth.session.institutionId, doc, ctx);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    await removeStudentDocumentObject(ticket.storagePath, auth.session.institutionId).catch(
      () => {}
    );
    const message = error instanceof Error ? error.message : "DOCUMENT_WRITE_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
