/**
 * מזהי דגמי Claude משותפים לכל נתיבי /api/ai.
 * ברירת המחדל ניתנת לעקיפה ב-ANTHROPIC_MODEL.
 * עיבוד תמלול מעדיף ANTHROPIC_TRANSCRIPT_MODEL ואז ANTHROPIC_MODEL.
 * דגמים שפרשו (למשל claude-3-5-sonnet-20241022) מסוננים ולא נקראים.
 */

/** דגם ברירת מחדל — תואם ל-ANTHROPIC_MODEL ב-.env.local.example */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** מועמדים ל-Sonnet בלבד (עיבוד תמלול — בלי Opus). */
export const PREFERRED_SONNET_MODELS = [
  DEFAULT_ANTHROPIC_MODEL,
  "claude-sonnet-5",
  "claude-sonnet-4-6",
] as const;

/** מועמדים לכל נתיבי הצ'אט (מילוי טופס). */
export const PREFERRED_CHAT_MODELS = [
  "claude-opus-5",
  ...PREFERRED_SONNET_MODELS,
  "claude-haiku-5-5",
] as const;

/**
 * מזהים שפרשו או שיש להימנע מהם ב-Anthropic API.
 * מקור עדכונים: https://docs.anthropic.com/en/docs/resources/model-deprecations
 * בקשות לדגמים שפרשו מחזירות 404.
 */
export const RETIRED_ANTHROPIC_MODEL_IDS = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-3-5-sonnet-latest",
  "claude-3-7-sonnet-20250219",
  "claude-3-7-sonnet-latest",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-opus-4-1-20250805",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
] as const;

const RETIRED_ANTHROPIC_MODEL_SET = new Set<string>(
  RETIRED_ANTHROPIC_MODEL_IDS
);

export function isRetiredAnthropicModel(id: string): boolean {
  const lower = id.trim().toLowerCase();
  if (!lower) return false;
  if (RETIRED_ANTHROPIC_MODEL_SET.has(lower)) return true;
  return (
    lower.startsWith("claude-3-5-sonnet") ||
    lower.startsWith("claude-3-7-sonnet") ||
    lower.startsWith("claude-3-5-haiku") ||
    lower.startsWith("claude-3-haiku") ||
    lower.startsWith("claude-3-opus") ||
    lower.startsWith("claude-3-sonnet") ||
    /^claude-(2|1|instant)([.-]|$)/.test(lower)
  );
}

export function isSonnetModel(id: string): boolean {
  const lower = id.toLowerCase();
  return lower.startsWith("claude-") && lower.includes("sonnet");
}

export function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower.startsWith("claude-") &&
    (lower.includes("sonnet") ||
      lower.includes("opus") ||
      lower.includes("haiku"))
  );
}

function usableModel(
  id: string | undefined,
  allow: (id: string) => boolean
): string | undefined {
  const trimmed = id?.trim();
  if (!trimmed) return undefined;
  if (isRetiredAnthropicModel(trimmed)) return undefined;
  if (!allow(trimmed)) return undefined;
  return trimmed;
}

/** ANTHROPIC_MODEL אם מוגדר ודגם נוכחי; אחרת undefined (ניפול לברירת מחדל). */
export function configuredAnthropicModel(): string | undefined {
  return usableModel(process.env.ANTHROPIC_MODEL, isChatModel);
}

/** דגם לעיבוד תמלול: ANTHROPIC_TRANSCRIPT_MODEL גובר על ANTHROPIC_MODEL. */
export function configuredTranscriptModel(): string | undefined {
  const dedicated = usableModel(
    process.env.ANTHROPIC_TRANSCRIPT_MODEL,
    isSonnetModel
  );
  if (dedicated) return dedicated;
  return usableModel(process.env.ANTHROPIC_MODEL, isSonnetModel);
}

export function pickPreferredModel(
  availableIds: readonly string[],
  preferred: readonly string[] = PREFERRED_CHAT_MODELS,
  allow: (id: string) => boolean = isChatModel
): string | null {
  const available = new Set(
    availableIds.filter((id) => usableModel(id, allow))
  );
  for (const candidate of preferred) {
    if (available.has(candidate)) return candidate;
  }
  const sonnet = availableIds.find((id) => isSonnetModel(id) && available.has(id));
  if (sonnet) return sonnet;
  const haiku = availableIds.find(
    (id) => id.toLowerCase().includes("haiku") && available.has(id)
  );
  return haiku ?? null;
}

export function resolveAnthropicModelsToTry(input: {
  cachedWorkingModel?: string | null;
  configuredModels?: Array<string | undefined>;
  preferredCandidates?: readonly string[];
  discoveredIds?: readonly string[];
  allow?: (id: string) => boolean;
  /** מילוי טופס: דגם מועדף מה-API לפני רשימת הגיבוי הסטטית */
  preferDiscoveredFirst?: boolean;
}): string[] {
  const allow = input.allow ?? isChatModel;
  const preferred = input.preferredCandidates ?? PREFERRED_CHAT_MODELS;
  const discovered = input.discoveredIds ?? [];
  const preferredFromDiscovered = pickPreferredModel(
    discovered,
    preferred,
    allow
  );

  const initial: string[] = [];
  if (input.cachedWorkingModel) initial.push(input.cachedWorkingModel);
  for (const model of input.configuredModels ?? []) {
    if (model) initial.push(model);
  }
  if (input.preferDiscoveredFirst && preferredFromDiscovered) {
    initial.push(preferredFromDiscovered);
    initial.push(...preferred);
  } else {
    initial.push(...preferred);
    if (preferredFromDiscovered) initial.push(preferredFromDiscovered);
  }
  initial.push(...discovered.filter((id) => allow(id)));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of initial) {
    const usable = usableModel(id, allow);
    if (!usable || seen.has(usable)) continue;
    seen.add(usable);
    out.push(usable);
  }
  return out;
}
