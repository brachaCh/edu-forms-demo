/**
 * חילוץ טקסט מקובץ דוגמה (txt / docx / pdf) לפני מילוי AI.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { TEMP_OPEN_ACCESS } from "@/lib/auth-mode";
import {
  decodeBase64ToBuffer,
  detectExampleFileKind,
  extractExampleTextFromBuffer,
  MAX_EXAMPLE_FILE_BYTES,
} from "@/lib/ai-example-extract";
import { extractExampleBodySchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session && !TEMP_OPEN_ACCESS) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, extractExampleBodySchema);
  if (!parsed.ok) return parsed.response;

  const fileName = parsed.data.fileName;
  const mimeType = parsed.data.mimeType ?? "";
  const contentBase64 = parsed.data.contentBase64;

  if (!fileName || !contentBase64) {
    return NextResponse.json({ error: "MISSING_FILE" }, { status: 400 });
  }

  const kind = detectExampleFileKind(fileName, mimeType);
  if (!kind) {
    return NextResponse.json(
      { error: "UNSUPPORTED_TYPE" },
      { status: 415 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = decodeBase64ToBuffer(contentBase64);
  } catch {
    return NextResponse.json({ error: "INVALID_BASE64" }, { status: 400 });
  }

  if (!buffer.length) {
    return NextResponse.json({ error: "EMPTY_FILE" }, { status: 400 });
  }
  if (buffer.length > MAX_EXAMPLE_FILE_BYTES) {
    return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
  }

  try {
    const text = await extractExampleTextFromBuffer(buffer, kind);
    if (!text) {
      return NextResponse.json({ error: "EMPTY_TEXT" }, { status: 422 });
    }
    return NextResponse.json({
      ok: true,
      text,
      fileName,
      kind,
      chars: text.length,
    });
  } catch (error) {
    console.error("[extract-example]", error);
    return NextResponse.json({ error: "EXTRACT_FAILED" }, { status: 500 });
  }
}
