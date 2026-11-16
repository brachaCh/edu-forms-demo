import { after, NextResponse } from "next/server";
import { requireTenantSession, type TenantSession } from "@/lib/server-auth";
import { PlanLimitError } from "@/lib/plan-limits";
import {
  buildTenantAccessAuditFromOp,
  buildTenantAuditFromOp,
  insertAuditLog,
  isAccessTenantOp,
  isMutatingTenantOp,
} from "@/lib/audit-log";
import * as tenant from "@/lib/server-tenant-data";
import type { MemberAccessContext } from "@/lib/server-tenant-data";
import { parseJsonBody, tenantRequestSchema } from "@/lib/validation";
import type { Student } from "@/lib/supabase/types";
import { isTenantForbiddenError } from "@/lib/teacher-assignment";

/**
 * TZ-30: Check if the user is an admin (owner or admin role) of the ACTIVE institution.
 * Duplicated from server-auth to avoid circular import in some edge cases.
 */
function isAdminOfActiveInstitution(session: TenantSession): boolean {
  if (session.membershipRole === "owner" || session.membershipRole === "admin") {
    return true;
  }
  if (session.profile.is_admin === true) {
    return true;
  }
  if (
    session.membershipRole === null &&
    session.institutionId === session.profile.institution_id &&
    session.profile.is_institution_owner === true
  ) {
    return true;
  }
  return false;
}

/**
 * TZ-30: Strip admin-only fields from student patch if user is not an admin.
 * Returns the sanitized patch with sensitive fields removed.
 */
