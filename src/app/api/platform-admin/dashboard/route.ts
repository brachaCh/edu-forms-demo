import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { computeSubscriptionCounts } from "@/lib/platform-admin-dashboard";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import type { SubscriptionStatus } from "@/lib/supabase/types";

export async function GET() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = createServiceClient();

    const [institutionsResult, usersResult, subscriptionsResult] = await Promise.all([
      supabase.from("institutions").select("id", { count: "exact", head: true }),
      supabase.from("user_profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("institutions")
        .select("subscription_status, plan_expires_at"),
    ]);

    const counts = computeSubscriptionCounts(
      (subscriptionsResult.data ?? []).map((row) => ({
        subscription_status:
          (row.subscription_status as SubscriptionStatus | null) ?? null,
        plan_expires_at: (row.plan_expires_at as string | null) ?? null,
      }))
    );

    return NextResponse.json({
      counts: {
        totalInstitutions: institutionsResult.count ?? 0,
        totalUsers: usersResult.count ?? 0,
        ...counts,
      },
    });
  } catch (error) {
    console.error("[platform-admin/dashboard GET]", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
