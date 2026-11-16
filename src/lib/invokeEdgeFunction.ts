import { createClient, isSupabaseConfigured } from "./supabase/client";
import { getDbSchema } from "./supabase/schema";

type InvokeResult = {
  ok?: boolean;
  error?: string;
  sentTo?: string[];
};

function parseFunctionBody(data: unknown): InvokeResult {
  if (!data || typeof data !== "object") return {};
  const body = data as InvokeResult;
  return {
    ok: body.ok,
    error: body.error,
    sentTo: Array.isArray(body.sentTo)
      ? body.sentTo.filter((e): e is string => typeof e === "string")
      : undefined,
  };
}

export async function invokeEdgeFunction(
  name: string,
  payload: Record<string, unknown>
): Promise<InvokeResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error:
        "חסר חיבור ל-Supabase. הוסיפו NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke(name, {
      body: { ...payload, dbSchema: getDbSchema() },
    });

    if (error) {
      const context = (error as { context?: Response }).context;
      if (context) {
        const status = context.status;
        const body = parseFunctionBody(await context.json().catch(() => null));
        if (body.error) return { ok: false, error: body.error };
        if (status === 429) {
          return {
            ok: false,
            error: "נשלחו יותר מדי הודעות. נסו שוב בעוד כמה דקות.",
          };
        }
      }
      return { ok: false, error: error.message || "שגיאת רשת או שרת" };
    }

    const body = parseFunctionBody(data);
    if (body.error && !body.ok) {
      return { ok: false, error: body.error };
    }
    if (!body.ok) {
      return { ok: false, error: "תגובה לא צפויה מהשרת" };
    }

    return { ok: true, sentTo: body.sentTo };
  } catch (err) {
    console.error(`[invokeEdgeFunction:${name}]`, err);
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? `שליחה נכשלה: ${err.message}`
          : "שליחה נכשלה — נסו שוב",
    };
  }
}
