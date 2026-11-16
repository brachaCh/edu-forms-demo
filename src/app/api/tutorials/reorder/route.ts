import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const orderedIds = Array.isArray(body.ordered_ids)
    ? body.ordered_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (orderedIds.length === 0) {
    return NextResponse.json({ error: "INVALID_ORDER" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from("tutorials")
        .update({ sort_order: i, updated_at: now })
        .eq("id", orderedIds[i]);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[tutorials/reorder PATCH]", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}
