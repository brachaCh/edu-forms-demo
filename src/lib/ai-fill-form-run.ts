/**
 * ליבת מילוי טופס בעזרת Claude — משותפת ל-/api/ai/fill-form (סשן צוות)
 * ול-/api/fill/ai (קישור מילוי ציבורי מאומת בטוקן).
 */

import {
  flattenAiFillPatch,
} from "@/lib/form-ai-fill";
import {
  AI_NO_PII_SYSTEM_RULE,
  isIdentifyingAiFieldKey,
  sanitizeAiFieldSummaries,
  sanitizeFreeTextForAi,
  sanitizeStudentContextForAi,
  type AiFieldSummary,
} from "@/lib/ai-privacy";
import { STUDENT_PLACEHOLDER } from "@/lib/ai-student-placeholder";
import {
  PREFERRED_CHAT_MODELS,
  configuredAnthropicModel,
  isChatModel,
  resolveAnthropicModelsToTry,
} from "@/lib/anthropic-models";

export const AI_FILL_MAX_FIELDS = 250;
export const AI_FILL_MAX_VALUE_CHARS = 4000;
export const AI_FILL_MAX_NOTES_CHARS = 2000;
export const AI_FILL_MAX_CONTEXT_CHARS = 4000;
export const AI_FILL_MAX_EXAMPLE_CHARS = 12_000;

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models?limit=100";
const ANTHROPIC_VERSION = "2023-06-01";

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
}

interface AnthropicModelsResponse {
  data?: AnthropicModel[];
}

let cachedWorkingModel: string | null = null;
let cachedAvailableModels: string[] | null = null;

export type AiFillFieldSummary = AiFieldSummary;

export type RunAiFormFillInput = {
  formId: string;
  formTitle: string;
  categoryFolder: string;
  fieldSummaries: AiFillFieldSummary[];
  teacherNotes?: string;
  exampleTemplate?: string;
  studentContext?: Record<string, string>;
  extraSystemLines?: string[];
  usePlaceholder?: boolean;
  refine?: boolean;
};

export type RunAiFormFillOptions = {
  maxTokens?: number;
};

const DEFAULT_AI_FILL_MAX_TOKENS = 8192;

export type RunAiFormFillResult =
  | { ok: true; fields: Record<string, string>; model?: string }
  | {
      ok: false;
      error: "AI_UNAVAILABLE" | "AI_FAILED" | "TIMEOUT" | "RATE_LIMIT_UPSTREAM";
      status?: number;
    };

