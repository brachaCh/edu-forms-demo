import { createServiceClient } from "@/lib/supabase/admin";

/** פעולות שנרשמות בלוג */
export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.register"
  | "institution.update"
  | "institution.transfer_ownership"
  | "institution.view"
  | "student.create"
  | "student.update"
  | "student.delete"
  | "student.list"
  | "staff.list_picker"
  | "staff.list_fill"
  | "student.view"
  | "document.upload"
  | "document.update"
  | "document.delete"
  | "document.list"
  | "waiver.paper_upload"
  | "waiver.paper_remove"
  | "waiver.paper_archive"
  | "document.purge_expired_archive"
  | "custom_field.create"
  | "custom_field.update"
  | "custom_field.delete"
  | "custom_field.list"
  | "form_fill.save"
  | "form_fill.complete"
  | "form_fill.delete"
  | "form_fill.view"
  | "form_fill.list"
  | "print.folder"
  | "print.form"
  | "signature.request"
  | "form_fill.request"
  | "teacher.invite"
  | "teacher.invite_accepted"
  | "staff_meeting.create"
  | "staff_meeting.invite"
  | "ai.fill_form"
  | "billing.select_plan";

export type AuditEntityType =
  | "user"
  | "institution"
  | "student"
  | "document"
  | "custom_field"
  | "form_fill"
  | "print"
  | "billing"
  | "staff_meeting";

