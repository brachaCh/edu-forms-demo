import { createServiceClient } from "@/lib/supabase/admin";
import type { HoursPool, ProjectHours } from "@/lib/project-hours-store";

const PROJECT_HOURS_COLUMNS =
  "id, management_total, management_used, programming_total, programming_used, extra_total, extra_used" as const;

type ProjectHoursRowPick = {
  id: string;
  management_total: number | string;
  management_used: number | string;
  programming_total: number | string;
  programming_used: number | string;
  extra_total: number | string | null;
  extra_used: number | string | null;
};

function mapRow(row: ProjectHoursRowPick): ProjectHours {
  return {
    id: row.id,
    management_total: Number(row.management_total),
    management_used: Number(row.management_used),
    programming_total: Number(row.programming_total),
    programming_used: Number(row.programming_used),
    extra_total: Number(row.extra_total ?? 0),
    extra_used: Number(row.extra_used ?? 0),
  };
}

export async function serverFetchProjectHours(): Promise<ProjectHours> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("project_hours")
    .select(PROJECT_HOURS_COLUMNS)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("HOURS_ROW_MISSING");
  return mapRow(data as ProjectHoursRowPick);
}

/** ניכוי/החזרה אטומיים — דרך ה-RPC, כדי למנוע race condition וניכוי-יתר */
async function callHoursRpc(
  fn: "matoah_deduct_hours" | "matoah_add_hours",
  pool: HoursPool,
  amount: number
): Promise<ProjectHours> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc(fn, {
    p_pool: pool,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);
  return mapRow(data as ProjectHoursRowPick);
}

export function serverDeductHours(
  pool: HoursPool,
  amount: number
): Promise<ProjectHours> {
  return callHoursRpc("matoah_deduct_hours", pool, amount);
}

export function serverAddHours(
  pool: HoursPool,
  amount: number
): Promise<ProjectHours> {
  return callHoursRpc("matoah_add_hours", pool, amount);
}

export async function serverUpdateHoursTotals(totals: {
  management_total: number;
  programming_total: number;
  extra_total: number;
}): Promise<ProjectHours> {
  const current = await serverFetchProjectHours();
  const supabase = createServiceClient();
  // השעות שנוצלו נשמרות כמו שהן — הורדת מכסה מתחת לניצול מוצגת כחריגה, לא מוחקת שעות
  const { data, error } = await supabase
    .from("project_hours")
    .update({
      management_total: totals.management_total,
      programming_total: totals.programming_total,
      extra_total: totals.extra_total,
    })
    .eq("id", current.id)
    .select(PROJECT_HOURS_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as ProjectHoursRowPick);
}

export async function serverResetHours(): Promise<ProjectHours> {
  const current = await serverFetchProjectHours();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("project_hours")
    .update({
      management_total: 0,
      management_used: 0,
      programming_total: 0,
      programming_used: 0,
      extra_total: 0,
      extra_used: 0,
    })
    .eq("id", current.id)
    .select(PROJECT_HOURS_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  const { error: logError } = await supabase
    .from("project_hours_log")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (logError) throw new Error(logError.message);

  return mapRow(data as ProjectHoursRowPick);
}