function buildSystemPrompt(opts?: {
  isTachi?: boolean;
  isTachiIntegrative?: boolean;
  isPrep?: boolean;
  hasExample?: boolean;
  usePlaceholder?: boolean;
  extraLines?: string[];
  refine?: boolean;
}): string {
  const privacyRule = opts?.usePlaceholder
    ? "פרטיות: אסור לכלול או לבקש פרטים מזהים (שם מלא, ת.ז., טלפון, מייל, כתובת, שמות הורים/אנשי צוות). " +
      "אם מופיעים פרטים מזהים בקלט — התעלם מהם ואל תעתיק אותם לפלט."
    : AI_NO_PII_SYSTEM_RULE;
  const parts = [
    "אתה עוזר מקצועי למורות ולצוותי חינוך מיוחד בישראל.",
    "תפקידך להציע טיוטת מילוי לטופס תיק תלמיד.",
    privacyRule,
    "כתוב בעברית מקצועית, עניינית ומכבדת — בסגנון מסמכי משרד החינוך.",
    "מלא רק שדות שיש עליהם מידע מפורש בהקשר החינוכי, בהנחיות המורה או בדוגמה.",
    "אם חסר מידע לשדה — השאר אותו מחוץ לפלט (ריק). אל תנחש ואל תמציא.",
    "אל תמציא אבחונים, טיפולים שניתנו, תרופות, ציונים, תאריכים או עובדות שלא נמסרו.",
    "אל תמלא שדות חתימה או שדות מזהים (שם, ת.ז., טלפון, מייל, כתובת, שמות הורים). אל תחזיר מפתחות שלא הופיעו ברשימה.",
    opts?.refine
      ? "זו בקשת עדכון (refine) — עדכן גם שדות עם ערך קיים לפי ההנחיה. החזר את הערכים המעודכנים בפלט."
      : "לשדות עם ערך קיים — השאר ריק בפלט (לא לדרוס).",
    "לשדות select — החזר רק ערך value מהרשימה שסופקה.",
    "לטבלאות — מלא רק שורות שיש להן בסיס במידע שסופק; תאריכים בפורמט YYYY-MM-DD רק אם ידוע.",
  ];

  if (opts?.isPrep) {
    parts.push(
      "בטופס דף הכנה: התמקד רק בקוביות/שדות הטופס שברשימה.",
      "נסח מחדש רק מידע שמופיע בתיאור המורה או בהקשר התלמיד.",
      "אל תציע תוכנית עבודה, יעדים, דרכי הוראה או טיפולים שלא נמסרו.",
      "שדות בלי כיסוי בתיאור — השאר ריקים."
    );
  } else if (opts?.isTachiIntegrative) {
    parts.push(
      "בטופס תח\"י אינטגרטיבי: כתוב תוכנית עבודה לפי התחום שצוין.",
      "אם מולאו 'קו בסיס' (baseline) ו/או 'מטרות על' (main_goals) — השתמש בהם כבסיס.",
      "מלא את טבלת היעדים. אפשר להחזיר מפתחות tbl_tachi-integrative-goals_r0_goal וכו' לפי הרשימה,",
      "או מערך בשם goals ובו עד 4 אובייקטים עם המפתחות: goal, teacher, aide, other, formative, summative, notes.",
      "בעמודות teacher/aide/other כתוב דרכי הוראה מעשיות (מחנכת, מורת שילוב, מנחת התנהגות, סייעת, מטפחת רגשית).",
      "אם חסרים קו בסיס/מטרות על — הצע טיוטה כללית סבירה, והדגש שהמורה תתקן לפי הצורך."
    );
  } else if (opts?.isTachi) {
    parts.push(
      "בטופס תח\"י: אם מולאו 'מצב נוכחי' ו/או 'מטרת על' — השתמש בהם כבסיס,",
      "והצע תוכנית עבודה מפורטת בטבלת היעדים (תתי־מטרות, פרק זמן, דרכי הוראה, אמות מידה, מעקב).",
      "אם חסרים — הצע טיוטה כללית סבירה, והדגש שהמורה תתקן לפי הצורך."
    );
  }

  if (opts?.hasExample) {
    parts.push(
      "צורפה דוגמת תבנית מילוי. השתמש בה כהשראה לסגנון, מבנה ורמת פירוט בלבד.",
      opts.usePlaceholder
        ? `אל תעתיק שמות או פרטים מזהים מהדוגמה — השתמש ב${STUDENT_PLACEHOLDER} והתאם לשדות הנוכחיים.`
        : "אל תעתיק שמות או פרטים מזהים מהדוגמה — השתמש ב«התלמיד/ה» והתאם לשדות הנוכחיים.",
      "אל תמלא שדות רק כי הם מופיעים בדוגמה — רק אם יש בסיס בהקשר החינוכי שסופק."
    );
  }

  if (opts?.extraLines?.length) {
    parts.push(...opts.extraLines);
  }

  parts.push(
    "החזר אך ורק אובייקט JSON תקין: מפתחות = מפתחות השדות, ערכים = מחרוזות בעברית.",
    "בלי markdown, בלי הסברים, בלי הקדמה."
  );
  return parts.join(" ");
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function repairTruncatedJson(raw: string): unknown {
  const attempts = [raw.trim()];
  const lastComplete = raw.lastIndexOf('",');
  if (lastComplete > 0) attempts.push(raw.slice(0, lastComplete + 1));
  for (const base of attempts) {
    for (let extra = 0; extra <= 4; extra += 1) {
      try {
        return JSON.parse(`${base}${"}".repeat(extra)}`);
      } catch {
        // continue
      }
    }
  }
  return null;
}

export function extractJsonRecord(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || trimmed;
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  const end = candidate.lastIndexOf("}");
  const raw =
    end > start ? candidate.slice(start, end + 1) : candidate.slice(start);
  try {
    return asJsonObject(JSON.parse(raw));
  } catch {
    return asJsonObject(repairTruncatedJson(raw));
  }
}

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
    if (!res.ok) return [];
    const body = (await res.json()) as AnthropicModelsResponse;
    const ids = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    cachedAvailableModels = ids;
    return ids;
  } catch {
    return [];
  }
}

