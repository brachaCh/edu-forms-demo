import { NextResponse } from "next/server";
import { assertAllowedAppOrigin } from "@/lib/app-request-origin";
import { requireAuthSession } from "@/lib/platform-admin";
import {
  consumeEmailRateLimit,
  openEmailRateLimitQuery,
} from "@/lib/email-rate-limit";
import {
  confirmSignedUpload,
  isUploadTicketSecretConfigured,
  type AttachmentKind,
} from "@/lib/problem-report/attachments";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["recording"]),
  uploadTicket: z.string().min(1),
});

function confirmRateLimitBucket(userId: string): string {
  return `problem-report-confirm:${userId}`;
}

export async function POST(request: Request) {
  if (!assertAllowedAppOrigin(request).ok) {
    return NextResponse.json(
      { ok: false, error: "מקור בקשה לא מורשה" },
      { status: 403 }
    );
  }

  if (!isUploadTicketSecretConfigured()) {
    return NextResponse.json(
      { ok: false, error: "שירות האישור אינו זמין כרגע" },
      { status: 503 }
    );
  }

  const auth = await requireAuthSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "יש להתחבר" },
      { status: auth.status === 403 ? 403 : 401 }
    );
  }

  const userId = auth.session.userId;

  const rate = await consumeEmailRateLimit(
    openEmailRateLimitQuery(),
    confirmRateLimitBucket(userId)
  );
  if (!rate.ok && rate.reason === "limited") {
    return NextResponse.json(
      { ok: false, error: "יותר מדי בקשות אישור. נסו שוב בעוד כמה דקות." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "שירות האישור אינו זמין כרגע" },
      { status: 503 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await request.json();
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json(
      { ok: false, error: "פרמטרים לא תקינים" },
      { status: 400 }
    );
  }

  const result = await confirmSignedUpload(
    body.uploadTicket,
    userId,
    body.kind as AttachmentKind
  );

  if (!result.ok) {
    const errorMessages: Record<string, string> = {
      ticket_invalid_format: "טוקן אישור לא תקין",
      ticket_invalid_signature: "טוקן אישור לא תקין",
      ticket_expired: "טוקן אישור פג תוקף",
      ticket_user_mismatch: "טוקן אישור לא תואם למשתמש",
      invalid_path: "נתיב קובץ לא תקין",
      object_not_found: "הקובץ לא נמצא באחסון",
      file_too_large: "הקובץ גדול מדי",
      invalid_size: "גודל קובץ לא תקין",
      mime_mismatch: "סוג הקובץ לא תואם",
      invalid_file_content: "תוכן הקובץ לא תקין",
    };
    const message = errorMessages[result.error ?? ""] ?? "אישור ההעלאה נכשל";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
