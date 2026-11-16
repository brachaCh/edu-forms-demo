import { createBrowserClient } from "@supabase/ssr";
import { getDbSchema } from "./schema";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (typeof window !== "undefined") {
      console.warn(
        "[Supabase] חסרים משתני סביבה: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. המערכת רצה במצב Mock."
      );
    }
  }

  return createBrowserClient(
    url ?? "https://placeholder.supabase.co",
    key ?? "placeholder-anon-key",
    {
      db: { schema: getDbSchema() },
    }
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
