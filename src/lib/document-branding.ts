/**
 * לוגו פרוטוקל לטפסים — סימן המותג השקוף לתחתית העמוד
 * (public/brand/protocol-logo.png).
 * protokol-form-footer.png נשמר כעותק תואם לקישורי חתימה ישנים.
 * מוטבע בטפסים המורדים כ-data URL (ראה loadProtocolLogoDataUrl).
 */
export const PROTOCOL_LOGO_PUBLIC_PATH = "/brand/protocol-logo.png";
export const PROTOCOL_LOGO_FALLBACK_PATH = "/brand/protokol-form-footer.png";

/** כתובת לוגו פרוטוקל לצפייה/חתימה — בלי הטמעת base64 */
export function protocolLogoPublicUrl(origin?: string | null): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/$/,
    ""
  );
  return `${base}${PROTOCOL_LOGO_PUBLIC_PATH}`;
}

export function protocolLogoPlaceholderDataUrl(): string {
  return protocolLogoPublicUrl();
}

/**
 * לוגו משרד החינוך הרשמי (מגן + מנורה + "משרד החינוך").
 * מקור: אתר משרד החינוך — לא סמל משרד הפנים.
 */
export const MOE_LOGO_PUBLIC_PATH = "/brand/moe-education-logo.svg";

/**
 * SVG מובנה כגיבוי אם הקובץ הרשמי חסר בהורדה.
 * טקסט מפורש: משרד החינוך (לא משרד הפנים).
 */
export const MOE_LOGO_PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 100" role="img" aria-label="לוגו משרד החינוך">
  <rect x="1" y="1" width="258" height="98" rx="8" ry="8" fill="#ffffff" stroke="#0b3d91" stroke-width="1.5"/>
  <g transform="translate(40 50)" fill="none" stroke="#0b3d91" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <line x1="0" y1="-24" x2="0" y2="18" />
    <path d="M0,-6 C-6,-6 -8,-10 -8,-16 L-8,-24" />
    <path d="M0,-6 C 6,-6  8,-10  8,-16 L 8,-24" />
    <path d="M0,-2 C-12,-2 -16,-8 -16,-14 L-16,-24" />
    <path d="M0,-2 C 12,-2  16,-8  16,-14 L 16,-24" />
    <path d="M0, 2 C-18, 2 -24,-4 -24,-10 L-24,-24" />
    <path d="M0, 2 C 18, 2  24,-4  24,-10 L 24,-24" />
    <line x1="-24" y1="-24" x2="24" y2="-24" />
    <circle cx="-24" cy="-26" r="1.8" fill="#0b3d91" stroke="none"/>
    <circle cx="-16" cy="-26" r="1.8" fill="#0b3d91" stroke="none"/>
    <circle cx="-8"  cy="-26" r="1.8" fill="#0b3d91" stroke="none"/>
    <circle cx="0"   cy="-26" r="1.8" fill="#0b3d91" stroke="none"/>
    <circle cx="8"   cy="-26" r="1.8" fill="#0b3d91" stroke="none"/>
    <circle cx="16"  cy="-26" r="1.8" fill="#0b3d91" stroke="none"/>
    <circle cx="24"  cy="-26" r="1.8" fill="#0b3d91" stroke="none"/>
    <line x1="-9" y1="18" x2="9" y2="18" />
    <line x1="-12" y1="22" x2="12" y2="22" />
    <path d="M-24,-12 C-32,-6 -34, 6 -30, 18" />
    <path d="M 24,-12 C 32,-6  34, 6  30, 18" />
  </g>
  <text x="80" y="43" font-family="Arial, 'Segoe UI', sans-serif" font-size="20" font-weight="700" fill="#0b3d91" text-anchor="start">משרד החינוך</text>
  <text x="80" y="66" font-family="Arial, 'Segoe UI', sans-serif" font-size="12" fill="#0b3d91" text-anchor="start">מדינת ישראל</text>
  <line x1="80" y1="76" x2="240" y2="76" stroke="#0b3d91" stroke-width="0.8" />
  <text x="80" y="88" font-family="Arial, 'Segoe UI', sans-serif" font-size="9" fill="#4a5b7a" text-anchor="start">Ministry of Education · State of Israel</text>
</svg>`;

export function moeLogoPlaceholderDataUrl(): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MOE_LOGO_PLACEHOLDER_SVG)}`;
}

