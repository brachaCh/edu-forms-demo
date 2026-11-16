import { createServiceClient } from "@/lib/supabase/admin";
import type { SiteTexts } from "@/lib/site-text";

const SITE_TEXT_ROW_ID = "global";

export type SiteTextOverrides = {
  data: Partial<SiteTexts>;
  updatedAt: string | null;
};

export async function serverFetchSiteTextOverrides(): Promise<SiteTextOverrides | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("site_text_overrides")
    .select("data, updated_at")
    .eq("id", SITE_TEXT_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as {
    data: Partial<SiteTexts> | null;
    updated_at: string | null;
  };
  if (!row.data || Object.keys(row.data).length === 0) return null;
  return { data: row.data, updatedAt: row.updated_at };
}

export async function serverSaveSiteTextOverrides(
  texts: Partial<SiteTexts>
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("site_text_overrides").upsert({
    id: SITE_TEXT_ROW_ID,
    data: texts,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
