/** Production site and safe fallbacks for origin / CSRF checks. */

export const PRODUCTION_HOST = "demo.example.com";
export const PRODUCTION_ORIGIN = `https://${PRODUCTION_HOST}`;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** This project's preview hosts only — not every team `*.vercel.app`. */
const GITI_FEGER_PREVIEW_HOST =
  /^demo-app-[a-z0-9-]+-demo-projects\.vercel\.app$/;

export function stripOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function configuredPublicOrigin(): string | null {
  const env =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return env ? stripOrigin(env) : null;
}

function hostFromUrlOrHost(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostnameOf(hostHeader: string): string {
  const raw = hostHeader.trim().toLowerCase();
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end >= 0 ? raw.slice(1, end) : raw;
  }
  return raw.split(":")[0] ?? "";
}

/** This deployment plus this project's Vercel aliases — not every vercel.app host. */
function vercelDeploymentHosts(): string[] {
  const hosts: string[] = [];
  for (const key of [
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
  ] as const) {
    const host = hostFromUrlOrHost(process.env[key] ?? "");
    if (host) hosts.push(host);
  }
  return hosts;
}

/**
 * Origin used when minting links and public URL env is unset.
 * Prefer the project's production hostname over a per-deployment VERCEL_URL.
 */
export function vercelDeploymentOrigin(): string | null {
  const host =
    hostFromUrlOrHost(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "") ??
    hostFromUrlOrHost(process.env.VERCEL_URL ?? "") ??
    hostFromUrlOrHost(process.env.VERCEL_BRANCH_URL ?? "");
  return host ? `https://${host}` : null;
}

function configuredHosts(): string[] {
  const hosts: string[] = [PRODUCTION_HOST];
  const configured = configuredPublicOrigin();
  if (configured) {
    const host = hostFromUrlOrHost(configured);
    if (host) hosts.push(host);
  }
  const raw = process.env.ALLOWED_ORIGINS?.trim() || "";
  for (const part of raw.split(",")) {
    const host = hostFromUrlOrHost(part);
    if (host) hosts.push(host);
  }
  hosts.push(...vercelDeploymentHosts());
  return [...new Set(hosts)];
}

export function isThisProjectVercelHost(host: string): boolean {
  const h = hostnameOf(host);
  if (!h.endsWith(".vercel.app")) return false;
  if (h === "demo-app.vercel.app") return true;
  if (GITI_FEGER_PREVIEW_HOST.test(h)) return true;
  return vercelDeploymentHosts().includes(h);
}

export function isTrustedAppHost(host: string): boolean {
  const h = hostnameOf(host);
  if (!h) return false;
  if (configuredHosts().includes(h)) return true;
  if (isThisProjectVercelHost(h)) return true;
  if (process.env.NODE_ENV !== "production" && LOCAL_HOSTS.has(h)) return true;
  return false;
}

export function isTrustedAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (
      process.env.NODE_ENV === "production" &&
      url.protocol !== "https:" &&
      !LOCAL_HOSTS.has(url.hostname.toLowerCase())
    ) {
      return false;
    }
    return isTrustedAppHost(url.hostname);
  } catch {
    return false;
  }
}

export function requestHostParts(
  request: Request
): { host: string; hostname: string; proto: string } | null {
  const host = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  ).trim();
  if (!host) return null;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const proto = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : "https";
  return { host, hostname: hostnameOf(host), proto };
}
