import { NextResponse } from "next/server";
import { assertAllowedAppOrigin } from "@/lib/app-request-origin";
import { requireAuthSession } from "@/lib/platform-admin";
import {
  consumeEmailRateLimit,
  openEmailRateLimitQuery,
} from "@/lib/email-rate-limit";
import {
  createPublicServiceClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  createSignedUploadUrl,
  verifyRecordingGrant,
  claimGrantNonce,
  isUploadTicketSecretConfigured,
  type AttachmentKind,
} from "@/lib/problem-report/attachments";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  recordingGrant: z.string().min(1),
});

function uploadRateLimitBucket(userId: string): string {
  return `problem-report-upload:${userId}`;
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
      { ok: false, error: "שירות ההעלאה אינו זמין כרגע" },
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
    uploadRateLimitBucket(userId)
  );
  if (!rate.ok && rate.reason === "limited") {
    return NextResponse.json(
      { ok: false, error: "יותר מדי בקשות העלאה. נסו שוב בעוד כמה דקות." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "שירות ההעלאה אינו זמין כרגע" },
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

  const grantResult = verifyRecordingGrant(body.recordingGrant, userId);
  if (!grantResult.ok) {
    return NextResponse.json(
      { ok: false, error: "אישור הקלטה לא תקין או שפג תוקפו" },
      { status: 403 }
    );
  }

  const { bugId, mime, nonce } = grantResult.grant;

  const result = await createSignedUploadUrl(
    bugId,
    "recording" as AttachmentKind,
    mime,
    userId
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "לא ניתן ליצור קישור העלאה" },
      { status: 500 }
    );
  }

  const gitiClient =
    isSupabaseConfiguredServer() && isServiceRoleConfigured()
      ? createPublicServiceClient()
      : null;
  const claimResult = await claimGrantNonce(nonce, gitiClient);
  if (!claimResult.ok) {
    if (claimResult.error === "already_used") {
      return NextResponse.json(
        { ok: false, error: "אישור הקלטה כבר נוצל" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "שירות ההעלאה אינו זמין כרגע" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    signedUrl: result.signedUrl,
    storagePath: result.storagePath,
    uploadTicket: result.uploadTicket,
  });
}
