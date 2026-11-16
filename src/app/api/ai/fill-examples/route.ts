/**
 * קריאה/כתיבה ל-ai_fill_examples_store דרך service_role בלבד.
 * אחרי REVOKE על anon/authenticated — אין גישה ישירה מהלקוח לטבלה.
 */

import { NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  aiFillExamplesScopeKeySchema,
  aiFillExamplesWriteSchema,
  parseJsonBody,
} from "@/lib/validation";
import type { TenantSession } from "@/lib/server-auth";

function allowedScopeKeys(session: TenantSession): Set<string> {
  const keys = new Set<string>([`institution:${session.institutionId}`]);
  const code = session.profile.institution_code?.trim();
  if (code) keys.add(`code:${code.toLowerCase()}`);
  return keys;
}

function scopeAllowed(session: TenantSession, scopeKey: string): boolean {
  return allowedScopeKeys(session).has(scopeKey);
}

export async function GET(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const raw = new URL(request.url).searchParams.get("scopeKey") ?? "";
  const parsed = aiFillExamplesScopeKeySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_SCOPE_KEY" }, { status: 400 });
  }
  const scopeKey = parsed.data;
  if (!scopeAllowed(auth.session, scopeKey)) {
    return NextResponse.json({ error: "FORBIDDEN_SCOPE" }, { status: 403 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("ai_fill_examples_store")
      .select("examples, updated_at")
      .eq("id", scopeKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ data: null });
    }
    const row = data as {
      examples: unknown;
      updated_at: string | null;
    };
    return NextResponse.json({
      data: {
        examples: Array.isArray(row.examples) ? row.examples : [],
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("[api/ai/fill-examples] GET:", error);
    return NextResponse.json(
      { error: "AI_FILL_EXAMPLES_READ_FAILED" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, aiFillExamplesWriteSchema);
  if (!parsed.ok) return parsed.response;

  const { scopeKey, examples } = parsed.data;
  if (!scopeAllowed(auth.session, scopeKey)) {
    return NextResponse.json({ error: "FORBIDDEN_SCOPE" }, { status: 403 });
  }

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("ai_fill_examples_store").upsert({
      id: scopeKey,
      examples,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/ai/fill-examples] PUT:", error);
    return NextResponse.json(
      { error: "AI_FILL_EXAMPLES_WRITE_FAILED" },
      { status: 500 }
    );
  }
}
