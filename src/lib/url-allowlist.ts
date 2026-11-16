/**
 * רשימת היתר לכתובות יוצאות שמגיעות ממשתמש (צ'קליסט #13).
 * חובה לעבור allowlist; חוסם גם כתובות פנימיות.
 */

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^metadata\.google\.internal$/i,
];

function allowedHostSuffixes(): string[] {
  const raw = process.env.ALLOWED_OUTBOUND_HOSTS?.trim() || "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) {
    try {
      fromEnv.push(new URL(app).hostname.toLowerCase());
    } catch {
      // ignore
    }
  }

  return [...new Set(fromEnv)];
}

export function assertSafeOutboundUrl(
  raw: string
): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "INVALID_URL" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "INVALID_PROTOCOL" };
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    return { ok: false, error: "HTTPS_REQUIRED" };
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) {
    return { ok: false, error: "BLOCKED_HOST" };
  }

  const allowed = allowedHostSuffixes();
  if (allowed.length === 0) {
    return { ok: false, error: "ALLOWLIST_EMPTY" };
  }

  const permitted = allowed.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (!permitted) {
    return { ok: false, error: "HOST_NOT_ALLOWLISTED" };
  }

  return { ok: true, url };
}
