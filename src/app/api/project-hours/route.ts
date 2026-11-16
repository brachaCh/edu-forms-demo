import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  createServiceClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import {
  serverAddHours,
  serverDeductHours,
  serverFetchProjectHours,
  serverResetHours,
  serverUpdateHoursTotals,
} from "@/lib/server-project-hours";
import { hoursRequestSchema, parseJsonBody } from "@/lib/validation";

/** ניסיונות סיסמה כושלים לכל IP */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;

/** שגיאות שה-RPC מרים ביודעין — מוצגות למשתמשת כפי שהן */
const BUSINESS_ERRORS = [
  "אין מספיק שעות במאגר",
  "מאגר השעות לא הוגדר",
  "מאגר שעות לא תקין",
  "כמות השעות חייבת להיות מספר חיובי",
];

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  ).slice(0, 128);
}

function passwordMatches(candidate: string): boolean {
  const expected = process.env.HOURS_WIDGET_PASSWORD?.trim();
  if (!expected) return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** חלון מתגלגל על ניסיונות כושלים. נספר רק כשהסיסמה שגויה. */
async function countFailedAttempt(
  bucket: string
): Promise<{ blocked: boolean; retryAfterSec: number }> {
  const supabase = createServiceClient();
  const now = Date.now();

  const { data: row, error } = await supabase
    .from("email_rate_limits")
    .select("window_start, hit_count")
    .eq("bucket_key", bucket)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache|Could not find the table/i.test(error.message)) {
      return { blocked: false, retryAfterSec: 0 };
    }
    console.error("[api/project-hours] rate limit read:", error.message);
    return { blocked: true, retryAfterSec: 60 };
  }

  let windowStart = now;
  let hitCount = 0;
  if (row?.window_start) {
    const prev = new Date(row.window_start as string).getTime();
    if (!Number.isNaN(prev) && now - prev < RATE_WINDOW_MS) {
      windowStart = prev;
      hitCount = Number(row.hit_count) || 0;
    }
  }

  const nextCount = hitCount + 1;
  await supabase.from("email_rate_limits").upsert(
    {
      bucket_key: bucket,
      window_start: new Date(windowStart).toISOString(),
      hit_count: nextCount,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "bucket_key" }
  );

  return {
    blocked: nextCount >= RATE_LIMIT,
    retryAfterSec: Math.max(
      1,
      Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000)
    ),
  };
}

async function isRateLimited(bucket: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("email_rate_limits")
    .select("window_start, hit_count")
    .eq("bucket_key", bucket)
    .maybeSingle();
  if (error || !data?.window_start) return false;

  const started = new Date(data.window_start as string).getTime();
  if (Number.isNaN(started) || Date.now() - started >= RATE_WINDOW_MS) {
    return false;
  }
  return (Number(data.hit_count) || 0) >= RATE_LIMIT;
}

function serverReady(): boolean {
  return isSupabaseConfiguredServer() && isServiceRoleConfigured();
}

function failed(error: unknown, context: string) {
  const message = error instanceof Error ? error.message : "HOURS_OP_FAILED";
  if (BUSINESS_ERRORS.some((known) => message.includes(known))) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  console.error(`[api/project-hours] ${context}:`, error);
  return NextResponse.json({ error: "HOURS_OP_FAILED" }, { status: 500 });
}

/** קריאה בלבד — הווידג'ט מציג את היתרה לכל מי שנכנס לאתר, כמו קודם. */
export async function GET() {
  if (!serverReady()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const data = await serverFetchProjectHours();
    return NextResponse.json({ data });
  } catch (error) {
    return failed(error, "GET");
  }
}

export async function POST(request: Request) {
  if (!serverReady()) {
    return NextResponse.json({ error: "SERVER_UNAVAILABLE" }, { status: 503 });
  }

  const parsed = await parseJsonBody(request, hoursRequestSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (!process.env.HOURS_WIDGET_PASSWORD?.trim()) {
    return NextResponse.json(
      { error: "HOURS_PASSWORD_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const bucket = `hours-widget:${clientIp(request)}`;
  if (await isRateLimited(bucket)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  if (!passwordMatches(body.password)) {
    const { blocked, retryAfterSec } = await countFailedAttempt(bucket);
    if (blocked) {
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfterSec },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 401 });
  }

  try {
    switch (body.op) {
      case "verify": {
        const data = await serverFetchProjectHours();
        return NextResponse.json({ data });
      }
      case "deduct": {
        const data = await serverDeductHours(body.pool, body.amount);
        return NextResponse.json({ data });
      }
      case "add": {
        const data = await serverAddHours(body.pool, body.amount);
        return NextResponse.json({ data });
      }
      case "updateTotals": {
        const data = await serverUpdateHoursTotals({
          management_total: body.management_total,
          programming_total: body.programming_total,
          extra_total: body.extra_total,
        });
        return NextResponse.json({ data });
      }
      case "reset": {
        const data = await serverResetHours();
        return NextResponse.json({ data });
      }
      default: {
        const _exhaustive: never = body;
        return NextResponse.json(
          { error: "UNKNOWN_OP", detail: String(_exhaustive) },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    return failed(error, body.op);
  }
}
