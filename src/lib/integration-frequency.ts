import type { IntegrationFrequency } from "@/lib/supabase/types";

export const INTEGRATION_FREQUENCIES: IntegrationFrequency[] = ["high", "low"];

export function isIntegrationFrequency(
  value: string
): value is IntegrationFrequency {
  return value === "high" || value === "low";
}

/** שכיחות גבוהה כוללת גם תלמידים בלי הגדרה (תאימות לאחור) */
export function studentMatchesFrequency(
  frequency: IntegrationFrequency | null | undefined,
  target: IntegrationFrequency
): boolean {
  if (target === "low") return frequency === "low";
  return frequency !== "low";
}

export function normalizeIntegrationFrequency(
  value: string | null | undefined
): IntegrationFrequency | null {
  if (value === "high" || value === "low") return value;
  return null;
}
