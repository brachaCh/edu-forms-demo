import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { isDemoUserId } from "@/lib/demo-data";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { USER_PROFILE_SELECT } from "@/lib/institution-owner";
import { AdminTextsEditor } from "@/components/admin/AdminTextsEditor";
import { PageShell } from "@/components/layout/PageShell";

export default async function AdminTextsPage() {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    redirect("/dashboard");
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const payload = await verifySessionToken(token);
  if (!payload || isDemoUserId(payload.userId)) {
    redirect("/dashboard");
  }

  const supabase = createServiceClient();
  const { data: user } = await supabase
    .from("user_profiles")
    .select(USER_PROFILE_SELECT)
    .eq("id", payload.userId)
    .maybeSingle();

  if (!user || !isPlatformAdminEmail((user as { email?: string | null }).email)) {
    redirect("/dashboard");
  }

  return (
    <PageShell>
      <AdminTextsEditor />
    </PageShell>
  );
}
