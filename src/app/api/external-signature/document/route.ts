import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  hasValidExternalSignatureOtpSession,
  loadPendingExternalSignatureRequest,
} from "@/lib/external-signature-otp-server";
import { fetchStudentDocumentObjectBytes } from "@/lib/student-document-storage";
import { parseStudentDocumentStorageRef } from "@/lib/student-document-storage-ref";
import { externalSignatureTokenBodySchema } from "@/lib/validation";
import { EXTERNAL_SIGNATURE_OTP_COOKIE } from "@/lib/external-signature-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const parsed = externalSignatureTokenBodySchema.safeParse({ token });
  if (!parsed.success) {
    return new NextResponse(null, {
      status: 400,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return new NextResponse(null, { status: 503 });
  }

  const supabase = createServiceClient();
  const sigRequest = await loadPendingExternalSignatureRequest(
    supabase,
    parsed.data.token
  );
  if (!sigRequest) {
    return new NextResponse(null, { status: 404 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(EXTERNAL_SIGNATURE_OTP_COOKIE)?.value ?? "";
  const sessionOk = await hasValidExternalSignatureOtpSession(
    supabase,
    sigRequest.id,
    sessionToken
  );
  if (!sessionOk) {
    return new NextResponse(null, { status: 401 });
  }

  const { data: doc, error: docError } = await supabase
    .from("student_documents")
    .select("id, data_url")
    .eq("id", sigRequest.document_id)
    .single();

  if (docError || !doc?.data_url) {
    return new NextResponse(null, { status: 404 });
  }

  const storageRef = parseStudentDocumentStorageRef(doc.data_url);
  if (!storageRef) {
    return new NextResponse(null, { status: 404 });
  }

  const payload = await fetchStudentDocumentObjectBytes(
    storageRef.storagePath,
    sigRequest.institution_id
  );
  if (!payload) {
    return new NextResponse(null, { status: 500 });
  }

  const safeName = sigRequest.document_name.replace(/["\r\n]/g, "").trim() || "document.pdf";
  return new NextResponse(new Uint8Array(payload.bytes), {
    status: 200,
    headers: {
      "Content-Type": payload.contentType,
      "Content-Length": String(payload.bytes.byteLength),
      "Content-Disposition": `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
