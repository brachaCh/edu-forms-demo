import { NextResponse } from "next/server";
import { fetchAuditLogs } from "@/lib/audit-log";
import { requireInstitutionAdmin } from "@/lib/server-auth";

export async function GET(request: Request) {
  const auth = await requireInstitutionAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const action = url.searchParams.get("action");

  try {
    const { rows, total } = await fetchAuditLogs({
      institutionId: auth.session.institutionId,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
      action,
    });
    return NextResponse.json({ rows, total });
  } catch (error) {
    console.error("[api/admin/audit-log]", error);
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }
}
