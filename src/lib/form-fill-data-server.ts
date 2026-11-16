import type { createServiceClient } from "@/lib/supabase/admin";
import { asStringRecord } from "@/lib/form-fill-public-data";

type ServiceClient = ReturnType<typeof createServiceClient>;

function isMissingFunction(message: string): boolean {
  return /Could not find the function|function .* does not exist|schema cache|PGRST202/i.test(
    message
  );
}

/**
 * מוסיף/מעדכן שדות ב-student_form_fills.data בלי לדרוס שדות אחרים.
 *
 * מעדיף את ה-RPC `matoah_merge_form_fill_data` (מיגרציה 054) שמבצע `data || patch`
 * בתוך UPDATE יחיד — בטוח לחתימות מקבילות. אם ה-RPC עדיין לא קיים במסד,
 * נופל לקריאה-מיזוג-כתיבה הישנה כדי לא לשבור סביבות שלא הריצו את המיגרציה.
 *
 * מחזיר false אם ה-fill לא נמצא.
 */
export async function mergeFormFillData(
  supabase: ServiceClient,
  formFillId: string,
  patch: Record<string, string>
): Promise<boolean> {
  if (Object.keys(patch).length === 0) return true;

  const { data, error } = await supabase.rpc("matoah_merge_form_fill_data", {
    p_fill_id: formFillId,
    p_patch: patch,
  });
  if (!error) return data === true;
  if (!isMissingFunction(error.message)) {
    throw new Error(error.message);
  }

  console.warn(
    "[form-fill-data] matoah_merge_form_fill_data missing — run migration 054; falling back to read-modify-write"
  );
  const { data: fill, error: loadError } = await supabase
    .from("student_form_fills")
    .select("data")
    .eq("id", formFillId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!fill) return false;

  const next = { ...asStringRecord(fill.data), ...patch };
  const { error: updateError } = await supabase
    .from("student_form_fills")
    .update({ data: next, updated_at: new Date().toISOString() })
    .eq("id", formFillId);
  if (updateError) throw new Error(updateError.message);
  return true;
}
