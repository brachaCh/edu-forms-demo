import type { FormFillStatus } from "@/lib/supabase/types";

const STATUS_RANK: Record<FormFillStatus, number> = {
  draft: 0,
  saved: 1,
  completed: 2,
};

export function formFillStatusLabel(status: FormFillStatus): string {
  if (status === "completed") return "הושלם";
  if (status === "saved") return "נשמר";
  return "טיוטה";
}

/** לא מורידים סטטוס — טיוטה < נשמר < הושלם */
export function mergeFormFillStatus(
  existing: FormFillStatus | undefined,
  next: FormFillStatus
): FormFillStatus {
  if (!existing) return next;
  return STATUS_RANK[next] >= STATUS_RANK[existing] ? next : existing;
}

/** אחרי שליחה להורים לחתימה — נשמר במערכת, לא טיוטה */
export function formFillStatusAfterParentSignatureSend(
  current?: FormFillStatus
): FormFillStatus {
  return mergeFormFillStatus(current, "saved");
}
