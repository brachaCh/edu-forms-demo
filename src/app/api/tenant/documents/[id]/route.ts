import { after, NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/server-auth";
import { insertAuditLog } from "@/lib/audit-log";
import {
  tenantFetchStudentDocumentData,
  type MemberAccessContext,
} from "@/lib/server-tenant-data";
import { idSchema } from "@/lib/validation/primitives";
import { isTenantForbiddenError } from "@/lib/teacher-assignment";
import {
  DOCUMENT_PRINT_BYTES_MAX,
  resolvePrintPayloadBytes,
} from "@/lib/print-payload";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Print-only ceiling, just under Vercel's ~4.5MB function response cap.
 * View/download do not 413 here — uploads can already store ~4.4–4.5M char data URLs.
 */
export const DOCUMENT_DATA_URL_MAX_CHARS = 4_450_000;

function documentDataHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: documentDataHeaders({ "Content-Type": "application/json" }) }
  );
}

/**
 * Raw document payload (data URL) without a JSON wrapper.
 * Folder print loads one file at a time; wrapping multi-MB PDFs in
 * `{ data: { data_url } }` was hitting Vercel/JSON size limits (TZ-90).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return jsonError(auth.error, auth.status);
  }

  const { id: rawId } = await params;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    return jsonError("INVALID_DOCUMENT_ID", 400);
  }
  const id = parsedId.data;

  const { institutionId, userId, membershipRole, profile } = auth.session;
  const ctx: MemberAccessContext = {
    userId,
    institutionId,
    membershipRole,
    isAdmin: profile.is_admin === true,
    isDemo: userId === "demo-user",
  };

  try {
    const data = await tenantFetchStudentDocumentData(institutionId, id, ctx);

    if (!data?.data_url?.trim()) {
      return new NextResponse(null, {
        status: 404,
        headers: documentDataHeaders(),
      });
    }

    const requestUrl = new URL(request.url);
    const purpose = requestUrl.searchParams.get("purpose");
    const wantBytes = requestUrl.searchParams.get("format") === "bytes";

    if (wantBytes) {
      if (typeof data.size === "number" && data.size > DOCUMENT_PRINT_BYTES_MAX) {
        return jsonError("DOCUMENT_TOO_LARGE", 413);
      }
      const payload = await resolvePrintPayloadBytes(data.data_url);
      if (!payload?.bytes.length) {
        return jsonError("DOCUMENT_DECODE_FAILED", 422);
      }
      if (payload.bytes.byteLength > DOCUMENT_PRINT_BYTES_MAX) {
        return jsonError("DOCUMENT_TOO_LARGE", 413);
      }
      after(async () => {
        try {
          await insertAuditLog({
            institutionId,
            actorUserId: userId,
            action: "document.view",
            entityType: "document",
            entityId: id,
            summary: "נצפה/הורד מסמך תלמיד",
            metadata: { document_id: id, via: "bytes" },
          });
        } catch (err) {
          console.error("[api/tenant/documents] audit log failed", err);
        }
      });
      return new NextResponse(Buffer.from(payload.bytes), {
        status: 200,
        headers: documentDataHeaders({
          // Never advertise application/pdf here: some browsers / proxies
          // intercept that type. The real MIME travels in X-Document-Mime.
          "Content-Type": "application/octet-stream",
          "X-Document-Mime": payload.mime || "application/octet-stream",
          "X-Document-Bytes": String(payload.bytes.byteLength),
        }),
      });
    }

    if (
      purpose === "print" &&
      data.data_url.length > DOCUMENT_DATA_URL_MAX_CHARS
    ) {
      return jsonError("DOCUMENT_TOO_LARGE", 413);
    }

    after(async () => {
      try {
        await insertAuditLog({
          institutionId,
          actorUserId: userId,
          action: "document.view",
          entityType: "document",
          entityId: id,
          summary: "נצפה/הורד מסמך תלמיד",
          metadata: { document_id: id, via: "raw" },
        });
      } catch (err) {
        console.error("[api/tenant/documents] audit log failed", err);
      }
    });

    return new NextResponse(data.data_url, {
      status: 200,
      headers: documentDataHeaders({
        "Content-Type": "text/plain; charset=utf-8",
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DOCUMENT_READ_FAILED";
    const forbidden = isTenantForbiddenError(message);
    const notFound = message === "DOCUMENT_NOT_FOUND";
    console.error("[api/tenant/documents]", error);
    return jsonError(
      forbidden || notFound ? message : "DOCUMENT_READ_FAILED",
      forbidden ? 403 : notFound ? 404 : 500
    );
  }
}
