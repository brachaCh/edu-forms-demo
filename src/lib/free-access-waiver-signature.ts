/**
 * שליחת ויתור סודיות לחתימה בכניסה חופשית — מייל אמיתי למייל הסשן.
 */

import type { SignatureAssignment } from "@/lib/form-signature-request";
import { getDbSchema } from "@/lib/supabase/schema";

export async function sendFreeAccessWaiverForSignature(input: {
  email: string;
  formTitle: string;
  studentName: string;
  snapshotHtml: string;
  formData: Record<string, string>;
  assignments: SignatureAssignment[];
}): Promise<{ ok: boolean; fillId?: string; error?: string }> {
  try {
    const response = await fetch("/api/free-access/waiver-signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        dbSchema: getDbSchema(),
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      fillId?: string;
      error?: string;
    } | null;
    if (!response.ok || !body?.ok || !body.fillId) {
      return {
        ok: false,
        error: body?.error || "שליחת הבקשה לחתימה נכשלה",
      };
    }
    return { ok: true, fillId: body.fillId };
  } catch (err) {
    console.error("[free-access-waiver-signature]", err);
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? err.message
          : "שליחת הבקשה לחתימה נכשלה",
    };
  }
}

export async function pollFreeAccessWaiverSignatures(
  fillId: string
): Promise<{
  ok: boolean;
  data?: Record<string, string>;
  error?: string;
}> {
  try {
    const params = new URLSearchParams({
      fillId,
      dbSchema: getDbSchema(),
    });
    const response = await fetch(
      `/api/free-access/waiver-signature?${params.toString()}`
    );
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: Record<string, string>;
      error?: string;
    } | null;
    if (!response.ok || !body?.ok) {
      return {
        ok: false,
        error: body?.error || "טעינת החתימות נכשלה",
      };
    }
    return { ok: true, data: body.data ?? {} };
  } catch (err) {
    console.error("[free-access-waiver-signature] poll", err);
    return { ok: false, error: "טעינת החתימות נכשלה" };
  }
}
