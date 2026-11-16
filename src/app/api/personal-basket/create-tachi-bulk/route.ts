import { NextResponse } from "next/server";
import { z } from "zod";
import { insertAuditLog } from "@/lib/audit-log";
import { requireTenantSession } from "@/lib/server-auth";
import {
  assertMemberCanAccessStudent,
  buildMemberAccessContext,
  tenantFetchStudentFormFills,
  tenantUpsertStudentFormFill,
} from "@/lib/server-tenant-data";
import { parseJsonBody } from "@/lib/validation";
import type { TachiBulkCreateResult } from "@/lib/personal-basket-tachi-bulk";

export const runtime = "nodejs";

const domainRowSchema = z.object({
  domain: z.string().min(1).max(200),
  mainGoal: z.string().max(2000).optional().default(""),
  partners: z.string().max(2000).optional().default(""),
});

const requestBodySchema = z.object({
  studentId: z.string().uuid(),
  domainRows: z.array(domainRowSchema).min(1).max(30),
});

export async function POST(request: Request) {
  const auth = await requireTenantSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const parsed = await parseJsonBody(request, requestBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "נתוני הבקשה אינם תקינים" },
      { status: 400 }
    );
  }

  const { studentId, domainRows } = parsed.data;
  const ctx = buildMemberAccessContext(auth.session);

  const canAccess = await assertMemberCanAccessStudent(studentId, ctx);
  if (!canAccess) {
    return NextResponse.json(
      { ok: false, error: "אין הרשאה לתלמיד זה" },
      { status: 403 }
    );
  }

  const result: TachiBulkCreateResult = { created: [], skipped: [] };
  let partialError: string | null = null;

  try {
    const existingFills = await tenantFetchStudentFormFills(
      auth.session.institutionId,
      studentId,
      ctx
    );

    const existingTachiDomains = new Set<string>();
    for (const fill of existingFills) {
      if (fill.form_id === "tachi") {
        const domain = (fill.data?.domain ?? "").trim().toLowerCase();
        if (domain) {
          existingTachiDomains.add(domain);
        }
      }
    }

    for (const row of domainRows) {
      const normalizedDomain = row.domain.trim().toLowerCase();
      if (existingTachiDomains.has(normalizedDomain)) {
        result.skipped.push(row.domain);
        continue;
      }

      try {
        await tenantUpsertStudentFormFill(
          auth.session.institutionId,
          {
            createNew: true,
            student_id: studentId,
            form_id: "tachi",
            data: {
              domain: row.domain,
              main_goal: row.mainGoal,
            },
            status: "draft",
          },
          ctx
        );

        result.created.push(row.domain);
        existingTachiDomains.add(normalizedDomain);
      } catch (insertErr) {
        console.error("[create-tachi-bulk] insert failed:", row.domain, insertErr);
        partialError = `שגיאה ביצירת תח״י לתחום «${row.domain}»`;
        break;
      }
    }

    if (result.created.length > 0) {
      await insertAuditLog({
        institutionId: auth.session.institutionId,
        actorUserId: auth.session.userId,
        action: "form_fill.bulk_create",
        entityType: "student",
        entityId: studentId,
        summary: `נוצרו ${result.created.length} תח״י מכרטיס סל אישי`,
        metadata: {
          created: result.created,
          skipped: result.skipped,
          partialError: partialError ?? undefined,
        },
      });
    }

    if (partialError) {
      return NextResponse.json({
        ok: false,
        error: partialError,
        ...result,
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[create-tachi-bulk]", err);
    if (result.created.length > 0) {
      return NextResponse.json({
        ok: false,
        error: "שגיאה ביצירת התח״י — חלק נוצרו בהצלחה",
        ...result,
      });
    }
    return NextResponse.json(
      { ok: false, error: "שגיאה ביצירת התח״י" },
      { status: 500 }
    );
  }
}
