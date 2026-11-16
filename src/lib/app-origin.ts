import {
  PRODUCTION_ORIGIN,
  configuredPublicOrigin,
  isThisProjectVercelHost,
  isTrustedAppHost,
  requestHostParts,
  vercelDeploymentOrigin,
} from "@/lib/trusted-origins";

let warnedMissingConfiguredOrigin = false;

function warnMissingConfiguredOrigin(used: string) {
  if (warnedMissingConfiguredOrigin) return;
  warnedMissingConfiguredOrigin = true;
  console.warn(
    `[app-origin] NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL is unset; using ${used}. Set one of them so reset/invite links are not derived from the request host.`
  );
}

/**
 * Canonical public origin for emails and payment return URLs.
 * Never fail-closed when env is missing (TZ-15 / TZ-25): warn and fall back
 * to a trusted request host, this Vercel deployment, or production.
 * Untrusted Host / Origin headers are ignored.
 */
export function appOrigin(request?: Request): string {
  const configured = configuredPublicOrigin();
  if (configured) return configured;

  let derived: string | null = null;

  if (request) {
    const parts = requestHostParts(request);
    if (parts && isTrustedAppHost(parts.hostname)) {
      derived = `${parts.proto}://${parts.host}`.replace(/\/$/, "");
    }
  }

  if (!derived) {
    derived = vercelDeploymentOrigin();
  }

  if (!derived) {
    derived =
      process.env.NODE_ENV === "production"
        ? PRODUCTION_ORIGIN
        : "http://localhost:3000";
  }

  warnMissingConfiguredOrigin(derived);
  return derived;
}

/**
 * Origin for parent-facing signing emails. Vercel SSO protects this
 * project's *.vercel.app hosts (`all_except_custom_domains`).
 */
export function parentFacingOrigin(request?: Request): string {
  const candidate = appOrigin(request);
  try {
    const host = new URL(candidate).hostname;
    if (isThisProjectVercelHost(host)) return PRODUCTION_ORIGIN;
  } catch {
    return PRODUCTION_ORIGIN;
  }
  return candidate;
}

export function sumitReturnUrl(request?: Request): string {
  return `${appOrigin(request)}/api/billing/sumit/return`;
}

export function sumitWebhookUrl(request?: Request): string {
  return `${appOrigin(request)}/api/billing/sumit/webhook`;
}
