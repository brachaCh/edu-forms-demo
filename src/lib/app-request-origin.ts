import { allowedCorsOrigins } from "@/lib/cors";
import {
  isTrustedAppHost,
  isTrustedAppOrigin,
  requestHostParts,
} from "@/lib/trusted-origins";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Server-to-server endpoints authenticate with their own secrets, not a
 * browser Origin. Keep this list in sync with inbound webhooks / cron.
 *
 * - /api/webhooks/simplesign — HMAC SIMPLESIGN_WEBHOOK_SECRET
 * - /api/billing/sumit/webhook — SUMIT_WEBHOOK_SECRET
 * - /api/cron/* — Authorization: Bearer CRON_SECRET (Vercel cron + edge backup)
 * - /api/problem-report/status — bearer secret (inbound status webhook)
 */
export function csrfExemptApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/webhooks/")) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname === "/api/billing/sumit/webhook") return true;
  if (pathname === "/api/problem-report/status") return true;
  if (pathname.startsWith("/api/problem-report/")) return true;
  return false;
}

export function shouldEnforceCsrfOrigin(input: {
  method: string;
  pathname: string;
}): boolean {
  if (!MUTATING_METHODS.has(input.method.toUpperCase())) return false;
  if (!input.pathname.startsWith("/api/")) return false;
  return !csrfExemptApiPath(input.pathname);
}

/**
 * Reject a browser request whose Origin / Referer is not this app.
 * Missing Origin is allowed (S2S, same-host clients) so production does not
 * fail closed when NEXT_PUBLIC_APP_URL / ALLOWED_ORIGINS is unset.
 */
export function assertAllowedAppOrigin(
  request: Request
): { ok: true } | { ok: false } {
  const originRaw = request.headers.get("origin")?.trim().replace(/\/$/, "") ?? "";
  const origin = originRaw.toLowerCase() === "null" ? "" : originRaw;
  if (origin) {
    if (isTrustedAppOrigin(origin)) return { ok: true };
    if (allowedCorsOrigins().includes(origin)) return { ok: true };
    return { ok: false };
  }

  const referer = request.headers.get("referer")?.trim() ?? "";
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin.replace(/\/$/, "");
      if (isTrustedAppOrigin(refOrigin)) return { ok: true };
      if (allowedCorsOrigins().includes(refOrigin)) return { ok: true };
    } catch {
      return { ok: false };
    }
    return { ok: false };
  }

  const parts = requestHostParts(request);
  if (parts && isTrustedAppHost(parts.hostname)) return { ok: true };
  if (process.env.NODE_ENV !== "production") return { ok: true };

  console.warn(
    "[csrf-origin] request has no Origin/Referer; allowing so a missing NEXT_PUBLIC_APP_URL cannot take the site down"
  );
  return { ok: true };
}
