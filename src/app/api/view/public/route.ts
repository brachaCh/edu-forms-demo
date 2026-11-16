import { NextResponse } from "next/server";
import { z } from "zod";
import { hashFormFillToken, FORM_FILL_TOKEN_RE } from "@/lib/form-fill-otp";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["get"]),
  token: z.string().regex(FORM_FILL_TOKEN_RE),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "פרטי הבקשה אינם תקינים" },
      { status: 400 }
    );
  }

  const { token } = parsed.data;
  const tokenHash = await hashFormFillToken(token);
  const supabase = createServiceClient();

  const { data: viewRequest, error: fetchError } = await supabase
    .from("form_view_requests")
    .select(
      "id, form_title, student_name, snapshot_html, expires_at, status"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (fetchError) {
    console.error("[view/public] fetch:", fetchError.message);
    return NextResponse.json(
      { ok: false, error: "שגיאת שרת" },
      { status: 500 }
    );
  }

  if (!viewRequest) {
    return NextResponse.json(
      { ok: false, error: "הקישור אינו תקין או פג תוקף" },
      { status: 404 }
    );
  }

  const now = new Date();
  const expiresAt = new Date(viewRequest.expires_at);
  const isExpired = now > expiresAt;

  if (viewRequest.status === "revoked") {
    return NextResponse.json(
      { ok: false, error: "הקישור בוטל" },
      { status: 410 }
    );
  }

  if (viewRequest.status === "expired" || isExpired) {
    if (viewRequest.status !== "expired") {
      await supabase
        .from("form_view_requests")
        .update({ status: "expired" })
        .eq("id", viewRequest.id);
    }
    return NextResponse.json(
      { ok: false, error: "פג תוקף הקישור" },
      { status: 410 }
    );
  }

  if (viewRequest.status === "pending") {
    await supabase
      .from("form_view_requests")
      .update({ status: "viewed" })
      .eq("id", viewRequest.id);
  }

  return NextResponse.json({
    ok: true,
    request: {
      formTitle: viewRequest.form_title,
      studentName: viewRequest.student_name,
      snapshotHtml: viewRequest.snapshot_html,
      expiresAt: viewRequest.expires_at,
      status: isExpired ? "expired" : viewRequest.status,
    },
  });
}
