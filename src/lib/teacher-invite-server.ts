import { createServiceClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/app-origin";
import {
  generateResetToken,
  hashResetToken,
} from "@/lib/password-reset";
import { TEACHER_INVITE_TTL_MS } from "@/lib/teacher-invite";
import { sendTeacherInviteEmail } from "@/lib/teacher-invite-email";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export async function assertTeacherInviteRateLimit(
  supabase: ReturnType<typeof createServiceClient>,
  bucket: string
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = Date.now();
  const { data: row, error } = await supabase
    .from("email_rate_limits")
    .select("window_start, hit_count")
    .eq("bucket_key", bucket)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { ok: true };
    }
    console.error("[teacher-invite] rate limit read:", error.message);
    return { ok: false, retryAfterSec: 60 };
  }

  let windowStart = now;
  let hitCount = 0;
  if (row?.window_start) {
    const prev = new Date(row.window_start as string).getTime();
    if (!Number.isNaN(prev) && now - prev < RATE_WINDOW_MS) {
      windowStart = prev;
      hitCount = Number(row.hit_count) || 0;
    }
  }

  if (hitCount >= RATE_LIMIT) {
    return {
      ok: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000)
      ),
    };
  }

  const { error: writeError } = await supabase.from("email_rate_limits").upsert(
    {
      bucket_key: bucket,
      window_start: new Date(windowStart).toISOString(),
      hit_count: hitCount + 1,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "bucket_key" }
  );

  if (writeError) {
    console.error("[teacher-invite] rate limit write:", writeError.message);
    return { ok: false, retryAfterSec: 60 };
  }
  return { ok: true };
}

/**
 * Revokes pending invites for the staff card, inserts a new token, and emails
 * the existing teacher-invite registration link.
 */
export async function createAndSendStaffInvite(args: {
  supabase: ReturnType<typeof createServiceClient>;
  request: Request;
  institutionId: string;
  staffCardId: string;
  email: string;
  teacherName: string;
  invitedByUserId: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: "INVITE_UNAVAILABLE" | "EMAIL_SEND_FAILED" }
> {
  const rawToken = generateResetToken();
  const tokenHash = await hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + TEACHER_INVITE_TTL_MS).toISOString();

  await args.supabase
    .from("teacher_invitations")
    .update({ status: "revoked" })
    .eq("student_id", args.staffCardId)
    .eq("institution_id", args.institutionId)
    .eq("status", "pending");

  const { error: insertError } = await args.supabase
    .from("teacher_invitations")
    .insert({
      institution_id: args.institutionId,
      student_id: args.staffCardId,
      email: args.email,
      teacher_name: args.teacherName,
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_user_id: args.invitedByUserId,
    });

  if (insertError) {
    console.error("[teacher-invite] insert:", insertError.message);
    return { ok: false, error: "INVITE_UNAVAILABLE" };
  }

  const inviteUrl = `${appOrigin(args.request)}/register/invite?token=${rawToken}`;
  const { sent } = await sendTeacherInviteEmail({
    to: args.email,
    teacherName: args.teacherName,
    inviteUrl,
  });

  if (!sent) {
    return { ok: false, error: "EMAIL_SEND_FAILED" };
  }

  return { ok: true };
}
