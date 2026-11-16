import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit-log";
import { requireInstitutionOwner } from "@/lib/server-auth";
import { parseJsonBody, transferOwnershipBodySchema } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireInstitutionOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await parseJsonBody(request, transferOwnershipBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const targetId = parsed.data.user_id;
  if (targetId === auth.session.userId) {
    return NextResponse.json({ error: "SAME_USER" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const institutionId = auth.session.institutionId;

    // TZ-17: Find target by membership in user_institutions, not profile.institution_id
    // First try user_institutions table (post-migration)
    const { data: membership, error: membershipError } = await supabase
      .from("user_institutions")
      .select("user_id, role")
      .eq("user_id", targetId)
      .eq("institution_id", institutionId)
      .maybeSingle();

    // Pre-migration fallback: check user_profiles.institution_id
    let targetIsMember = false;
    if (membershipError && /does not exist|schema cache/i.test(membershipError.message)) {
      // Table doesn't exist yet - use profile fallback
      const { data: profileCheck } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", targetId)
        .eq("institution_id", institutionId)
        .maybeSingle();
      targetIsMember = !!profileCheck;
    } else if (membershipError) {
      throw membershipError;
    } else {
      targetIsMember = !!membership;
    }

    if (!targetIsMember) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // Get target name for audit log
    const { data: target, error: targetError } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .eq("id", targetId)
      .maybeSingle();
    if (targetError) throw targetError;

    // TZ-17: Update user_institutions.role - target becomes owner, previous owners become member
    const { error: grantRoleError } = await supabase
      .from("user_institutions")
      .update({ role: "owner" })
      .eq("user_id", targetId)
      .eq("institution_id", institutionId);

    // Ignore "table does not exist" errors (pre-migration fallback)
    if (grantRoleError && !/does not exist|schema cache/i.test(grantRoleError.message)) {
      throw grantRoleError;
    }

    const { error: revokeRoleError } = await supabase
      .from("user_institutions")
      .update({ role: "member" })
      .eq("institution_id", institutionId)
      .eq("role", "owner")
      .neq("user_id", targetId);

    if (revokeRoleError && !/does not exist|schema cache/i.test(revokeRoleError.message)) {
      throw revokeRoleError;
    }

    // Keep profile is_institution_owner flag in sync (backward compatibility)
    const { error: grantError } = await supabase
      .from("user_profiles")
      .update({ is_institution_owner: true })
      .eq("id", targetId);
    if (grantError) throw grantError;

    // Only revoke from profiles that belong to this institution
    // (pre-migration: institution_id check; post-migration: membership check)
    const { error: revokeError } = await supabase
      .from("user_profiles")
      .update({ is_institution_owner: false })
      .eq("institution_id", institutionId)
      .neq("id", targetId);
    if (revokeError) throw revokeError;

    const targetName =
      typeof target?.full_name === "string" && target.full_name.trim()
        ? target.full_name.trim()
        : "משתמש";

    void insertAuditLog({
      institutionId: institutionId,
      actorUserId: auth.session.userId,
      action: "institution.transfer_ownership",
      entityType: "user",
      entityId: targetId,
      summary: `הבעלות הועברה אל ${targetName}`,
      metadata: { target_user_id: targetId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[institutions/transfer-ownership]", error);
    return NextResponse.json({ error: "TRANSFER_FAILED" }, { status: 500 });
  }
}
