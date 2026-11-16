import { NextResponse } from "next/server";
import { notifyProblemReportStatus } from "@/lib/problem-report/status-notify";
import { normalizeTzavtaTicketId } from "@/lib/problem-report/ticket-id";
import { problemReportStatusAuthorized } from "@/lib/problem-report/webhook-auth";
import { parseJsonBody, problemReportStatusBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Tzavta (or the team) calls this after a ticket status change so the
 * reporter gets an email. Auth: Authorization: Bearer TZAVTA_STATUS_WEBHOOK_SECRET.
 * Looks up the stored email via get_giti_bug_reporter — never reads `bugs`.
 */
export async function POST(request: Request) {
  if (!problemReportStatusAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, problemReportStatusBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const ticketId = normalizeTzavtaTicketId(parsed.data.ticketId);
  if (!ticketId) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const result = await notifyProblemReportStatus({
    ticketId,
    status: parsed.data.status,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    ticketId: result.ticketId,
    statusLabel: result.statusLabel,
  });
}
