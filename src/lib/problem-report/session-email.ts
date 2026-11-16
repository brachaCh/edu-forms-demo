import { EMAIL_RE } from "@/lib/validation/primitives";

export function normalizeSessionEmail(
  value: string | null | undefined
): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email || !EMAIL_RE.test(email)) return null;
  return email;
}

/**
 * Reporter address is the logged-in account email.
 * A different client value is rejected; omitted/same is accepted.
 */
export function resolveReporterEmail(args: {
  sessionEmail: string | null | undefined;
  clientEmail?: string | null;
}): { ok: true; email: string } | { ok: false; error: string } {
  const sessionEmail = normalizeSessionEmail(args.sessionEmail);
  if (!sessionEmail) {
    return { ok: false, error: "אין מייל בחשבון המחובר" };
  }
  const clientEmail = normalizeSessionEmail(args.clientEmail ?? undefined);
  if (args.clientEmail != null && String(args.clientEmail).trim() !== "") {
    if (!clientEmail || clientEmail !== sessionEmail) {
      return {
        ok: false,
        error: "כתובת המייל חייבת להיות של החשבון המחובר",
      };
    }
  }
  return { ok: true, email: sessionEmail };
}