export async function runAiFormFill(
  input: RunAiFormFillInput,
  options: RunAiFormFillOptions = {}
): Promise<RunAiFormFillResult> {
  const maxTokens = options.maxTokens ?? DEFAULT_AI_FILL_MAX_TOKENS;
  const formId = input.formId.trim();
  const formTitle = input.formTitle.trim();
  const categoryFolder = input.categoryFolder.trim();
  const teacherNotes = sanitizeFreeTextForAi(
    input.teacherNotes,
    AI_FILL_MAX_NOTES_CHARS
  );
  const exampleTemplate = sanitizeFreeTextForAi(
    input.exampleTemplate,
    AI_FILL_MAX_EXAMPLE_CHARS
  );
  const fieldSummaries = sanitizeAiFieldSummaries(input.fieldSummaries);
  const allowedKeys = new Set(fieldSummaries.map((field) => field.key));
  if (allowedKeys.size === 0) {
    return { ok: false, error: "AI_FAILED" };
  }

  const studentContext = sanitizeStudentContextForAi(input.studentContext);
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "AI_UNAVAILABLE" };
  }

  const isTachiIntegrativeForm =
    formId === "tachi-integrative" || formId === "tla-integrative";
  const isPrepForm = formId === "tachi-prep" || formId === "tla-prep";
  const isTachiForm =
    formId === "tachi" || formId === "tla" || isTachiIntegrativeForm;

  const tachiInstruction = isPrepForm
    ? "מלא רק שדות/קוביות שיש עליהם מידע מפורש בתיאור המורה או בהקשר התלמיד. שדות בלי מידע — השאר ריקים. אל תמציא טיפולים, יעדים או תוכנית עבודה."
    : isTachiIntegrativeForm
      ? "כתוב תוכנית עבודה בתחום שצוין. לפי קו בסיס ומטרות על — מלא את טבלת היעדים (יעדים, דרכי הוראה למורה/סייעת/אחר, הערכה מעצבת ומסכמת). לאחר מכן המורה תתקן לפי הצורך."
      : isTachiForm
        ? "כתבי מצב נוכחי ומטרת על בטופס, ואז בקשי מה-AI להציע תוכנית עבודה (יעדים/דרכי הוראה/מעקב). לאחר מכן תקני לפי הצורך."
        : "מלא רק שדות ריקים שיש עליהם מידע מפורש. שדות בלי מידע — השאר ריקים. החזר JSON של מפתח→ערך בלבד.";

  const userPayload = {
    formId,
    formTitle,
    categoryFolder,
    studentContext,
    teacherNotes: teacherNotes || undefined,
    exampleTemplate: exampleTemplate || undefined,
    fields: fieldSummaries,
    instruction: tachiInstruction,
  };

  const userContent = JSON.stringify(userPayload).slice(
    0,
    AI_FILL_MAX_CONTEXT_CHARS + 80_000
  );
  const system = buildSystemPrompt({
    isTachi: isTachiForm,
    isTachiIntegrative: isTachiIntegrativeForm,
    isPrep: isPrepForm,
    hasExample: Boolean(exampleTemplate),
    usePlaceholder: input.usePlaceholder,
    extraLines: input.extraSystemLines,
    refine: input.refine ?? false,
  });
  const labelToKey: Record<string, string> = {};
  for (const field of fieldSummaries) {
    if (field.label) labelToKey[field.label] = field.key;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110_000);

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
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });
  }

  try {
    const available = await fetchAvailableModels(apiKey);
    const modelsToTry = resolveAnthropicModelsToTry({
      cachedWorkingModel,
      configuredModels: [configuredAnthropicModel()],
      preferredCandidates: PREFERRED_CHAT_MODELS,
      discoveredIds: available,
      allow: isChatModel,
      preferDiscoveredFirst: true,
    });

    let lastStatus = 0;
    for (const model of modelsToTry.slice(0, 6)) {
      const res = await callMessages(model);
      lastStatus = res.status;
      if (res.status === 404 || res.status === 400) {
        continue;
      }
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        if (!IS_PRODUCTION) {
          console.error("[fill-form] anthropic error", res.status, errBody);
        }
        if (res.status === 429) {
          return { ok: false, error: "RATE_LIMIT_UPSTREAM" };
        }
        continue;
      }
      const data = (await res.json()) as AnthropicMessagesResponse;
      if (data.error) {
        continue;
      }
      const text = (data.content ?? [])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text as string)
        .join("\n")
        .trim();
      const parsed = extractJsonRecord(text);
      if (!parsed) {
        continue;
      }
      cachedWorkingModel = model;
      const flattened = flattenAiFillPatch(parsed, allowedKeys, labelToKey);
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(flattened)) {
        if (isIdentifyingAiFieldKey(key)) continue;
        const trimmed = sanitizeFreeTextForAi(value, AI_FILL_MAX_VALUE_CHARS);
        if (trimmed) fields[key] = trimmed;
      }
      return IS_PRODUCTION
        ? { ok: true, fields }
        : { ok: true, fields, model };
    }

    return { ok: false, error: "AI_FAILED", status: lastStatus || undefined };
  } catch (error) {
    if (!IS_PRODUCTION) {
      console.error("[fill-form] unexpected", error);
    }
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));
    return { ok: false, error: aborted ? "TIMEOUT" : "AI_FAILED" };
  } finally {
    clearTimeout(timeout);
  }
}
