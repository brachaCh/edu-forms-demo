import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isPlatformAdminEmail, requirePlatformAdmin } from "@/lib/platform-admin";
import { requireLoggedInSession } from "@/lib/server-auth";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  filterTutorialsForViewer,
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

export async function GET() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requireLoggedInSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("tutorials")
      .select("id, title, url, audience, sort_order, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const items = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    const isAdmin = isPlatformAdminEmail(auth.session.profile.email);
    return NextResponse.json({
      tutorials: filterTutorialsForViewer(items, isAdmin),
    });
  } catch (error) {
    console.error("[tutorials GET]", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

  const parsed = parseTutorialInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    let sortOrder = parsed.data.sort_order;
    if (sortOrder === undefined) {
      const { data: last } = await supabase
        .from("tutorials")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      sortOrder = Number(last?.sort_order ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from("tutorials")
      .insert({
        title: parsed.data.title,
        url: parsed.data.url,
        audience: parsed.data.audience,
        sort_order: sortOrder,
      })
      .select("id, title, url, audience, sort_order, created_at, updated_at")
      .single();

    if (error || !data) throw error ?? new Error("INSERT_FAILED");
    return NextResponse.json({ tutorial: mapRow(data as Record<string, unknown>) });
  } catch (error) {
    console.error("[tutorials POST]", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}
