/**
 * מחיקת מסמכי ארכיון ותלמידים בארכיון שעברו 8 שנים מ־archived_at.
 * להרצה מתוזמנת (Vercel Cron / קריאה ידנית עם Authorization: Bearer CRON_SECRET).
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit-log";
import { archiveRetentionCutoff } from "@/lib/archive-retention";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BATCH_SIZE = 200;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const supabase = createServiceClient();
  const cutoffIso = archiveRetentionCutoff().toISOString();

  const { data: expired, error } = await supabase
    .from("student_documents")
    .select("id, student_id, archived_at, name")
    .not("archived_at", "is", null)
    .lt("archived_at", cutoffIso)
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[cron/purge-expired-archive] select:", error.message);
    return NextResponse.json({ error: "SELECT_FAILED" }, { status: 500 });
  }

  const docs = expired ?? [];
  let deletedDocs = 0;

  if (docs.length > 0) {
    const ids = docs.map((d) => String(d.id));
    const studentIds = [
      ...new Set(docs.map((d) => String(d.student_id)).filter(Boolean)),
    ];

    const { data: students } = await supabase
      .from("students")
      .select("id, institution_id")
      .in("id", studentIds);

    const studentInstitution = new Map<string, string>();
    for (const s of students ?? []) {
      if (s.institution_id) {
        studentInstitution.set(String(s.id), String(s.institution_id));
      }
    }

    const byInstitution = new Map<string, number>();
    for (const doc of docs) {
      const inst = studentInstitution.get(String(doc.student_id));
      if (!inst) continue;
      byInstitution.set(inst, (byInstitution.get(inst) ?? 0) + 1);
    }

    const { error: deleteError } = await supabase
      .from("student_documents")
      .delete()
      .in("id", ids);

    if (deleteError) {
      console.error("[cron/purge-expired-archive] delete:", deleteError.message);
      return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
    }

    deletedDocs = ids.length;

    for (const [institutionId, count] of byInstitution) {
      void insertAuditLog({
        institutionId,
        actorUserId: null,
        action: "document.purge_expired_archive",
        entityType: "document",
        entityId: null,
        summary: `נמחקו ${count} מסמכי ארכיון שעברו 8 שנים`,
        metadata: { deleted: count, cutoff: cutoffIso },
      });
    }
  }

  let deletedStudents = 0;
  const { data: expiredStudents, error: studentsSelectError } = await supabase
    .from("students")
    .select("id, institution_id, full_name, archived_at")
    .not("archived_at", "is", null)
    .lt("archived_at", cutoffIso)
    .limit(BATCH_SIZE);

  if (studentsSelectError) {
    // עמודה עדיין לא קיימת / שגיאה — לא נכשלים את מחיקת המסמכים
    console.error(
      "[cron/purge-expired-archive] students select:",
      studentsSelectError.message
    );
  } else if (expiredStudents && expiredStudents.length > 0) {
    const byInstitution = new Map<string, number>();
    for (const row of expiredStudents) {
      const inst = row.institution_id ? String(row.institution_id) : null;
      if (!inst) continue;
      byInstitution.set(inst, (byInstitution.get(inst) ?? 0) + 1);
    }

    const studentIds = expiredStudents.map((s) => String(s.id));
    const { error: deleteStudentsError } = await supabase
      .from("students")
      .delete()
      .in("id", studentIds);

    if (deleteStudentsError) {
      console.error(
        "[cron/purge-expired-archive] students delete:",
        deleteStudentsError.message
      );
      return NextResponse.json(
        {
          ok: true,
          deleted: deletedDocs,
          deletedStudents: 0,
          cutoff: cutoffIso,
          warning: "STUDENT_DELETE_FAILED",
        },
        { status: 200 }
      );
    }

    deletedStudents = studentIds.length;

    for (const [institutionId, count] of byInstitution) {
      void insertAuditLog({
        institutionId,
        actorUserId: null,
        action: "student.delete",
        entityType: "student",
        entityId: null,
        summary: `נמחקו ${count} תיקי תלמידים מארכיון שעברו 8 שנים`,
        metadata: { deleted: count, cutoff: cutoffIso, source: "archive_purge" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: deletedDocs,
    deletedStudents,
    cutoff: cutoffIso,
  });
}
