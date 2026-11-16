/**
 * מילוי AI בדף קישור ציבורי (/fill/<token>).
 * מאומת רק בטוקן הקישור + סשן OTP של אותה בקשת מילוי.
 * לא טוען כרטיס תלמיד / טפסים אחרים / דוגמאות מוסד.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  prepareFillFormForAnthropic,
  restoreFillFormFields,
} from "@/lib/ai-fill-form-privacy";
import {
  AI_FILL_MAX_EXAMPLE_CHARS,
  AI_FILL_MAX_NOTES_CHARS,
  runAiFormFill,
} from "@/lib/ai-fill-form-run";
import {
  buildAiFillFieldDescriptors,
  currentFormDataFromAiFields,
  formSupportsPublicLinkAiFill,
} from "@/lib/form-ai-fill";
import { FORM_FILL_OTP_COOKIE, maskRecipientEmail } from "@/lib/form-fill-otp";
import {
  assertFormFillOtpRateLimit,
  clientIpFromRequest,
  hasValidFormFillOtpSession,
  loadPendingFormFillRequest,
  type FormFillRateLimitResult,
} from "@/lib/form-fill-otp-server";
import { getFormSchema } from "@/lib/form-schemas";
import { createServiceClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { formFillAiBodySchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

interface RateLimitEntry {
  minute: { windowStart: number; count: number };
  day: { windowStart: number; count: number };
}
const RATE_LIMIT_PER_MINUTE = 5;
const RATE_LIMIT_PER_DAY = 20;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
/**
 * Best-effort only on Vercel serverless (per-instance, not shared across
 * lambdas). Persisted `email_rate_limits` is the authoritative cap.
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

const PUBLIC_AI_REQUEST_LIMIT = 3;
const PUBLIC_AI_IP_LIMIT = 6;
const PUBLIC_AI_MAX_TOKENS = 4096;

function rateLimitBlockedResponse(
  result: Extract<FormFillRateLimitResult, { ok: false }>
) {
  const unavailable = result.unavailable === true;
  return NextResponse.json(
    {
      ok: false,
      error: unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED",
    },
    {
      status: unavailable ? 503 : 429,
      headers: { "retry-after": String(result.retryAfterSec) },
    }
  );
}

function consumeMemoryRateLimit(key: string): "MINUTE" | "DAY" | null {
  const now = Date.now();
  const entry: RateLimitEntry = rateLimitStore.get(key) ?? {
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
  rateLimitStore.set(key, entry);
  return null;
}

function otpRequired(maskedEmail?: string) {
  return NextResponse.json(
    { ok: false, error: "OTP_REQUIRED", maskedEmail: maskedEmail || "***" },
    { status: 401 }
  );
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, formFillAiBodySchema);
  if (!parsed.ok) return parsed.response;
  const { token, teacherNotes, refine } = parsed.data;

  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "השרת אינו מוגדר" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient();
  const fillRequest = await loadPendingFormFillRequest(supabase, token);
  const maskedEmail = fillRequest
    ? maskRecipientEmail(fillRequest.recipient_email)
    : "***";

  if (!fillRequest) {
    return NextResponse.json(
      { ok: false, error: "הקישור אינו תקין או שפג תוקפו" },
      { status: 404 }
    );
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(FORM_FILL_OTP_COOKIE)?.value ?? "";
  const sessionOk = await hasValidFormFillOtpSession(
    supabase,
    fillRequest.id,
    sessionToken
  );
  if (!sessionOk) {
    return otpRequired(maskedEmail);
  }

  const schema = getFormSchema(fillRequest.form_id);
  if (!schema || !formSupportsPublicLinkAiFill(schema)) {
    return NextResponse.json(
      { ok: false, error: "FORM_NOT_ALLOWED" },
      { status: 403 }
    );
  }

  const ip = clientIpFromRequest(request);
  try {
    // IP first: a blocked IP must not consume the per-link quota.
    const ipLimit = await assertFormFillOtpRateLimit(
      supabase,
      `form-fill-ai-ip:${ip}`,
      { limit: PUBLIC_AI_IP_LIMIT, failClosed: true }
    );
    if (!ipLimit.ok) {
      return rateLimitBlockedResponse(ipLimit);
    }
    const persistLimit = await assertFormFillOtpRateLimit(
      supabase,
      `form-fill-ai:${fillRequest.id}`,
      { limit: PUBLIC_AI_REQUEST_LIMIT, failClosed: true }
    );
    if (!persistLimit.ok) {
      return rateLimitBlockedResponse(persistLimit);
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503, headers: { "retry-after": "60" } }
    );
  }

  const memoryLimited = consumeMemoryRateLimit(`fill-ai:${fillRequest.id}`);
  if (memoryLimited === "MINUTE") {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT_MINUTE" },
      { status: 429, headers: { "retry-after": "60" } }
    );
  }
  if (memoryLimited === "DAY") {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT_DAY" },
      { status: 429, headers: { "retry-after": "3600" } }
    );
  }

  const currentData = currentFormDataFromAiFields(parsed.data.fields);
  const descriptors = buildAiFillFieldDescriptors(schema, currentData);
  if (descriptors.length === 0) {
    return NextResponse.json({ ok: false, error: "INVALID_FIELDS" }, { status: 400 });
  }

  const fieldSummaries = descriptors.map((descriptor) => {
    const currentValue = (currentData[descriptor.key] ?? "")
      .trim()
      .slice(0, 500);
    return {
      key: descriptor.key,
      label: descriptor.label,
      type: descriptor.type,
      options: descriptor.options?.map((option) => option.value),
      hint: descriptor.hint,
      currentValue: currentValue || undefined,
    };
  });

  const prepared = prepareFillFormForAnthropic({
    studentName: fillRequest.student_name,
    teacherNotes,
    fieldSummaries,
    maxNotesChars: AI_FILL_MAX_NOTES_CHARS,
    maxExampleChars: AI_FILL_MAX_EXAMPLE_CHARS,
  });

  const result = await runAiFormFill(
    {
      formId: fillRequest.form_id,
      formTitle: schema.title,
      categoryFolder: schema.categoryFolder,
      fieldSummaries: prepared.fields,
      teacherNotes: prepared.teacherNotes,
      extraSystemLines: prepared.promptLines,
      usePlaceholder: prepared.usesPlaceholder,
      refine: refine ?? false,
      // Never send studentContext, exampleTemplate, or student_name.
    },
    { maxTokens: PUBLIC_AI_MAX_TOKENS }
  );

  if (!result.ok) {
    if (result.error === "AI_UNAVAILABLE") {
      return NextResponse.json({ ok: false, error: "AI_UNAVAILABLE" }, { status: 503 });
    }
    if (result.error === "RATE_LIMIT_UPSTREAM") {
      return NextResponse.json({ ok: false, error: "RATE_LIMIT_UPSTREAM" }, { status: 429 });
    }
    if (result.error === "TIMEOUT") {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json(
      { ok: false, error: "AI_FAILED" },
      { status: 502 }
    );
  }

  const fields = restoreFillFormFields(
    result.fields,
    prepared.firstName,
    prepared.restoreMap,
    prepared.teacherLiterals
  );
  const payload: Record<string, unknown> = {
    ok: true,
    fields,
  };
  if (!IS_PRODUCTION && result.model) payload.model = result.model;
  return NextResponse.json(payload);
}
