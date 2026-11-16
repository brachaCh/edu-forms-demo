import { NextResponse } from "next/server";
import type { z } from "zod";

export type ParseBodySuccess<T> = { ok: true; data: T };
export type ParseBodyFailure = {
  ok: false;
  response: NextResponse;
  message?: string;
};

/**
 * קורא JSON ומאמת מול סכמת Zod.
 * מחזיר 400 עם INVALID_BODY / VALIDATION_ERROR.
 */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ParseBodySuccess<z.infer<T>> | ParseBodyFailure> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first?.message ?? "Invalid input";
    return {
      ok: false,
      message,
      response: NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message,
          path: first?.path?.join(".") ?? "",
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
