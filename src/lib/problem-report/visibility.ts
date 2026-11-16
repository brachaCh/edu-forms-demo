import { hrefPathOnly } from "@/lib/navigation-back";

/**
 * Public parent/signer/viewer token pages. Do not match in-app fill routes such as
 * /personal-area/students/fill/...
 */
export function isPublicTokenPath(pathname: string): boolean {
  const path = hrefPathOnly(pathname);
  return /^\/(fill|sign|sign-document|view)\/[^/]+$/.test(path);
}

/**
 * Detached print view pages (e.g. /print/[key]).
 */
export function isPrintPath(pathname: string): boolean {
  const path = hrefPathOnly(pathname);
  return /^\/print(\/|$)/.test(path);
}

/**
 * Logged-in staff only, in the in-app header.
 * Hidden on public /fill/[token] and /sign/[token] even if a session exists,
 * so parents/signers never see (or submit) an in-app report from a form that
 * shows student data.
 * Also hidden on /print/ pages (detached print view).
 */
export function shouldShowProblemReportButton(options: {
  loggedIn: boolean;
  pathname: string;
}): boolean {
  if (!options.loggedIn) return false;
  if (isPublicTokenPath(options.pathname)) return false;
  if (isPrintPath(options.pathname)) return false;
  return true;
}
