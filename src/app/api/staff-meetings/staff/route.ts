import { NextResponse } from "next/server";
import { buildMemberAccessContext } from "@/lib/server-tenant-data";
import { requireInstitutionAdmin } from "@/lib/server-auth";
import { listInstitutionStaffForInvite } from "@/lib/staff-meetings-server";

/** רשימת אנשי צוות של המוסד — לבחירת מוזמנים. רק owner/admin. */
export async function GET() {
  const auth = await requireInstitutionAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const staff = await listInstitutionStaffForInvite(
      auth.session.institutionId,
      buildMemberAccessContext(auth.session)
    );
    return NextResponse.json({ staff });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOAD_FAILED";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("[staff-meetings/staff]", error);
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }
}
