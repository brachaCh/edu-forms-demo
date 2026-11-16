const TZ_ID_RE = /^TZ-(\d+)$/i;
const BUG_ID_RE = /^bug-\d+-(\d+)$/;

export function normalizeTzavtaTicketId(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return `TZ-${value}`;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const tzMatch = trimmed.match(TZ_ID_RE);
  if (tzMatch?.[1]) return `TZ-${tzMatch[1]}`;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isInteger(n) && n > 0) return `TZ-${n}`;
  }
  return null;
}

export function bugNumberFromTicketId(ticketId: string): number | null {
  const normalized = normalizeTzavtaTicketId(ticketId);
  if (!normalized) return null;
  const match = normalized.match(/^TZ-(\d+)$/);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function ticketIdFromBugId(bugId: string): string | null {
  const match = bugId.match(BUG_ID_RE);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? `TZ-${n}` : null;
}

export function isValidBugId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return BUG_ID_RE.test(value);
}

export function ticketIdFromUnknown(value: unknown): string | null {
  const direct = normalizeTzavtaTicketId(value);
  if (direct) return direct;
  if (typeof value === "string" && BUG_ID_RE.test(value)) {
    return ticketIdFromBugId(value);
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const keys = ["id", "ticket_id", "ticketId", "bug_number", "bugNumber"];
  for (const key of keys) {
    const found = normalizeTzavtaTicketId(record[key]);
    if (found) return found;
  }
  return null;
}

export function bugIdFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && BUG_ID_RE.test(value)) return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.bug_id === "string" && BUG_ID_RE.test(record.bug_id)) {
    return record.bug_id;
  }
  return null;
}
