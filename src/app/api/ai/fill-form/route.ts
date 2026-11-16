/**
 * מילוי טופס תיק תלמיד בעזרת Claude.
 * מיועד לטפסי תח"י ותיעוד תהליך למידה (כולל תכנון למידה יומי).
 * לא כולל טפסי מערכת שעות.
 */

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { TEMP_OPEN_ACCESS } from "@/lib/auth-mode";
import { insertAuditLog } from "@/lib/audit-log";
import { requireTenantSession } from "@/lib/server-auth";
import {
  AI_FILL_MAX_EXAMPLE_CHARS,
  AI_FILL_MAX_FIELDS,
  AI_FILL_MAX_NOTES_CHARS,
  runAiFormFill,
} from "@/lib/ai-fill-form-run";
import {
  categoryFolderSupportsAiFill,
  formSupportsAiFill,
} from "@/lib/form-ai-fill";
import { FORM_SCHEMAS } from "@/lib/form-schemas";
import {
  prepareFillFormForAnthropic,
  restoreFillFormFields,
} from "@/lib/ai-fill-form-privacy";
import { fillFormBodySchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

interface RateLimitEntry {
  minute: { windowStart: number; count: number };
  day: { windowStart: number; count: number };
}
const RATE_LIMIT_PER_MINUTE = 8;
const RATE_LIMIT_PER_DAY = 80;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
const rateLimitStore = new Map<string, RateLimitEntry>();

function consumeRateLimit(userId: string): "MINUTE" | "DAY" | null {
  const now = Date.now();
  const entry: RateLimitEntry = rateLimitStore.get(userId) ?? {
    minute: { windowStart: now, count: 0 },
    day: { windowStart: now, count: 0 },
  };
  if (now - entry.minute.windowStart >= MINUTE_MS) {
    entry.minute = { windowStart: now, count: 0 };
  }
  if (now - entry.day.windowStart >= DAY_MS) {
    entry.day = { windowStart: now, count: 0 };
  }
  if (entry.minute.count >= RATE_LIMIT_PER_MINUTE) return "MINUTE";
  if (entry.day.count >= RATE_LIMIT_PER_DAY) return "DAY";
  entry.minute.count += 1;
  entry.day.count += 1;
  rateLimitStore.set(userId, entry);
  return null;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  let rateLimitKey: string;
  if (session) {
    rateLimitKey = `fill:user:${session.userId}`;
  } else if (TEMP_OPEN_ACCESS) {
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      "anon";
    rateLimitKey = `fill:ip:${ip}`;
  } else {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const limited = consumeRateLimit(rateLimitKey);
  if (limited === "MINUTE") {
    return NextResponse.json(
      { error: "RATE_LIMIT_MINUTE" },
      { status: 429, headers: { "retry-after": "60" } }
    );
  }
  if (limited === "DAY") {
    return NextResponse.json(
      { error: "RATE_LIMIT_DAY" },
      { status: 429, headers: { "retry-after": "3600" } }
    );
  }

  const parsed = await parseJsonBody(request, fillFormBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const categoryFolder = body.categoryFolder ?? "";
  const formTitle = body.formTitle ?? "";
  const formId = body.formId ?? "";

  const schema = formId
    ? FORM_SCHEMAS.find((f) => f.id === formId)
    : undefined;

  const freeAccess = body.freeAccess === true;

  // מאשרים לפי סכמת הטופס (כולל שאלון הפניה), או לפי תיקייה כשאין formId.
  // בכניסה חופשית — רק שאלון הפניה.
  if (schema) {
    if (!formSupportsAiFill(schema, { freeAccess })) {
      return NextResponse.json({ error: "FORM_NOT_ALLOWED" }, { status: 403 });
    }
  } else if (freeAccess || !categoryFolderSupportsAiFill(categoryFolder)) {
    return NextResponse.json({ error: "FORM_NOT_ALLOWED" }, { status: 403 });
  }

  const rawFields = body.fields;
  if (rawFields.length === 0 || rawFields.length > AI_FILL_MAX_FIELDS) {
    return NextResponse.json({ error: "INVALID_FIELDS" }, { status: 400 });
  }

  const allowedKeys = new Set<string>();
  const fieldSummaries: Array<{
    key: string;
    label: string;
    type: string;
    options?: string[];
    hint?: string;
    currentValue?: string;
  }> = [];

  for (const f of rawFields) {
    const key = typeof f.key === "string" ? f.key.trim() : "";
    if (!key || key.length > 120) continue;
    if (allowedKeys.has(key)) continue;
    allowedKeys.add(key);
    const label =
      typeof f.label === "string" ? f.label.trim().slice(0, 200) : key;
    const type = typeof f.type === "string" ? f.type.trim().slice(0, 40) : "text";
    const options = Array.isArray(f.options)
      ? f.options
          .map((o) => (typeof o?.value === "string" ? o.value.trim() : ""))
          .filter(Boolean)
          .slice(0, 40)
      : undefined;
    const hint =
      typeof f.hint === "string" ? f.hint.trim().slice(0, 200) : undefined;
    const currentValue =
      typeof f.currentValue === "string"
        ? f.currentValue.trim().slice(0, 500)
        : undefined;
    fieldSummaries.push({
      key,
      label,
      type,
      options: options?.length ? options : undefined,
      hint,
      currentValue: currentValue || undefined,
    });
  }

  if (fieldSummaries.length === 0) {
    return NextResponse.json({ error: "INVALID_FIELDS" }, { status: 400 });
  }

  const prepared = prepareFillFormForAnthropic({
    studentName: body.studentName,
    freeAccess,
    teacherNotes: body.teacherNotes,
    exampleTemplate: body.exampleTemplate,
    studentContext:
      body.studentContext && typeof body.studentContext === "object"
        ? body.studentContext
        : undefined,
    fieldSummaries,
    maxNotesChars: AI_FILL_MAX_NOTES_CHARS,
    maxExampleChars: AI_FILL_MAX_EXAMPLE_CHARS,
  });

  const result = await runAiFormFill({
    formId,
    formTitle,
    categoryFolder,
    fieldSummaries: prepared.fields,
    teacherNotes: prepared.teacherNotes,
    exampleTemplate: prepared.exampleTemplate,
    studentContext: prepared.studentContext,
    extraSystemLines: prepared.promptLines,
    usePlaceholder: prepared.usesPlaceholder,
    refine: body.refine ?? false,
  });

  if (!result.ok) {
    if (result.error === "AI_UNAVAILABLE") {
      return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
    }
    if (result.error === "RATE_LIMIT_UPSTREAM") {
      return NextResponse.json({ error: "RATE_LIMIT_UPSTREAM" }, { status: 429 });
    }
    if (result.error === "TIMEOUT") {
      return NextResponse.json({ error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json(
      { error: "AI_FAILED", status: result.status || undefined },
      { status: 502 }
    );
  }

  const fields = restoreFillFormFields(
    result.fields,
    prepared.firstName,
    prepared.restoreMap,
    prepared.teacherLiterals
  );
  const payload: Record<string, unknown> = { fields };
  if (!IS_PRODUCTION && result.model) payload.model = result.model;
  if (session) {
    const auth = await requireTenantSession();
    if (auth.ok) {
      void insertAuditLog({
        institutionId: auth.session.institutionId,
        actorUserId: auth.session.userId,
        action: "ai.fill_form",
        entityType: "form_fill",
        summary: formTitle
          ? `מילוי AI: ${formTitle}`
          : `מילוי AI לטופס ${formId || categoryFolder}`,
        metadata: {
          form_id: formId || null,
          field_count: Object.keys(fields).length,
        },
      });
    }
  }
  return NextResponse.json(payload);
}