export interface AuditLogRow {
  id: string;
  institution_id: string;
  actor_user_id: string | null;
  action: AuditAction | string;
  entity_type: AuditEntityType | string | null;
  entity_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogEntry extends AuditLogRow {
  actor_name: string | null;
  actor_email: string | null;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "התחברות למערכת",
  "auth.login_failed": "ניסיון התחברות כושל",
  "auth.logout": "התנתקות מהמערכת",
  "auth.register": "הרשמה חדשה",
  "institution.update": "עדכון פרטי מוסד",
  "institution.transfer_ownership": "העברת בעלות על המוסד",
  "institution.view": "צפייה בפרטי מוסד",
  "student.create": "יצירת תלמיד",
  "student.update": "עדכון תלמיד",
  "student.delete": "מחיקת תלמיד",
  "student.list": "צפייה ברשימת תלמידים",
  "staff.list_picker": "צפייה בצוות המוסד (בורר)",
  "staff.list_fill": "צפייה בצוות המוסד (שליחת מילוי)",
  "student.view": "צפייה בכרטיס תלמיד",
  "document.upload": "העלאת מסמך",
  "document.update": "עדכון מסמך",
  "document.delete": "מחיקת מסמך",
  "document.list": "צפייה במסמכי תלמיד",
  "waiver.paper_upload": "העלאת סריקת ויתור סודיות",
  "waiver.paper_remove": "הסרת סריקת ויתור סודיות",
  "waiver.paper_archive": "ארכוב סריקת ויתור סודיות",
  "document.purge_expired_archive": "מחיקת ארכיון שעבר 8 שנים",
  "custom_field.create": "הוספת שדה מותאם",
  "custom_field.update": "עדכון שדה מותאם",
  "custom_field.delete": "מחיקת שדה מותאם",
  "custom_field.list": "צפייה בשדות מותאמים",
  "form_fill.save": "שמירת טופס",
  "form_fill.complete": "שמירת טופס (הושלם)",
  "form_fill.delete": "מחיקת מילוי טופס",
  "form_fill.view": "צפייה בטופס תלמיד",
  "form_fill.list": "צפייה ברשימת טפסי תלמיד",
  "print.folder": "הדפסת תיקייה / תיק",
  "print.form": "הדפסת טופס",
  "signature.request": "שליחה לחתימה",
  "form_fill.request": "שליחת טופס למילוי",
  "form_view.send": "שליחה לצפייה",
  "ai.fill_form": "מילוי AI לטופס",
  "billing.select_plan": "בחירת חבילה",
  "teacher.invite": "הזמנת מורה",
  "teacher.invite_accepted": "קבלת הזמנה למוסד נוסף",
  "staff_meeting.create": "יצירת ישיבת צוות",
  "staff_meeting.invite": "הזמנה לישיבת צוות",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export interface InsertAuditLogInput {
  institutionId: string;
  actorUserId?: string | null;
  action: AuditAction | string;
  entityType?: AuditEntityType | string | null;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_META_KEYS =
  /^(password|token|secret|authorization|cookie|api[_-]?key|session|otp|hash)$/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** entity_id בעמודה הוא UUID — מחרוזת לא־תקינה → null */
export function asAuditEntityId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/** מסיר סיסמאות/טוקנים מ-metadata לפני כתיבה ללוג (צ'קליסט #18) */
export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown> | null
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_META_KEYS.test(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
    } else if (typeof value === "string" && value.length > 500) {
      out[key] = `${value.slice(0, 200)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** רישום לוג — לא זורק שגיאה כדי לא לשבור את הפעולה הראשית */
export async function insertAuditLog(input: InsertAuditLogInput): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("audit_log").insert({
      institution_id: input.institutionId,
      actor_user_id: input.actorUserId ?? null,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      summary: input.summary ?? null,
      metadata: sanitizeAuditMetadata(input.metadata),
    });
    if (error) console.error("[audit-log] insert failed:", error.message);
  } catch (error) {
    console.error("[audit-log] insert exception:", error);
  }
}

export interface FetchAuditLogsOptions {
  institutionId: string;
  limit?: number;
  offset?: number;
  action?: string | null;
}

export async function fetchAuditLogs(
  options: FetchAuditLogsOptions
): Promise<{ rows: AuditLogEntry[]; total: number }> {
  const supabase = createServiceClient();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .eq("institution_id", options.institutionId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.action) {
    query = query.eq("action", options.action);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AuditLogRow[];
  const actorIds = [
    ...new Set(rows.map((r) => r.actor_user_id).filter(Boolean)),
  ] as string[];

  const actorMap = new Map<string, { full_name: string; email: string }>();
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const actor of actors ?? []) {
      actorMap.set(String(actor.id), {
        full_name: String(actor.full_name ?? ""),
        email: String(actor.email ?? ""),
      });
    }
  }

  return {
    total: count ?? rows.length,
    rows: rows.map((row) => {
      const actor = row.actor_user_id
        ? actorMap.get(row.actor_user_id)
        : undefined;
      return {
        ...row,
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {},
        actor_name: actor?.full_name ?? null,
        actor_email: actor?.email ?? null,
      };
    }),
  };
}

/** מיפוי פעולות tenant API ללוג */
const MUTATING_TENANT_OPS = new Set([
  "insertStudent",
  "patchStudent",
  "removeStudent",
  "insertStudentDocument",
  "insertStudentFormArchiveSnapshot",
  "upsertPaperWaiverScan",
  "removePaperWaiverScan",
  "archivePaperWaiverScan",
  "removeStudentDocument",
  "updateStudentDocument",
  "insertStudentCustomField",
  "patchStudentCustomField",
  "removeStudentCustomField",
  "upsertStudentFormFill",
  "removeStudentFormFill",
]);

/** קריאת מידע רגיש — נרשם ללוג גישה */
const ACCESS_TENANT_OPS = new Set([
  "fetchStudents",
  "fetchInstitutionStaffForPicker",
  "fetchInstitutionStaffForFill",
  "fetchStudentDocuments",
  "fetchStudentDocumentData",
  "fetchStudentCustomFields",
  "fetchStudentFormFill",
  "fetchStudentFormFills",
  "fetchStudentFormFillById",
  "fetchInstitutionById",
]);

export function isMutatingTenantOp(op: string): boolean {
  return MUTATING_TENANT_OPS.has(op);
}

export function isAccessTenantOp(op: string): boolean {
  return ACCESS_TENANT_OPS.has(op);
}

export function buildTenantAccessAuditFromOp(
  op: string,
  body: Record<string, unknown>
): Omit<InsertAuditLogInput, "institutionId" | "actorUserId"> | null {
  switch (op) {
    case "fetchStudents":
      return {
        action: "student.list",
        entityType: "student",
        entityId: null,
        summary: "נצפתה רשימת תלמידים",
      };
    case "fetchInstitutionStaffForPicker":
      return {
        action: "staff.list_picker",
        entityType: "student",
        entityId: null,
        summary: "נצפתה רשימת צוות לבורר",
      };
    case "fetchInstitutionStaffForFill":
      return {
        action: "staff.list_fill",
        entityType: "student",
        entityId: null,
        summary: "נצפתה רשימת צוות לשליחת מילוי",
      };
    case "fetchStudentDocuments":
      return {
        action: "document.list",
        entityType: "student",
        entityId: asAuditEntityId(body.studentId),
        summary: "נצפו מסמכי תלמיד",
        metadata: { student_id: body.studentId ?? null },
      };
    case "fetchStudentDocumentData":
      return {
        action: "document.view",
        entityType: "document",
        entityId: asAuditEntityId(body.id),
        summary: "נצפה/הורד מסמך תלמיד",
        metadata: { document_id: body.id ?? null },
      };
    case "fetchStudentCustomFields":
      return {
        action: "custom_field.list",
        entityType: "student",
        entityId: asAuditEntityId(body.studentId),
        summary: "נצפו שדות מותאמים של תלמיד",
        metadata: { student_id: body.studentId ?? null },
      };
    case "fetchStudentFormFill":
      return {
        action: "form_fill.view",
        entityType: "student",
        entityId: asAuditEntityId(body.studentId),
        summary: `נצפה טופס: ${String(body.formId ?? "")}`,
        metadata: {
          student_id: body.studentId ?? null,
          form_id: body.formId ?? null,
        },
      };
    case "fetchStudentFormFillById":
      return {
        action: "form_fill.view",
        entityType: "form_fill",
        entityId: asAuditEntityId(body.fillId),
        summary: "נצפה מילוי טופס לפי מזהה",
        metadata: {
          student_id: body.studentId ?? null,
          fill_id: body.fillId ?? null,
        },
      };
    case "fetchStudentFormFills":
      return {
        action: "form_fill.list",
        entityType: "student",
        entityId: asAuditEntityId(body.studentId),
        summary: "נצפתה רשימת טפסי תלמיד",
        metadata: { student_id: body.studentId ?? null },
      };
    case "fetchInstitutionById":
      return {
        action: "institution.view",
        entityType: "institution",
        entityId: asAuditEntityId(body.id),
        summary: "נצפו פרטי מוסד",
      };
    default:
      return null;
  }
}

export function buildTenantAuditFromOp(
  op: string,
  body: Record<string, unknown>,
  result: unknown
): Omit<InsertAuditLogInput, "institutionId" | "actorUserId"> | null {
  switch (op) {
    case "insertStudent": {
      const student = result as { id?: string; full_name?: string } | undefined;
      return {
        action: "student.create",
        entityType: "student",
        entityId: student?.id ?? null,
        summary: student?.full_name
          ? `נוצר תלמיד: ${student.full_name}`
          : "נוצר תלמיד חדש",
      };
    }
    case "patchStudent": {
      const student = result as { id?: string; full_name?: string } | undefined;
      return {
        action: "student.update",
        entityType: "student",
        entityId: student?.id ?? String(body.id ?? ""),
        summary: student?.full_name
          ? `עודכן תלמיד: ${student.full_name}`
          : "עודכן כרטיס תלמיד",
      };
    }
    case "removeStudent":
      return {
        action: "student.delete",
        entityType: "student",
        entityId: String(body.id ?? ""),
        summary: "נמחק תלמיד",
      };
    case "insertStudentFormArchiveSnapshot":
    case "insertStudentDocument": {
      const doc = result as { id?: string; name?: string } | undefined;
      return {
        action: "document.upload",
        entityType: "document",
        entityId: doc?.id ?? null,
        summary: doc?.name ? `הועלה מסמך: ${doc.name}` : "הועלה מסמך",
      };
    }
    case "upsertPaperWaiverScan": {
      const doc = result as { id?: string } | undefined;
      const input = (body.doc ?? {}) as Record<string, unknown>;
      return {
        action: "waiver.paper_upload",
        entityType: "document",
        entityId: doc?.id ?? null,
        summary: "הועלתה סריקת ויתור סודיות",
        metadata: {
          student_id: input.student_id ?? null,
          paper_waiver: true,
        },
      };
    }
    case "removePaperWaiverScan":
      return {
        action: "waiver.paper_remove",
        entityType: "student",
        entityId: asAuditEntityId(body.studentId),
        summary: "הוסרה סריקת ויתור סודיות",
        metadata: { student_id: body.studentId ?? null, paper_waiver: true },
      };
    case "archivePaperWaiverScan":
      return {
        action: "waiver.paper_archive",
        entityType: "student",
        entityId: asAuditEntityId(body.studentId),
        summary: "סריקת ויתור סודיות הועברה לארכיון",
        metadata: { student_id: body.studentId ?? null, paper_waiver: true },
      };
    case "removeStudentDocument":
      return {
        action: "document.delete",
        entityType: "document",
        entityId: String(body.id ?? ""),
        summary: "נמחק מסמך",
      };
    case "updateStudentDocument": {
      const doc = result as {
        id?: string;
        name?: string;
        archived_at?: string | null;
      } | undefined;
      const patch = (body.patch ?? {}) as Record<string, unknown>;
      const archived =
        patch.archived_at !== undefined && patch.archived_at !== null;
      return {
        action: "document.update",
        entityType: "document",
        entityId: doc?.id ?? String(body.id ?? ""),
        summary: archived
          ? `ארכוב מסמך: ${doc?.name ?? ""}`.trim()
          : doc?.name
            ? `עודכן מסמך: ${doc.name}`
            : "עודכן מסמך",
        metadata: { patch },
      };
    }
    case "insertStudentCustomField": {
      const field = result as { id?: string; label?: string } | undefined;
      return {
        action: "custom_field.create",
        entityType: "custom_field",
        entityId: field?.id ?? null,
        summary: field?.label
          ? `נוסף שדה: ${field.label}`
          : "נוסף שדה מותאם",
      };
    }
    case "patchStudentCustomField": {
      const field = result as { id?: string; label?: string } | undefined;
      return {
        action: "custom_field.update",
        entityType: "custom_field",
        entityId: field?.id ?? String(body.id ?? ""),
        summary: field?.label
          ? `עודכן שדה: ${field.label}`
          : "עודכן שדה מותאם",
      };
    }
    case "removeStudentCustomField":
      return {
        action: "custom_field.delete",
        entityType: "custom_field",
        entityId: String(body.id ?? ""),
        summary: "נמחק שדה מותאם",
      };
    case "removeStudentFormFill":
      return {
        action: "form_fill.delete",
        entityType: "form_fill",
        entityId: String(body.id ?? ""),
        summary: "נמחק מילוי טופס",
      };
    case "upsertStudentFormFill": {
      const fill = result as {
        id?: string;
        form_id?: string;
        status?: string;
      } | undefined;
      const input = (body.input ?? {}) as Record<string, unknown>;
      const status = fill?.status ?? input.status ?? "draft";
      const completed = status === "completed";
      const saved = status === "saved";
      return {
        action: completed ? "form_fill.complete" : "form_fill.save",
        entityType: "form_fill",
        entityId: fill?.id ?? null,
        summary: completed
          ? `הושלם טופס: ${fill?.form_id ?? input.form_id ?? ""}`
          : saved
            ? `נשמר טופס שנשלח לחתימה: ${fill?.form_id ?? input.form_id ?? ""}`
            : `נשמרה טיוטת טופס: ${fill?.form_id ?? input.form_id ?? ""}`,
        metadata: {
          form_id: fill?.form_id ?? input.form_id ?? null,
          student_id: input.student_id ?? null,
          status,
        },
      };
    }
    default:
      return null;
  }
}
