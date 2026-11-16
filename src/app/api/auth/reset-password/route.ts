import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/password";
import { hashResetToken } from "@/lib/password-reset";
import { parseJsonBody, resetPasswordBodySchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, resetPasswordBodySchema);
  if (!parsed.ok) {
    // שמירה על קודי שגיאה שהפרונט מצפה להם
    const payload = (await parsed.response.clone().json()) as {
      error?: string;
      path?: string;
      message?: string;
    };
    if (payload.path === "password" || payload.message?.includes("8")) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    if (payload.error === "INVALID_BODY") {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }
  const { token, password } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "SERVER_AUTH_UNAVAILABLE" },
      { status: 503 }
    );
  }

  try {
    const supabase = createServiceClient();
    const tokenHash = await hashResetToken(token);

    const { data: row, error } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      console.error("[reset-password] lookup:", error.message);
      return NextResponse.json({ error: "RESET_FAILED" }, { status: 500 });
    }

    if (!row || row.used_at) {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
    }

    const expiresAt = new Date(row.expires_at as string).getTime();
    if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
      return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ password_hash: passwordHash })
      .eq("id", row.user_id);

    if (updateError) {
      console.error("[reset-password] update password:", updateError.message);
      return NextResponse.json({ error: "RESET_FAILED" }, { status: 500 });
    }

    const { revokeAllAuthSessionsForUser } = await import("@/lib/auth-sessions");
    await revokeAllAuthSessionsForUser(String(row.user_id));

    const usedAt = new Date().toISOString();
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: usedAt })
      .eq("id", row.id);

    // מבטלים אסימונים נוספים פתוחים לאותו משתמש
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: usedAt })
      .eq("user_id", row.user_id)
      .is("used_at", null);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reset-password]", error);
    return NextResponse.json({ error: "RESET_FAILED" }, { status: 500 });
  }
}
