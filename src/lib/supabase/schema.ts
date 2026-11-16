/** סכמת DB לפי סביבה: local → `dev`, prod → `public`. */
export type MatoahDbSchema = "public" | "dev";

export function getDbSchema(): MatoahDbSchema {
  return process.env.NEXT_PUBLIC_SUPABASE_SCHEMA === "dev" ? "dev" : "public";
}

export function parseDbSchema(value: unknown): MatoahDbSchema {
  return value === "dev" ? "dev" : "public";
}