const SCHOOL_LOGO_KEY = "matoah.school-logo";
const MAX_SCHOOL_LOGO_BYTES = 800_000;

type SchoolLogoMap = Record<string, string>;

function readSchoolLogoMap(): SchoolLogoMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SCHOOL_LOGO_KEY);
    return raw ? (JSON.parse(raw) as SchoolLogoMap) : {};
  } catch {
    return {};
  }
}

function writeSchoolLogoMap(map: SchoolLogoMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCHOOL_LOGO_KEY, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

export type SchoolLogoScopeInput = {
  /** שם מורה מכרטיס התלמיד — לוגואים משותפים לכל תלמידיה */
  teacherName?: string | null;
  institutionId?: string | null;
  userId?: string | null;
};

function normalizeTeacherKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** מפתח שמירה ראשי — לפי משתמש/מוסד (לא לפי שם מורה — מונע דליפה בין הרשמות) */
export function schoolLogoScopeKey(input: SchoolLogoScopeInput): string {
  const user = input.userId?.trim();
  if (user) return `user:${user}`;
  const institution = input.institutionId?.trim();
  if (institution) return `institution:${institution}`;
  const teacher = input.teacherName?.trim();
  if (teacher) return `teacher:${normalizeTeacherKey(teacher)}`;
  return "default";
}

/** מפתחות לחיפוש — כולל מפתחות ישנים (מוסד/משתמש גולמי) לתאימות לאחור */
export function schoolLogoLookupKeys(input: SchoolLogoScopeInput): string[] {
  const keys: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
  };

  push(schoolLogoScopeKey(input));
  if (input.userId?.trim()) {
    push(`user:${input.userId}`);
    push(input.userId);
  }
  if (input.institutionId?.trim()) {
    push(`institution:${input.institutionId}`);
    push(input.institutionId);
  }
  if (
    !input.userId?.trim() &&
    !input.institutionId?.trim() &&
    input.teacherName?.trim()
  ) {
    push(`teacher:${normalizeTeacherKey(input.teacherName)}`);
  }
  return keys;
}

export function getSchoolLogoDataUrl(scopeKey: string): string | null {
  if (scopeKey === "default") return null;
  const value = readSchoolLogoMap()[scopeKey];
  return typeof value === "string" && value.startsWith("data:") ? value : null;
}

function hasSchoolLogoScope(input: SchoolLogoScopeInput): boolean {
  return Boolean(
    input.userId?.trim() ||
      input.institutionId?.trim() ||
      input.teacherName?.trim()
  );
}

export function resolveSchoolLogoDataUrl(
  input: SchoolLogoScopeInput
): string | null {
  if (!hasSchoolLogoScope(input)) return null;
  for (const key of schoolLogoLookupKeys(input)) {
    if (key === "default") continue;
    const value = getSchoolLogoDataUrl(key);
    if (value) return value;
  }
  return null;
}

export function setSchoolLogoDataUrl(
  scopeKey: string,
  dataUrl: string | null
): void {
  const map = readSchoolLogoMap();
  if (!dataUrl) delete map[scopeKey];
  else map[scopeKey] = dataUrl;
  writeSchoolLogoMap(map);
}

/**
 * שומר לוגו תחת מפתחות ה-scope (מורה/משתמש/מוסד).
 * בהסרה — מוחק את כל המפתחות הרלוונטיים וגם עותקים כפולים של אותו לוגו.
 */
export function persistSchoolLogoDataUrl(
  input: SchoolLogoScopeInput,
  dataUrl: string | null
): void {
  const map = readSchoolLogoMap();
  const keys = new Set(schoolLogoLookupKeys(input));
  keys.add(schoolLogoScopeKey(input));

  if (!dataUrl) {
    const removedValues = new Set<string>();
    for (const key of keys) {
      const existing = map[key];
      if (typeof existing === "string" && existing.startsWith("data:")) {
        removedValues.add(existing);
      }
      delete map[key];
    }
    // מוחק עותקים ישנים שנשמרו תחת מפתחות אחרים (אחרי «הסרה» עדיין הופיעו בהורדה)
    for (const [key, value] of Object.entries(map)) {
      if (removedValues.has(value)) delete map[key];
    }
    writeSchoolLogoMap(map);
    return;
  }

  for (const key of keys) {
    map[key] = dataUrl;
  }
  writeSchoolLogoMap(map);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("שגיאה בקריאת הקובץ"));
    reader.readAsDataURL(file);
  });
}

