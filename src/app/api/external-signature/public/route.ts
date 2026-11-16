import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { maskRecipientEmail } from "@/lib/form-fill-otp";
import {
  hasValidExternalSignatureOtpSession,
  loadPendingExternalSignatureRequest,
} from "@/lib/external-signature-otp-server";
import { parseStudentDocumentStorageRef } from "@/lib/student-document-storage-ref";
import { externalSignaturePublicBodySchema, parseJsonBody } from "@/lib/validation";
import { EXTERNAL_SIGNATURE_OTP_COOKIE } from "@/lib/external-signature-constants";

function otpRequired(maskedEmail?: string) {
  return NextResponse.json(
    { ok: false, error: "OTP_REQUIRED", maskedEmail: maskedEmail || "***" },
    { status: 401 }
  );
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, externalSignaturePublicBodySchema);
  if (!parsed.ok) return parsed.response;
  const { token } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "השרת אינו מוגדר" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();
  const sigRequest = await loadPendingExternalSignatureRequest(supabase, token);
  const maskedEmail = sigRequest
    ? maskRecipientEmail(sigRequest.recipient_email)
    : "***";

  if (!sigRequest) {
    return NextResponse.json(
      { ok: false, error: "הקישור אינו תקין או שפג תוקפו" },
      { status: 404 }
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(EXTERNAL_SIGNATURE_OTP_COOKIE)?.value ?? "";
  const sessionOk = await hasValidExternalSignatureOtpSession(
    supabase,
    sigRequest.id,
    sessionToken
  );
  if (!sessionOk) {
    return otpRequired(maskedEmail);
  }

  const { data: doc, error: docError } = await supabase
    .from("student_documents")
    .select("id, data_url")
    .eq("id", sigRequest.document_id)
    .single();

  if (docError || !doc?.data_url) {
    return NextResponse.json(
      { ok: false, error: "המסמך אינו זמין" },
      { status: 404 }
    );
  }

  const storageRef = parseStudentDocumentStorageRef(doc.data_url);
  if (!storageRef) {
    return NextResponse.json(
      { ok: false, error: "המסמך אינו זמין" },
      { status: 404 }
    );
  }

  const documentUrl = `/api/external-signature/document?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    ok: true,
    request: {
      id: sigRequest.id,
      documentName: sigRequest.document_name,
      signerLabel: sigRequest.signer_label,
      expiresAt: sigRequest.expires_at,
      documentUrl,
    },
  });
}
