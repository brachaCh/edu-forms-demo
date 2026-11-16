import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  parseTutorialInput,
  type TutorialAudience,
  type TutorialRecord,
} from "@/lib/tutorials";

function mapRow(row: Record<string, unknown>): TutorialRecord {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    url: String(row.url ?? ""),
    audience: (row.audience as TutorialAudience) ?? "all",
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = parseTutorialInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const update: Record<string, unknown> = {
      title: parsed.data.title,
      url: parsed.data.url,
      audience: parsed.data.audience,
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.sort_order !== undefined) {
      update.sort_order = parsed.data.sort_order;
    }

    const { data, error } = await supabase
      .from("tutorials")
      .update(update)
      .eq("id", id)
      .select("id, title, url, audience, sort_order, created_at, updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ tutorial: mapRow(data as Record<string, unknown>) });
  } catch (error) {
    console.error("[tutorials PATCH]", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("tutorials").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[tutorials DELETE]", error);
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  }
}