export async function fileToSchoolLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("FILE_NOT_IMAGE");
  }
  if (file.size > MAX_SCHOOL_LOGO_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
  return readFileAsDataUrl(file);
}

async function fetchAsDataUrl(
  publicPath: string,
  fallback: () => string
): Promise<string> {
  if (typeof window === "undefined") return fallback();
  try {
    const res = await fetch(publicPath, { cache: "force-cache" });
    if (!res.ok) return fallback();
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return fallback();
  }
}

export async function loadProtocolLogoDataUrl(): Promise<string> {
  for (const path of [PROTOCOL_LOGO_PUBLIC_PATH, PROTOCOL_LOGO_FALLBACK_PATH]) {
    const url = await fetchAsDataUrl(path, () => "");
    if (url.startsWith("data:")) return url;
  }
  return protocolLogoPlaceholderDataUrl();
}

export async function loadMoeLogoDataUrl(): Promise<string> {
  return fetchAsDataUrl(MOE_LOGO_PUBLIC_PATH, moeLogoPlaceholderDataUrl);
}

/* ------------------------------------------------------------------ */
/* לוגו עמותה / מוסד — מופיע בראש המסמך (ליד לוגו בי״ס), לא מחליף פרוטוקל */
/* ------------------------------------------------------------------ */

const INSTITUTION_FOOTER_LOGO_KEY = "matoah.institution-footer-logo";

type InstitutionFooterLogoMap = Record<string, string>;

function readInstitutionFooterLogoMap(): InstitutionFooterLogoMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(INSTITUTION_FOOTER_LOGO_KEY);
    return raw ? (JSON.parse(raw) as InstitutionFooterLogoMap) : {};
  } catch {
    return {};
  }
}

function writeInstitutionFooterLogoMap(map: InstitutionFooterLogoMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INSTITUTION_FOOTER_LOGO_KEY,
      JSON.stringify(map)
    );
  } catch {
    // ignore quota
  }
}

export type InstitutionLogoScopeInput = {
  institutionId?: string | null;
  institutionCode?: string | null;
};

export function institutionFooterLogoScopeKey(
  input: InstitutionLogoScopeInput
): string {
  const id = input.institutionId?.trim();
  if (id) return `institution:${id}`;
  const code = input.institutionCode?.trim();
  if (code) return `code:${code.toLowerCase()}`;
  return "default";
}

export function institutionFooterLogoLookupKeys(
  input: InstitutionLogoScopeInput
): string[] {
  const keys: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
  };
  push(institutionFooterLogoScopeKey(input));
  if (input.institutionId?.trim()) {
    push(`institution:${input.institutionId.trim()}`);
    push(input.institutionId.trim());
  }
  if (input.institutionCode?.trim()) {
    const code = input.institutionCode.trim();
    push(`code:${code.toLowerCase()}`);
    push(code);
  }
  return keys;
}

export function getInstitutionFooterLogoDataUrl(
  scopeKey: string
): string | null {
  if (scopeKey === "default") return null;
  const value = readInstitutionFooterLogoMap()[scopeKey];
  return typeof value === "string" && value.startsWith("data:") ? value : null;
}

function hasAssociationLogoScope(input: InstitutionLogoScopeInput): boolean {
  return Boolean(input.institutionId?.trim() || input.institutionCode?.trim());
}

/** לוגו עמותה/מוסד לראש המסמך */
export function resolveAssociationLogoDataUrl(
  input: InstitutionLogoScopeInput
): string | null {
  if (!hasAssociationLogoScope(input)) return null;
  for (const key of institutionFooterLogoLookupKeys(input)) {
    if (key === "default") continue;
    const value = getInstitutionFooterLogoDataUrl(key);
    if (value) return value;
  }
  return null;
}

/** @deprecated השתמשו ב-resolveAssociationLogoDataUrl */
export function resolveInstitutionFooterLogoDataUrl(
  input: InstitutionLogoScopeInput
): string | null {
  return resolveAssociationLogoDataUrl(input);
}

