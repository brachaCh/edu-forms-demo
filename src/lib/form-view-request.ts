import { reportClientAudit } from "@/lib/client-audit";
import {
  resolveTableRowCount,
  tableCellKey,
} from "@/lib/form-table-grids";

export type ViewRecipientRole = "parent" | "homeroom" | "principal";

export interface ViewRecipient {
  email: string;
  role: ViewRecipientRole;
  enabled: boolean;
}

export interface PublicFormViewRequest {
  formTitle: string;
  studentName: string;
  snapshotHtml: string;
  expiresAt: string;
  status: "pending" | "viewed" | "expired" | "revoked";
}

export async function createFormViewRequest(input: {
  formFillId: string;
  formId: string;
  formTitle: string;
  studentName: string;
  studentId: string;
  snapshotHtml: string;
  recipients: Array<{ email: string; role: ViewRecipientRole }>;
}): Promise<{ ok: boolean; error?: string; sentCount?: number; failedRoles?: string[] }> {
  try {
    const response = await fetch("/api/view/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      sentCount?: number;
      failedRoles?: string[];
    } | null;
    if (payload?.ok) {
      reportClientAudit({
        action: "form_view.send",
        entityType: "form_fill",
        entityId: input.formFillId,
        summary: `נשלח לצפייה: ${input.formTitle} — ${input.studentName}`,
        metadata: {
          form_id: input.formId,
          form_fill_id: input.formFillId,
          recipient_count: input.recipients.length,
          roles: input.recipients.map((r) => r.role),
          failed_roles: payload.failedRoles,
        },
      });
      return {
        ok: true,
        sentCount: payload.sentCount,
        failedRoles: payload.failedRoles,
      };
    }
    if (response.status === 401) {
      return { ok: false, error: "יש להתחבר מחדש כדי לשלוח לצפייה" };
    }
    return {
      ok: false,
      error: payload?.error || "שליחת הטופס נכשלה — נסו שוב",
    };
  } catch (err) {
    console.error("[form-view-request]", err);
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? `שליחת הטופס נכשלה: ${err.message}`
          : "שליחת הטופס נכשלה — נסו שוב",
    };
  }
}

async function invokeViewPublic<T>(
  body: Record<string, unknown>
): Promise<{
  ok: boolean;
  data?: T;
  error?: string;
}> {
  try {
    const response = await fetch("/api/view/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      request?: T;
    } | null;
    if (!payload) {
      return { ok: false, error: "שגיאת שרת" };
    }
    if (payload.ok) {
      return { ok: true, data: payload.request };
    }
    return {
      ok: false,
      error: payload.error || "שגיאת שרת",
    };
  } catch {
    return { ok: false, error: "שגיאת רשת — בדקו חיבור לאינטרנט" };
  }
}

export function loadPublicFormView(token: string) {
  return invokeViewPublic<PublicFormViewRequest>({ action: "get", token });
}

export const VIEW_FORMS = ["weekly-schedule", "accommodations"] as const;
export type ViewFormId = (typeof VIEW_FORMS)[number];

export function isViewableForm(formId: string): formId is ViewFormId {
  return VIEW_FORMS.includes(formId as ViewFormId);
}

export function getViewRecipientRoles(
  formId: ViewFormId
): readonly ViewRecipientRole[] {
  if (formId === "weekly-schedule") {
    return ["parent", "homeroom", "principal"] as const;
  }
  if (formId === "accommodations") {
    return ["parent", "homeroom"] as const;
  }
  return [];
}

const PRINCIPAL_TEAM_ROLE_RE = /מנהל/;

/** שם מנהל/ת — משדה principal_name או משורת צוות בתפקיד מנהל */
export function resolvePrincipalStaffName(
  data: Record<string, string>,
  extraPools: Array<Record<string, string>> = []
): string {
  const fromField = String(data.principal_name ?? "").trim();
  if (fromField) return fromField;
  for (const pool of extraPools) {
    const rows = resolveTableRowCount("student-team", pool);
    for (let row = 0; row < rows; row += 1) {
      const role = String(
        pool[tableCellKey("student-team", row, "role")] ?? ""
      ).trim();
      if (!role || !PRINCIPAL_TEAM_ROLE_RE.test(role)) continue;
      const name = String(
        pool[tableCellKey("student-team", row, "name")] ?? ""
      ).trim();
      if (name) return name;
    }
  }
  return "";
}

export function getViewRecipientLabel(role: ViewRecipientRole): string {
  switch (role) {
    case "parent":
      return "הורים";
    case "homeroom":
      return "מחנכת";
    case "principal":
      return "מנהלת";
    default:
      return role;
  }
}
