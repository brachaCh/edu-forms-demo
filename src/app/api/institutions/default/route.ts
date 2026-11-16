/**
 * מזהה מוסד ברירת מחדל (code=default) — קריאה פומבית דרך service_role.
 * אחרי REVOKE על anon/authenticated אין גישה ישירה מהלקוח לטבלה.
 */

import { NextResponse } from "next/server";
import {
  createServiceClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

function serverReady(): boolean {
  return isSupabaseConfiguredServer() && isServiceRoleConfigured();
}

export async function GET() {
  if (!serverReady()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("institutions")
      .select("id")
      .eq("code", "default")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as { id: string } | null;
    return NextResponse.json({ data: { id: row?.id ?? null } });
  } catch (error) {
    console.error("[api/institutions/default] GET:", error);
    return NextResponse.json(
      { error: "DEFAULT_INSTITUTION_READ_FAILED" },
      { status: 500 }
    );
  }
}