export function persistInstitutionFooterLogoDataUrl(
  input: InstitutionLogoScopeInput,
  dataUrl: string | null
): void {
  const map = readInstitutionFooterLogoMap();
  const keys = new Set(institutionFooterLogoLookupKeys(input));
  keys.add(institutionFooterLogoScopeKey(input));

  if (!dataUrl) {
    const removedValues = new Set<string>();
    for (const key of keys) {
      const existing = map[key];
      if (typeof existing === "string" && existing.startsWith("data:")) {
        removedValues.add(existing);
      }
      delete map[key];
    }
    for (const [key, value] of Object.entries(map)) {
      if (removedValues.has(value)) delete map[key];
    }
    writeInstitutionFooterLogoMap(map);
    return;
  }

  for (const key of keys) {
    map[key] = dataUrl;
  }
  writeInstitutionFooterLogoMap(map);
}

/**
 * מסנכרן לוגו עמותה/מוסד מהפרופיל (שרת) למטמון המקומי להדפסה.
 * לא דורס לוגו מקומי קיים אלא אם אין ערך מקומי.
 */
export function syncAssociationLogoFromProfile(input: {
  institutionId?: string | null;
  institutionCode?: string | null;
  institutionLogoUrl?: string | null;
  /** אם true — תמיד מעדכן מהשרת */
  force?: boolean;
}): void {
  const url = input.institutionLogoUrl?.trim() || null;
  if (!url || !url.startsWith("data:image/")) return;
  const scope = {
    institutionId: input.institutionId ?? null,
    institutionCode: input.institutionCode ?? null,
  };
  if (!input.force && resolveAssociationLogoDataUrl(scope)) return;
  persistInstitutionFooterLogoDataUrl(scope, url);
}

/** מאפס לוגואים שמורים בדפדפן — הרשמה חדשה / לקוח חדש */
export function clearLocalBrandingCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SCHOOL_LOGO_KEY);
    window.localStorage.removeItem(INSTITUTION_FOOTER_LOGO_KEY);
  } catch {
    // ignore
  }
}

/**
 * לוגו פרוטוקל לתחתית הטופס — תמיד פרוטוקל (בהיר), לא מוחלף בלוגו מוסד.
 */
export async function loadFormFooterLogoDataUrl(
  _scope?: InstitutionLogoScopeInput | null
): Promise<{ url: string; isCustom: boolean }> {
  return { url: await loadProtocolLogoDataUrl(), isCustom: false };
}

export type DocumentBrandLogos = {
  /** לוגו בית ספר — בראש המסמך */
  schoolLogoUrl?: string | null;
  /** לוגו עמותה — בראש המסמך, מול לוגו בי״ס */
  associationLogoUrl?: string | null;
  /** לוגו פרוטוקל לתחתית (בהיר) */
  protocolLogoUrl?: string | null;
  /** @deprecated לא בשימוש — פרוטוקל תמיד בתחתית */
  footerLogoIsCustom?: boolean;
  /** לוגו משרד החינוך (כ-data URL כדי שיעבוד גם מקובץ HTML מקומי). */
  moeLogoUrl?: string | null;
};

/** לוגואים קלים לשליחת חתימה — כתובות ציבוריות במקום data URL כבד */
export function publicDocumentBrandLogos(
  origin?: string | null
): DocumentBrandLogos {
  const base = (
    origin ?? (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/$/, "");
  return {
    protocolLogoUrl: `${base}${PROTOCOL_LOGO_PUBLIC_PATH}`,
    moeLogoUrl: `${base}${MOE_LOGO_PUBLIC_PATH}`,
  };
}

/** מגביל הטמעת לוגואים כבדים בגוף בקשת החתימה (Edge Function) */
const MAX_SIGNATURE_EMBEDDED_LOGO_CHARS = 100_000;

function pickSignatureEmbeddedLogo(url?: string | null): string | null {
  const value = url?.trim() || "";
  if (!value) return null;
  if (value.startsWith("data:") && value.length > MAX_SIGNATURE_EMBEDDED_LOGO_CHARS) {
    return null;
  }
  return value;
}

/** לוגואים לשליחת חתימה: פרוטוקל/משה״ח ציבוריים + בי״ס/עמותה כשמתאפשר */
export function signatureDocumentBrandLogos(input: {
  origin?: string | null;
  schoolLogoUrl?: string | null;
  associationLogoUrl?: string | null;
}): DocumentBrandLogos {
  return {
    ...publicDocumentBrandLogos(input.origin),
    schoolLogoUrl: pickSignatureEmbeddedLogo(input.schoolLogoUrl),
    associationLogoUrl: pickSignatureEmbeddedLogo(input.associationLogoUrl),
  };
}
