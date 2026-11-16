/**
 * ניקוי תמלול קולי בעברית באמצעות Claude.
 * מקבל טקסט גולמי (מה-Web Speech API בדפדפן) ומחזיר טקסט מסודר עם פיסוק ומשפטים.
 * המפתח (ANTHROPIC_API_KEY) נשאר בשרת בלבד ולא נחשף ללקוח.
 *
 * מוגן ב:
 *  - אימות session (SESSION_COOKIE) — חייבים משתמש מחובר.
 *  - Rate limit לפי משתמש (30 בקשות בדקה + 300 ביום).
 *  - הגבלות אורך על הטקסט וה-fieldLabel.
 */

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { TEMP_OPEN_ACCESS } from "@/lib/auth-mode";
import {
  AI_NO_PII_SYSTEM_RULE,
  sanitizeFreeTextForAi,
} from "@/lib/ai-privacy";
import {
  STUDENT_PLACEHOLDER,
  prepareTranscriptForAi,
  restoreStudentFirstName,
} from "@/lib/ai-student-placeholder";
import {
  buildVoiceRefineContext,
  voiceRefinePromptLines,
  voiceRefineUsesPlaceholder,
  type VoiceRefineContext,
} from "@/lib/voice-refine-context";
import { parseJsonBody, refineTranscriptBodySchema } from "@/lib/validation";
import {
  PREFERRED_SONNET_MODELS,
  configuredTranscriptModel,
  isSonnetModel,
  resolveAnthropicModelsToTry,
} from "@/lib/anthropic-models";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INPUT_CHARS = 4000;
const MAX_FIELD_LABEL_CHARS = 120;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models?limit=100";
const ANTHROPIC_VERSION = "2023-06-01";

// עיבוד הקלטות משתמש רק ב-Sonnet: איכות טובה בלי עלות Opus.
// דגמים נוכחיים בלבד — ראו DEFAULT_ANTHROPIC_MODEL / ANTHROPIC_MODEL.

// ------- טיפוסים -------

interface RefineRequest {
  text?: string;
  fieldLabel?: string;
  studentName?: string;
  studentGender?: string;
  formId?: string;
  formTitle?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessagesResponse {
  content?: AnthropicContentBlock[];
  error?: { type?: string; message?: string };
}

interface AnthropicModel {
  id: string;
  display_name?: string;
  type?: string;
  created_at?: string;
}

interface AnthropicModelsResponse {
  data?: AnthropicModel[];
  error?: { type?: string; message?: string };
}

type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "API_ERROR" | "EMPTY" };

// ------- state ברמת מודול (זיכרון פרוצס) -------

/**
 * שם דגם עובד למפתח הנוכחי — מתגלה בפעם הראשונה שפנייה מצליחה
 * ונשמר בזיכרון עד שהתהליך יתחיל מחדש.
 */
let cachedWorkingModel: string | null = null;
let cachedAvailableModels: string[] | null = null;

/** Rate limit לפי userId — burst בדקה + מכסה יומית */
interface RateLimitEntry {
  minute: { windowStart: number; count: number };
  day: { windowStart: number; count: number };
}
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_PER_DAY = 300;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
const rateLimitStore = new Map<string, RateLimitEntry>();

/** מחזיר `null` אם עבר; אחרת מחזיר את סוג ההגבלה שנעברה */
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

// ------- ליבה -------

async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  if (cachedAvailableModels) return cachedAvailableModels;
  try {
    const res = await fetch(ANTHROPIC_MODELS_URL, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
    });
    if (!res.ok) {
      console.error(
        "[refine-transcript] /v1/models failed",
        res.status,
        await res.text().catch(() => "")
      );
      return [];
    }
    const body = (await res.json()) as AnthropicModelsResponse;
    const ids = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    cachedAvailableModels = ids;
    console.debug("[refine-transcript] available models:", ids.join(", "));
    return ids;
  } catch (error) {
    console.error("[refine-transcript] /v1/models threw", error);
    return [];
  }
}

