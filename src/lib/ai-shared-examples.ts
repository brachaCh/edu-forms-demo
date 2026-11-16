/**
 * דוגמאות מילוי ל-AI ברמת מוסד.
 * מעלים דוגמת תח״י/תל״א ממולאת כדי שה-AI ימלא טוב יותר
 * (סגנון/מבנה) — לא לשימוש המורות עצמן.
 */

import type { FormSchema } from "@/lib/form-schemas";
import { canUseSupabase } from "@/lib/supabase-db";
import * as db from "@/lib/supabase-db";

export const AI_EXAMPLE_KINDS = [
  "tachi",
  "tachi-integrative",
  "tla",
  "tla-integrative",
  "learning-process",
  "general",
] as const;

export type AiExampleKind = (typeof AI_EXAMPLE_KINDS)[number];

export type SharedAiExample = {
  id: string;
  kind: AiExampleKind;
  name: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type AiExamplesScopeInput = {
  institutionId?: string | null;
  institutionCode?: string | null;
};

const STORAGE_KEY = "matoah.ai-fill-examples";
const MAX_EXAMPLES_PER_SCOPE = 20;
const MAX_EXAMPLE_CHARS = 12_000;
const CHANGE_EVENT = "matoah-ai-examples-changed";

type StoreMap = Record<string, SharedAiExample[]>;

export const AI_EXAMPLE_KIND_LABELS: Record<AiExampleKind, string> = {
  tachi: "תח״י",
  "tachi-integrative": "תח״י אינטגרטיבי",
  tla: "תל״א",
  "tla-integrative": "תל״א אינטגרטיבי",
  "learning-process": "תיעוד תהליך למידה",
  general: "כללי",
};

export function aiExamplesScopeKey(input: AiExamplesScopeInput): string {
  const id = input.institutionId?.trim();
  if (id) return `institution:${id}`;
  const code = input.institutionCode?.trim();
  if (code) return `code:${code.toLowerCase()}`;
  return "default";
}

function readMap(): StoreMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoreMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: StoreMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore quota
  }
}

function sanitizeExample(raw: unknown): SharedAiExample | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<SharedAiExample>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const kind = AI_EXAMPLE_KINDS.includes(row.kind as AiExampleKind)
    ? (row.kind as AiExampleKind)
    : null;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const text = typeof row.text === "string" ? row.text.trim() : "";
  if (!id || !kind || !name || !text) return null;
  const createdAt =
    typeof row.createdAt === "string" && row.createdAt
      ? row.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof row.updatedAt === "string" && row.updatedAt
      ? row.updatedAt
      : createdAt;
  return {
    id,
    kind,
    name: name.slice(0, 200),
    text: text.slice(0, MAX_EXAMPLE_CHARS),
    createdAt,
    updatedAt,
  };
}

function sanitizeList(raw: unknown): SharedAiExample[] {
  if (!Array.isArray(raw)) return [];
  const out: SharedAiExample[] = [];
  for (const item of raw) {
    const clean = sanitizeExample(item);
    if (clean) out.push(clean);
    if (out.length >= MAX_EXAMPLES_PER_SCOPE) break;
  }
  return out;
}

export function clearLocalAiExamplesCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

export function listSharedAiExamples(scopeKey: string): SharedAiExample[] {
  return sanitizeList(readMap()[scopeKey] ?? []);
}

export function listSharedAiExamplesForScope(
  input: AiExamplesScopeInput
): SharedAiExample[] {
  return listSharedAiExamples(aiExamplesScopeKey(input));
}

function persistLocal(scopeKey: string, examples: SharedAiExample[]): void {
  const map = readMap();
  map[scopeKey] = sanitizeList(examples);
  writeMap(map);
}

async function persistRemote(
  scopeKey: string,
  examples: SharedAiExample[]
): Promise<void> {
  if (!canUseSupabase()) return;
  try {
    await db.upsertAiFillExamples(scopeKey, examples);
  } catch (error) {
    console.error("Failed to sync AI fill examples", error);
  }
}

