import {
  PROBLEM_REPORT_BROWSER_MAX,
  PROBLEM_REPORT_PATH_MAX,
} from "./constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_HEX_RE = /^[0-9a-f]{16,}$/i;
const LONG_HEX_ANYWHERE_RE = /[0-9a-f]{16,}/gi;
const NUMERIC_ID_RE = /^\d{8,}$/;
const NUMERIC_ANYWHERE_RE = /\d{8,}/g;
const MIXED_TOKEN_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]{12,}$/;
const MAX_DECODE_PASSES = 8;

const STUDENT_STATIC_CHILDREN = new Set([
  "view",
  "fill",
  "folder",
  "forms",
  "new",
  "portfolio",
  "category",
  "pfolder",
]);

/** Public parent/signer/viewer token pages — reject before save or email. */
export function isForbiddenReportPath(pathname: string): boolean {
  return /^\/(fill|sign|sign-document|view)(\/|$)/i.test(pathname);
}

function isSafeDecodedPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://") || /[\r\n\0]/.test(path)) return false;
  return true;
}

function cutQueryAndHash(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

function dropMatrixParams(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.split(";")[0] ?? "")
    .join("/");
}

function normalizeDotSegments(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return `/${out.join("/")}`;
}

/**
 * Decode the whole path, then drop query/hash and matrix params, then
 * resolve `.` / `..`. Malformed % on the first pass returns null so the
 * caller can drop the path without failing the report.
 */
export function normalizeReportPath(pathname: string): string | null {
  let current = pathname;
  let passes = 0;
  while (passes < MAX_DECODE_PASSES) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      if (passes === 0) return null;
      break;
    }
    next = cutQueryAndHash(next);
    if (next === current) break;
    current = next;
    passes += 1;
  }
  current = cutQueryAndHash(current);
  current = dropMatrixParams(current);
  current = normalizeDotSegments(current);
  if (!isSafeDecodedPath(current)) return null;
  return current.slice(0, PROBLEM_REPORT_PATH_MAX);
}

/** @deprecated use normalizeReportPath */
export function decodeReportPath(pathname: string): string | null {
  return normalizeReportPath(pathname);
}

function looksLikeIdOrToken(segment: string): boolean {
  return (
    UUID_RE.test(segment) ||
    LONG_HEX_RE.test(segment) ||
    NUMERIC_ID_RE.test(segment) ||
    MIXED_TOKEN_RE.test(segment)
  );
}

function redactIdsInsideSegment(segment: string): string {
  return segment
    .replace(UUID_ANYWHERE_RE, ":id")
    .replace(LONG_HEX_ANYWHERE_RE, ":id")
    .replace(NUMERIC_ANYWHERE_RE, ":id");
}

function isStudentIdSlot(written: string[], current: string): boolean {
  if (written[0] !== "personal-area" || written[1] !== "students") return false;
  if (written.length === 2) {
    return !STUDENT_STATIC_CHILDREN.has(current);
  }
  return written.length === 3 && STUDENT_STATIC_CHILDREN.has(written[2] ?? "");
}

function isPrintOrTeacherIdSlot(written: string[]): boolean {
  return (
    (written[0] === "print" && written.length === 1) ||
    (written[0] === "teachers" && written.length === 1)
  );
}

/**
 * Replace student IDs and tokens with placeholders.
 * /personal-area/students/<id> → /personal-area/students/:id
 * Decodes the whole path before splitting so %2F / %3F / %23 cannot hide
 * slashes, queries or hashes. IDs inside a segment are also replaced.
 */
export function redactPagePath(pathname: string): string {
  const normalized = normalizeReportPath(pathname);
  if (!normalized) return "/";
  const parts = normalized.split("/").filter((part) => part.length > 0);
  const out: string[] = [];
  for (const segment of parts) {
    if (
      isStudentIdSlot(out, segment) ||
      isPrintOrTeacherIdSlot(out) ||
      looksLikeIdOrToken(segment)
    ) {
      out.push(":id");
      continue;
    }
    out.push(redactIdsInsideSegment(segment));
  }
  return `/${out.join("/")}`;
}

/** Relative app path only — no query/hash (those can carry names or tokens). */
export function sanitizePagePath(
  value: string | undefined | null
): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("://") || /[\r\n]/.test(trimmed)) return null;
  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return null;
  return pathOnly.slice(0, PROBLEM_REPORT_PATH_MAX);
}

export function sanitizeBrowser(
  value: string | undefined | null
): string | null {
  const trimmed = (value ?? "").trim().replace(/[\r\n\0]/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, PROBLEM_REPORT_BROWSER_MAX);
}