function buildSystemPrompt(
  fieldLabel: string,
  ctx?: VoiceRefineContext
): string {
  const usePlaceholder = voiceRefineUsesPlaceholder(ctx);
  const context = fieldLabel
    ? `שם השדה בטופס: "${fieldLabel}". התאם את הניסוח לתוכן המצופה בשדה זה.`
    : "";
  const privacyRule = usePlaceholder
    ? "פרטיות: אסור לכלול או לבקש פרטים מזהים (שם מלא, ת.ז., טלפון, מייל, כתובת, שמות הורים/אנשי צוות). " +
      "אם מופיעים פרטים מזהים בקלט — התעלם מהם ואל תעתיק אותם לפלט."
    : AI_NO_PII_SYSTEM_RULE;
  const identityRule = usePlaceholder
    ? "אל תכלול שמות פרטיים או פרטים מזהים — גם אם נאמרו בתמלול."
    : "אל תכלול שמות פרטיים או פרטים מזהים — גם אם נאמרו בתמלול. השתמש ב«התלמיד» / «התלמידה» בלבד.";
  const thirdPersonRule = usePlaceholder
    ? `כתוב בגוף שלישי כשמדובר על התלמיד/ה (למשל '${STUDENT_PLACEHOLDER} מתקשה', '${STUDENT_PLACEHOLDER} מפגינה'), ובלשון הווה מקצועית.`
    : "כתוב בגוף שלישי כשמדובר על התלמיד/ה (למשל 'התלמיד מתקשה', 'התלמידה מפגינה'), ובלשון הווה מקצועית.";
  return [
    // תפקיד וקהל יעד
    "אתה עורך לשוני מקצועי המתמחה בניסוח מסמכים חינוכיים־טיפוליים עבור תיק תלמיד",
    "המיועד למשרד החינוך, למפקחים, לצוותי חינוך מיוחד ולוועדות זכאות ואפיון.",
    privacyRule,
    "קיבלת תמלול קולי גולמי בעברית של מורה, מחנכת, יועצת או מטפלת.",
    "תפקידך לנסח מחדש את התוכן כך שיהיה מוכן לצירוף למסמך רשמי של משרד החינוך.",
    //
    // מה לשמר
    "עקרון־על: שמר במלואה את המשמעות החינוכית־טיפולית, את המספרים ואת התאריכים הרלוונטיים שנאמרו.",
    identityRule,
    "אל תמציא מידע, אל תוסיף פרשנויות ואל תעלים תוכן חינוכי.",
    //
    // מה לתקן
    "נקה מהתמלול הגולמי: מילות מעבר וסימני מהוסה ('אה', 'אמ', 'כאילו', 'זהו', 'טוב', 'אז', חזרות),",
    "שגיאות תמלול ברורות, טעויות הקלדה ומילים כפולות רצופות.",
    "תקן פיסוק מלא (נקודות, פסיקים, שאלה, מירכאות במונחים מקצועיים), חלוקה למשפטים ולפסקאות קצרות וקריאות.",
    //
    // סגנון וניסוח
    "ניסוח: מקצועי, ענייני, שקול ומכובד — בגובה העיניים של איש חינוך.",
    thirdPersonRule,
    "העדף אוצר מילים חינוכי־טיפולי מקובל (למשל: 'מתקשה בוויסות', 'מפגין קשיי קשב', 'מגלה מוטיבציה',",
    "'זקוק לתיווך', 'מפתח מיומנויות חברתיות') על פני שפת דיבור.",
    "הימנע מסלנג, מאמירות שיפוטיות חדות, מתיוגים פוגעניים ומגוף ראשון של המורה אלא אם נאמר במפורש.",
    "התאם את מין הפעלים והתארים לשם המושא (תלמיד/תלמידה) לפי הרמזים בטקסט או לפי מגדר שסופק.",
    //
    // מבנה
    "אם התוכן ארוך — חלק לפסקאות לפי נושא (למשל: תיאור התנהגות, קשיים, חוזקות, המלצות).",
    "אם קיימת רשימת נקודות טבעית — הצג כרשימה עם מקפים בתחילת שורה.",
    //
    // פורמט הפלט
    "החזר אך ורק את הטקסט הערוך והמסוגנן בעברית, בלי כותרות, בלי מירכאות עוטפות,",
    "בלי הקדמות ('הנה הניסוח...'), בלי סיכומים ובלי הערות מתא הבינה המלאכותית.",
    context,
    ...voiceRefinePromptLines(ctx),
  ]
    .filter(Boolean)
    .join(" ");
}

// ------- POST -------