function sanitizeStudentPatchForRole(
  patch: Partial<Student>,
  isAdmin: boolean
): Partial<Student> {
  if (isAdmin) return patch;
  const { single_responsible_party: _dropped, ...safePatch } = patch;
  return safePatch;
}

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, tenantRequestSchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const op = body.op;
  const { institutionId, userId, membershipRole, profile } = auth.session;

  // TZ-28: Create member access context for scoped data access
  // Demo users and system admins (is_admin) get full access
  const isDemo = userId === "demo-user";
  const isAdmin = profile.is_admin === true;
  const ctx: MemberAccessContext = {
    userId,
    institutionId,
    membershipRole,
    isAdmin,
    isDemo,
  };

  // רישום ללוג נעשה אחרי שליחת התשובה (after) — לא מעכב את המשתמש.
  const logTenantOp = async (
    opName: string,
    result: unknown
  ): Promise<void> => {
    const bodyRecord = body as unknown as Record<string, unknown>;
    // ריענוני רקע (polling כל כמה שניות) לא נרשמים שוב — הצפייה הראשונה כבר נרשמה
    const quietRead = bodyRecord.quiet === true;
    const audit = isMutatingTenantOp(opName)
      ? buildTenantAuditFromOp(opName, bodyRecord, result)
      : isAccessTenantOp(opName) && !quietRead
        ? buildTenantAccessAuditFromOp(opName, bodyRecord)
        : null;
    if (!audit) return;
    after(async () => {
      try {
        await insertAuditLog({
          institutionId,
          actorUserId: userId,
          ...audit,
        });
      } catch (err) {
        console.error("[api/tenant/data] audit log failed", opName, err);
      }
    });
  };

  try {
    switch (body.op) {
      case "fetchStudents": {
        const data = await tenant.tenantFetchStudents(institutionId, ctx);
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "fetchInstitutionStaffForPicker": {
        const data = await tenant.tenantFetchInstitutionStaffForPicker(
          institutionId,
          ctx,
          body.category
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "fetchInstitutionStaffForFill": {
        const data = await tenant.tenantFetchInstitutionStaffForFill(
          institutionId,
          ctx,
          body.category
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "insertStudent": {
        // TZ-30: Only admins may set single_responsible_party on new students
        // Non-admins always get null (the default), regardless of what they send
        const isAdmin = isAdminOfActiveInstitution(auth.session);
        const studentData = isAdmin
          ? body.student
          : { ...body.student, single_responsible_party: null };
        const data = await tenant.tenantInsertStudent(
          institutionId,
          studentData,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "patchStudent": {
        // TZ-30: Only admins may set single_responsible_party
        const isAdmin = isAdminOfActiveInstitution(auth.session);
        const sanitizedPatch = sanitizeStudentPatchForRole(body.patch, isAdmin);
        const data = await tenant.tenantPatchStudent(
          institutionId,
          body.id,
          sanitizedPatch,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "removeStudent": {
        await tenant.tenantRemoveStudent(institutionId, body.id, ctx);
        await logTenantOp(op, null);
        return NextResponse.json({ ok: true });
      }
      case "fetchStudentDocuments": {
        const data = await tenant.tenantFetchStudentDocuments(
          institutionId,
          body.studentId,
          { includeData: body.includeData === true },
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "fetchStudentDocumentData": {
        const data = await tenant.tenantFetchStudentDocumentData(
          institutionId,
          body.id,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "insertStudentDocument": {
        const { isStudentDocumentStorageRef } = await import(
          "@/lib/student-document-storage-ref"
        );
        if (isStudentDocumentStorageRef(body.doc.data_url)) {
          return NextResponse.json(
            { error: "STORAGE_REF_NOT_ALLOWED" },
            { status: 400 }
          );
        }
        const { resolveUploadStorage } = await import("@/lib/upload-guard");
        const resolved = resolveUploadStorage({
          name: body.doc.name,
          mimeType: body.doc.mime_type,
          size: body.doc.size,
          dataUrl: body.doc.data_url,
        });
        if (!resolved.ok) {
          return NextResponse.json({ error: resolved.error }, { status: 400 });
        }
        const data = await tenant.tenantInsertStudentDocument(
          institutionId,
          {
            ...body.doc,
            mime_type: resolved.mimeType,
            data_url: resolved.dataUrl ?? body.doc.data_url,
          },
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "insertStudentFormArchiveSnapshot": {
        const { assertAllowedArchiveSnapshotUpload } = await import(
          "@/lib/upload-guard"
        );
        const gate = assertAllowedArchiveSnapshotUpload({
          name: body.doc.name,
          mimeType: body.doc.mime_type,
          size: body.doc.size,
          dataUrl: body.doc.data_url,
        });
        if (!gate.ok) {
          return NextResponse.json({ error: gate.error }, { status: 400 });
        }
        const data = await tenant.tenantInsertStudentDocument(
          institutionId,
          body.doc,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "upsertPaperWaiverScan": {
        const { isStudentDocumentStorageRef } = await import(
          "@/lib/student-document-storage-ref"
        );
        if (isStudentDocumentStorageRef(body.doc.data_url)) {
          return NextResponse.json(
            { error: "STORAGE_REF_NOT_ALLOWED" },
            { status: 400 }
          );
        }
        const { assertPaperWaiverScanUpload } = await import(
          "@/lib/paper-waiver-scan"
        );
        const resolved = assertPaperWaiverScanUpload({
          name: body.doc.name,
          mimeType: body.doc.mime_type,
          size: body.doc.size,
          dataUrl: body.doc.data_url,
        });
        if (!resolved.ok) {
          return NextResponse.json({ error: resolved.error }, { status: 400 });
        }
        const data = await tenant.tenantUpsertPaperWaiverScan(
          institutionId,
          {
            ...body.doc,
            mime_type: resolved.mimeType,
            data_url: resolved.dataUrl ?? body.doc.data_url,
          },
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "removePaperWaiverScan": {
        await tenant.tenantRemovePaperWaiverScan(
          institutionId,
          body.studentId,
          ctx
        );
        await logTenantOp(op, null);
        return NextResponse.json({ ok: true });
      }
      case "archivePaperWaiverScan": {
        await tenant.tenantArchivePaperWaiverScan(
          institutionId,
          body.studentId,
          ctx
        );
        await logTenantOp(op, null);
        return NextResponse.json({ ok: true });
      }
      case "removeStudentDocument": {
        await tenant.tenantRemoveStudentDocument(institutionId, body.id, ctx);
        await logTenantOp(op, null);
        return NextResponse.json({ ok: true });
      }
      case "updateStudentDocument": {
        const data = await tenant.tenantUpdateStudentDocument(
          institutionId,
          body.id,
          body.patch,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "fetchStudentCustomFields": {
        const data = await tenant.tenantFetchStudentCustomFields(
          institutionId,
          body.studentId,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "insertStudentCustomField": {
        const data = await tenant.tenantInsertStudentCustomField(
          institutionId,
          body.field,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "patchStudentCustomField": {
        const data = await tenant.tenantPatchStudentCustomField(
          institutionId,
          body.id,
          body.patch,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "removeStudentCustomField": {
        await tenant.tenantRemoveStudentCustomField(institutionId, body.id, ctx);
        await logTenantOp(op, null);
        return NextResponse.json({ ok: true });
      }
      case "fetchStudentFormFill": {
        const data = await tenant.tenantFetchStudentFormFill(
          institutionId,
          body.studentId,
          body.formId,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "fetchStudentFormFills": {
        const data = await tenant.tenantFetchStudentFormFills(
          institutionId,
          body.studentId,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "fetchStudentFormFillById": {
        const data = await tenant.tenantFetchStudentFormFillById(
          institutionId,
          body.studentId,
          body.fillId,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "upsertStudentFormFill": {
        const data = await tenant.tenantUpsertStudentFormFill(
          institutionId,
          body.input,
          ctx
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      case "removeStudentFormFill": {
        await tenant.tenantRemoveStudentFormFill(
          institutionId,
          body.id,
          ctx
        );
        await logTenantOp(op, null);
        return NextResponse.json({ ok: true });
      }
      case "fetchInstitutionById": {
        const data = await tenant.tenantFetchInstitutionById(
          institutionId,
          body.id
        );
        await logTenantOp(op, data);
        return NextResponse.json({ data });
      }
      default: {
        const _exhaustive: never = body;
        return NextResponse.json(
          { error: "UNKNOWN_OP", detail: String(_exhaustive) },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return NextResponse.json(
        {
          error: "PLAN_LIMIT_EXCEEDED",
          message: error.message,
          violation: error.violation,
        },
        { status: 403 }
      );
    }
    const message = error instanceof Error ? error.message : "TENANT_OP_FAILED";
    const notFound =
      message === "STUDENT_NOT_FOUND" ||
      message === "DOCUMENT_NOT_FOUND" ||
      message === "FIELD_NOT_FOUND" ||
      message === "FORM_FILL_NOT_FOUND";
    // TZ-28 / TZ-32: Member and admin permission errors return 403
    const forbidden = isTenantForbiddenError(message);
    const badRequest =
      message === "PAPER_WAIVER_TYPE_NOT_ALLOWED" ||
      message === "PAPER_WAIVER_ACTIVE_EXISTS" ||
      message === "PAPER_WAIVER_ARCHIVE_DELETE_BLOCKED" ||
      message === "PAPER_WAIVER_USE_ARCHIVE_OP" ||
      message === "FORM_FILL_SIGNED_DELETE_BLOCKED" ||
      message === "FORM_FILL_DELETE_NOT_ALLOWED";
    if (!badRequest) {
      console.error("[api/tenant/data]", op, error);
    }
    const documentReadOp =
      op === "fetchStudentDocumentData" || op === "fetchStudentDocuments";
    const clientError =
      forbidden || notFound
        ? message
        : documentReadOp
          ? "DOCUMENT_READ_FAILED"
          : message;
    return NextResponse.json(
      { error: clientError },
      { status: forbidden ? 403 : notFound ? 404 : badRequest ? 400 : 500 }
    );
  }
}
