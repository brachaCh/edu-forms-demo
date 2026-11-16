import type { Institution, UserProfile } from "@/lib/supabase/types";

type InstitutionContext = Pick<
  Institution | UserProfile,
  "institution_type" | "education_framework"
>;

function readCatalogUrl(envKey: string): string | null {
  const url = process.env[envKey]?.trim();
  return url?.startsWith("https://") ? url : null;
}

/** קטלוג SUMIT למסגרות חינוך רגיל. */
export function getSumitRegularEducationCatalogUrl(): string | null {
  return readCatalogUrl("SUMIT_CATALOG_URL_REGULAR");
}

/** קטלוג SUMIT למסגרות חינוך מיוחד. */
export function getSumitSpecialEducationCatalogUrl(): string | null {
  return readCatalogUrl("SUMIT_CATALOG_URL_SPECIAL");
}

/** מזהה קטלוג מתוך כתובת pay.sumit.co.il (המקטע אחרי מזהה החברה). */
export function sumitCatalogKeyFromUrl(catalogUrl: string | null): string | null {
  if (!catalogUrl) return null;
  try {
    const segments = new URL(catalogUrl).pathname.split("/").filter(Boolean);
    if (segments.length >= 2) return segments[1];
  } catch {
    return null;
  }
  return null;
}

/** כותרת לניהול פלטפורמה — מסגרת + מזהה קטלוג ב-SUMIT. */
export function sumitCatalogAdminLabel(
  frameworkLabel: string,
  catalogUrl: string | null
): string {
  const key = sumitCatalogKeyFromUrl(catalogUrl);
  return key ? `${frameworkLabel} · ${key}` : frameworkLabel;
}

export function getSumitCatalogUrlForInstitution(
  _institutionType: InstitutionContext["institution_type"],
  educationFramework: InstitutionContext["education_framework"]
): string | null {
  if (educationFramework === "regular") {
    return getSumitRegularEducationCatalogUrl();
  }

  if (educationFramework === "special") {
    return getSumitSpecialEducationCatalogUrl();
  }

  return null;
}

export function buildSumitCatalogCheckoutUrl(
  catalogUrl: string,
  email?: string | null
): string {
  if (!email?.trim()) return catalogUrl;
  try {
    const url = new URL(catalogUrl);
    if (!url.searchParams.has("email")) {
      url.searchParams.set("email", email.trim());
    }
    return url.toString();
  } catch {
    return catalogUrl;
  }
}

export function hasSumitCatalogUrls(): boolean {
  return Boolean(
    getSumitRegularEducationCatalogUrl() || getSumitSpecialEducationCatalogUrl()
  );
}
