export const TUTORIAL_AUDIENCES = ["all", "teachers", "admins"] as const;
export type TutorialAudience = (typeof TUTORIAL_AUDIENCES)[number];

export interface TutorialRecord {
  id: string;
  title: string;
  url: string;
  audience: TutorialAudience;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TutorialInput {
  title: string;
  url: string;
  audience: TutorialAudience;
  sort_order?: number;
}

export function isTutorialAudience(value: unknown): value is TutorialAudience {
  return (
    typeof value === "string" &&
    (TUTORIAL_AUDIENCES as readonly string[]).includes(value)
  );
}

export function isAllowedTutorialUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function parseTutorialInput(
  body: Record<string, unknown>
): { ok: true; data: TutorialInput } | { ok: false; error: string } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const audience = isTutorialAudience(body.audience) ? body.audience : "all";
  const sortOrderRaw = body.sort_order;

  if (!title) return { ok: false, error: "INVALID_TITLE" };
  if (!isAllowedTutorialUrl(url)) return { ok: false, error: "INVALID_URL" };

  let sort_order: number | undefined;
  if (sortOrderRaw !== undefined && sortOrderRaw !== null) {
    const parsed = Number(sortOrderRaw);
    if (!Number.isInteger(parsed)) return { ok: false, error: "INVALID_ORDER" };
    sort_order = parsed;
  }

  return { ok: true, data: { title, url, audience, sort_order } };
}

export function filterTutorialsForViewer(
  items: TutorialRecord[],
  isAdmin: boolean
): TutorialRecord[] {
  if (isAdmin) return items;
  return items.filter(
    (item) => item.audience === "all" || item.audience === "teachers"
  );
}

export function applyTutorialReorder(
  items: TutorialRecord[],
  orderedIds: string[]
): TutorialRecord[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const next: TutorialRecord[] = [];
  const seen = new Set<string>();

  for (const id of orderedIds) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    next.push({ ...item, sort_order: next.length });
  }

  for (const item of items) {
    if (seen.has(item.id)) continue;
    next.push({ ...item, sort_order: next.length });
  }

  return next;
}

export function parseSpecialPriceAgorot(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: "INVALID_PRICE" };
  }
  return { ok: true, value: Math.round(parsed) };
}
