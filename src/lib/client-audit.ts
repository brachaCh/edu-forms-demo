import type { AuditAction, AuditEntityType } from "@/lib/audit-log";

/** רישום לוג מצד הלקוח — fire-and-forget, לא חוסם UI */
export function reportClientAudit(input: {
  action: AuditAction | string;
  entityType?: AuditEntityType | string | null;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  if (typeof window === "undefined") return;
  void fetch("/api/audit/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => {
    // לא מפריעים לפעולה הראשית אם הלוג נכשל
  });
}
