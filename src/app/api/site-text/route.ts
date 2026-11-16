import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  serverFetchSiteTextOverrides,
  serverSaveSiteTextOverrides,
} from "@/lib/server-site-text";
import { parseJsonBody, siteTextWriteSchema } from "@/lib/validation";
import type { SiteTexts } from "@/lib/site-text";

function serverReady(): boolean {
  return isSupabaseConfiguredServer() && isServiceRoleConfigured();
}

/** קריאה פומבית — הכיתובים הם תוכן גלוי של האתר. */
export async function GET() {
  if (!serverReady()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const data = await serverFetchSiteTextOverrides();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[api/site-text] GET:", error);
    return NextResponse.json({ error: "SITE_TEXT_READ_FAILED" }, { status: 500 });
  }
}

/** כתיבה — מנהלת פלטפורמה בלבד (הכיתובים גלובליים לכל האתר). */
export async function PUT(request: Request) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, siteTextWriteSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await serverSaveSiteTextOverrides(parsed.data.texts as Partial<SiteTexts>);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/site-text] PUT:", error);
    return NextResponse.json({ error: "SITE_TEXT_WRITE_FAILED" }, { status: 500 });
  }
}

/** איפוס לברירת המחדל — מנהלת פלטפורמה בלבד. */
export async function DELETE() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    await serverSaveSiteTextOverrides({});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/site-text] DELETE:", error);
    return NextResponse.json({ error: "SITE_TEXT_WRITE_FAILED" }, { status: 500 });
  }
}
