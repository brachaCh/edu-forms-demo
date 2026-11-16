import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAllowedAppOrigin } from "@/lib/app-request-origin";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
} from "@/lib/server-tenant-data";
import { parseJsonBody } from "@/lib/validation";
import { idSchema, nonEmptyTrimmed, trimmedString } from "@/lib/validation/primitives";
import {
  fileExceedsUploadLimits,
  resolveUploadStorage,
} from "@/lib/upload-guard";
import { assertPaperWaiverScanUpload } from "@/lib/paper-waiver-scan";
import {
  buildStudentDocumentStoragePath,
  createStudentDocumentSignedUploadUrl,
  createStudentDocumentUploadTicket,
  isStudentDocumentUploadConfigured,
} from "@/lib/student-document-storage";

export const runtime = "nodejs";

const bodySchema = z.object({
  studentId: idSchema,
  fileName: nonEmptyTrimmed(1, 260),
  mimeType: trimmedString(120),
  size: z.number().int().positive(),
  folder: trimmedString(120),
  kind: z.enum(["upload", "paper-waiver"]).default("upload"),
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

  const { studentId, fileName, mimeType, size, folder, kind } = parsed.data;
  if (fileExceedsUploadLimits({ size })) {
    return NextResponse.json(
      { ok: false, error: "FILE_TOO_LARGE" },
      { status: 413 }
    );
  }

  const resolved =
    kind === "paper-waiver"
      ? assertPaperWaiverScanUpload({ name: fileName, mimeType, size })
      : resolveUploadStorage({ name: fileName, mimeType, size });
  if (!resolved.ok) {
    const status = resolved.error === "FILE_TOO_LARGE" ? 413 : 400;
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status }
    );
  }

  const ctx = buildMemberAccessContext(auth.session);
  const allowed = await assertMemberCanAccessStudent(studentId, ctx);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "STUDENT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const storagePath = buildStudentDocumentStoragePath({
    institutionId: auth.session.institutionId,
    studentId,
    fileName,
  });
  if (!storagePath) {
    return NextResponse.json(
      { ok: false, error: "FILE_TYPE_NOT_ALLOWED" },
      { status: 400 }
    );
  }

  const signed = await createStudentDocumentSignedUploadUrl(storagePath);
  if (!signed.ok) {
    return NextResponse.json(
      { ok: false, error: "לא ניתן ליצור קישור העלאה" },
      { status: 503 }
    );
  }

  const uploadTicket = createStudentDocumentUploadTicket({
    institutionId: auth.session.institutionId,
    studentId,
    storagePath,
    fileName,
    mimeType: resolved.mimeType,
    size,
    folder: folder.trim() || "כללי",
    kind,
    userId: auth.session.userId,
  });

  return NextResponse.json({
    ok: true,
    signedUrl: signed.signedUrl,
    storagePath,
    uploadTicket,
  });
}
