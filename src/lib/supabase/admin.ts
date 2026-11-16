import { createClient } from "@supabase/supabase-js";
import { getDbSchema } from "./schema";

export function isServiceRoleConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function createServiceClientForSchema(schema: "public" | "dev") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SERVICE_ROLE_NOT_CONFIGURED");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: { schema },
  });
}

/** Client עם service_role — לשימוש בשרת בלבד (API routes). */
export function createServiceClient() {
  return createServiceClientForSchema(getDbSchema());
}

/** email_rate_limits קיימת רק ב-public, גם כששאר הטבלאות בסכמת dev. */
export function createPublicServiceClient() {
  return createServiceClientForSchema("public");
}
