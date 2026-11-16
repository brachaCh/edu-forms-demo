import {
  PRODUCTION_ORIGIN,
  configuredPublicOrigin,
  isTrustedAppOrigin,
} from "./trusted-origins";

/** CORS למקורות מפורשים בלבד — צ'קליסט #13 */

export function allowedCorsOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim() || "";
  const list = raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const app = configuredPublicOrigin();
  if (app) list.push(app);
  list.push(PRODUCTION_ORIGIN);
  if (process.env.NODE_ENV !== "production") {
    list.push("http://localhost:3000", "http://127.0.0.1:3000");
  }
  return [...new Set(list)];
}

export function resolveCorsOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  const origin = requestOrigin.trim().replace(/\/$/, "");
  if (allowedCorsOrigins().includes(origin)) return origin;
  if (isTrustedAppOrigin(origin)) return origin;
  return null;
}