export async function POST(request: Request) {
  // 1) אימות משתמש — חייבים session תקף.
  //    כל עוד האפליקציה במצב TEMP_OPEN_ACCESS (ראה middleware) — הגישה
  //    לתיק תלמיד פתוחה בלי לוגין, ולכן גם ה-AI פתוח, אבל מוגבל לפי IP
  //    כדי למנוע ניצול לרעה.
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  let rateLimitKey: string;
  if (session) {
    rateLimitKey = `user:${session.userId}`;
  } else if (TEMP_OPEN_ACCESS) {
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      "anon";
    rateLimitKey = `ip:${ip}`;
  } else {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // 2) Rate limit לפי מפתח (משתמש או IP במצב זמני).
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

  // 3) פרסינג + ולידציה.
  const parsed = await parseJsonBody(request, refineTranscriptBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const scrubbedText = sanitizeFreeTextForAi(body.text, MAX_INPUT_CHARS);
  if (!scrubbedText) {
    return NextResponse.json({ error: "EMPTY_TEXT" }, { status: 400 });
  }

  const fieldLabel = (body.fieldLabel ?? "")
    .trim()
    .slice(0, MAX_FIELD_LABEL_CHARS);

  // שם התלמיד נשאר בשרת למיסוך/שחזור — לא נשלח למודל
  const refineContext = buildVoiceRefineContext({
    studentName: body.studentName,
    studentGender: body.studentGender,
    formId: body.formId,
    formTitle: body.formTitle,
  });
  const {
    textForModel: rawText,
    firstName,
    restoreMap,
    teacherLiterals,
  } = prepareTranscriptForAi(scrubbedText, body.studentName);

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
  }

  // 4) הכנת פנייה.
  const system = buildSystemPrompt(fieldLabel, refineContext);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  async function callMessages(model: string): Promise<Response> {
    return fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey as string,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: rawText }],
      }),
      signal: controller.signal,
    });
  }

  async function extractCleanedText(res: Response): Promise<ExtractResult> {
    const data = (await res.json()) as AnthropicMessagesResponse;
    if (data.error) {
      console.error("[refine-transcript] anthropic error body", data.error);
      return { ok: false, reason: "API_ERROR" };
    }
    const cleaned = (data.content ?? [])
      .filter(
        (block) => block.type === "text" && typeof block.text === "string"
      )
      .map((block) => block.text as string)
      .join("")
      .trim();
    if (!cleaned) return { ok: false, reason: "EMPTY" };
    return { ok: true, text: cleaned };
  }

  async function resolveModelsToTry(): Promise<string[]> {
    const discovered = await fetchAvailableModels(apiKey as string);
    return resolveAnthropicModelsToTry({
      cachedWorkingModel,
      configuredModels: [configuredTranscriptModel()],
      preferredCandidates: PREFERRED_SONNET_MODELS,
      discoveredIds: discovered,
      allow: isSonnetModel,
    });
  }

  const attemptErrors: string[] = [];

  try {
    const modelsToTry = await resolveModelsToTry();
    for (const model of modelsToTry) {
      const res = await callMessages(model);

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        attemptErrors.push(`${model} → ${res.status}`);
        console.error(
          "[refine-transcript] anthropic error",
          model,
          res.status,
          detail
        );
        // דגם לא זמין / לא מורשה — ננסה את הבא
        if (res.status === 404 || res.status === 403 || res.status === 400) {
          if (cachedWorkingModel === model) cachedWorkingModel = null;
          continue;
        }
        // 429 = rate limit מ-Anthropic — לא ניצור עומס נוסף
        if (res.status === 429) {
          return NextResponse.json(
            { error: "RATE_LIMIT_UPSTREAM" },
            { status: 429 }
          );
        }
        // שגיאת שרת זמנית על דגם אחד — נסה גיבוי; אם אין עוד — 502
        if (cachedWorkingModel === model) cachedWorkingModel = null;
        continue;
      }

      const extracted = await extractCleanedText(res);
      if (!extracted.ok) {
        if (extracted.reason === "API_ERROR") {
          return NextResponse.json(
            { error: "AI_REQUEST_FAILED" },
            { status: 502 }
          );
        }
        return NextResponse.json(
          { error: "AI_EMPTY_RESPONSE" },
          { status: 502 }
        );
      }

      // שמור את הדגם שעבד — הבקשה הבאה תדלג על גילוי.
      cachedWorkingModel = model;
      const text = restoreStudentFirstName(
        extracted.text,
        firstName,
        restoreMap,
        teacherLiterals
      );
      // בפרודקשן לא חושפים את שם הדגם ללקוח.
      const payload: Record<string, unknown> = { text };
      if (!IS_PRODUCTION) payload.model = model;
      return NextResponse.json(payload);
    }

    console.error(
      "[refine-transcript] all models failed",
      attemptErrors.join(", ")
    );
    return NextResponse.json(
      { error: "AI_MODEL_UNAVAILABLE", detail: attemptErrors },
      { status: 502 }
    );
  } catch (error) {
    const aborted =
      error instanceof DOMException && error.name === "AbortError";
    if (aborted) {
      return NextResponse.json({ error: "AI_TIMEOUT" }, { status: 504 });
    }
    console.error("[refine-transcript] unexpected", error);
    return NextResponse.json({ error: "AI_REQUEST_FAILED" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