export async function loadSharedAiExamples(
  input: AiExamplesScopeInput
): Promise<SharedAiExample[]> {
  const scopeKey = aiExamplesScopeKey(input);
  const local = listSharedAiExamples(scopeKey);

  if (!canUseSupabase()) return local;

  try {
    const remote = await db.fetchAiFillExamples(scopeKey);
    if (!remote) return local;

    const remoteList = sanitizeList(remote.examples);
    const remoteMs = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
    const localNewest = local.reduce(
      (max, e) => Math.max(max, Date.parse(e.updatedAt) || 0),
      0
    );

    // עריכה מקומית חדשה יותר — דוחפים לשרת
    if (local.length > 0 && localNewest > remoteMs) {
      await persistRemote(scopeKey, local);
      return local;
    }

    persistLocal(scopeKey, remoteList);
    return remoteList;
  } catch (error) {
    console.error("Failed to load AI fill examples", error);
    return local;
  }
}

export async function addSharedAiExample(
  input: AiExamplesScopeInput,
  draft: { kind: AiExampleKind; name: string; text: string }
): Promise<SharedAiExample> {
  const scopeKey = aiExamplesScopeKey(input);
  const now = new Date().toISOString();
  const example: SharedAiExample = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: draft.kind,
    name: draft.name.trim().slice(0, 200) || "דוגמה",
    text: draft.text.trim().slice(0, MAX_EXAMPLE_CHARS),
    createdAt: now,
    updatedAt: now,
  };
  if (!example.text) {
    throw new Error("empty_example");
  }

  const next = [example, ...listSharedAiExamples(scopeKey)].slice(
    0,
    MAX_EXAMPLES_PER_SCOPE
  );
  persistLocal(scopeKey, next);
  await persistRemote(scopeKey, next);
  return example;
}

export async function removeSharedAiExample(
  input: AiExamplesScopeInput,
  exampleId: string
): Promise<void> {
  const scopeKey = aiExamplesScopeKey(input);
  const next = listSharedAiExamples(scopeKey).filter((e) => e.id !== exampleId);
  persistLocal(scopeKey, next);
  await persistRemote(scopeKey, next);
}

export function subscribeSharedAiExamples(
  listener: () => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** התאמת סוג דוגמה לטופס */
export function resolveAiExampleKind(schema: FormSchema): AiExampleKind {
  if (schema.id === "tachi-integrative") return "tachi-integrative";
  if (schema.id === "tla-integrative") return "tla-integrative";
  if (schema.id === "tachi") return "tachi";
  if (schema.id === "tla" || schema.id === "tla-prep" || schema.id === "tla-presentation")
    return "tla";

  const folder = schema.categoryFolder.trim();
  if (folder === 'תח"י') {
    return /אינטגרטיב/.test(schema.title) || /אינטגרטיב/.test(schema.id)
      ? "tachi-integrative"
      : "tachi";
  }
  if (folder === 'תל"א') {
    return /אינטגרטיב/.test(schema.title) || /אינטגרטיב/.test(schema.id)
      ? "tla-integrative"
      : "tla";
  }
  if (folder === "תיעוד תהליך למידה") return "learning-process";
  return "general";
}

/** סדר עדיפות לבחירת דוגמה מתאימה */
export function matchingAiExampleKinds(
  kind: AiExampleKind
): AiExampleKind[] {
  switch (kind) {
    case "tachi-integrative":
      return ["tachi-integrative", "tachi", "general"];
    case "tachi":
      return ["tachi", "tachi-integrative", "general"];
    case "tla-integrative":
      return ["tla-integrative", "tla", "general"];
    case "tla":
      return ["tla", "tla-integrative", "general"];
    case "learning-process":
      return ["learning-process", "general"];
    default:
      return ["general", "tachi", "tla"];
  }
}

export function pickBestSharedExamples(
  examples: SharedAiExample[],
  kind: AiExampleKind
): SharedAiExample[] {
  const order = matchingAiExampleKinds(kind);
  const ranked = [...examples].sort((a, b) => {
    const ai = order.indexOf(a.kind);
    const bi = order.indexOf(b.kind);
    const aRank = ai === -1 ? 99 : ai;
    const bRank = bi === -1 ? 99 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
  return ranked.filter((e) => order.includes(e.kind));
}

export { MAX_EXAMPLE_CHARS };
