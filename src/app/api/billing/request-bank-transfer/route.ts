import { NextResponse } from "next/server";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { loadBillingProfileForActiveInstitution } from "@/lib/billing/load-profile";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { requireTenantSession } from "@/lib/server-auth";

export async function POST() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  // TZ-17: Use active institution from session, not original profile.institution_id
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId, institutionId } = auth.session;
  const profile = await loadBillingProfileForActiveInstitution(userId, institutionId);
  if (!profile?.institution_id || !profile.plan_id) {
    return NextResponse.json({ error: "PLAN_REQUIRED" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("institutions")
      .update({
        payment_method: "bank_transfer",
        subscription_status: "pending_payment",
      })
      .eq("id", profile.institution_id);

    if (error) throw error;

    const updated = await loadBillingProfileForActiveInstitution(userId, institutionId);
    return updated
      ? NextResponse.json({ profile: updated })
      : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    console.error("[billing/request-bank-transfer]", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}
