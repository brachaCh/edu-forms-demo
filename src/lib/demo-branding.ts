import {
  DEFAULT_SITE_TEXTS,
  mergeSiteTexts,
  type SiteTexts,
} from "./site-text";
import { isDemoMode } from "./demo-mode";

export const DEMO_METADATA = {
  title: "מערכת טפסים — הדגמה",
  description:
    "הדגמה עם נתונים פיקטיביים. כל הזכויות שמורות לאופיסנס (OfficeSense).",
};

const DEMO_TEXT_PATCH = {
  appName: "מערכת טפסים",
  appTagline: "הדגמה בלבד",
  landing: {
    title: "ברוכים הבאים למערכת הדמו",
    subtitle:
      "סביבת הדגמה עם נתונים פיקטיביים — ללא חיבור למסד נתונים",
    loginButton: "כניסה לאזור האישי",
    guestButton: "כניסה חופשית",
    termsLink: "תקנון האתר",
    accessibilityLink: "הצהרת נגישות",
    termsOfUseLink: "תקנון שימוש",
    privacyLink: "מדיניות פרטיות",
    tutorialsLink: "סרטוני הדרכה",
  },
  dashboard: {
    title: "מערכת הדמו",
    subtitle: "בחרו קטגוריה",
    schools: "בתי ספר",
    highSchools: "תיכונים",
    kindergartens: "גני ילדים",
    tutorials: "סרטוני הדרכה",
    personalArea: "האזור האישי שלך",
    summary: "סיכום ורשימות",
    contactLink: "צרו קשר",
  },
  auth: {
    termsCheckbox:
      "אני מאשר/ת את תקנון שימוש האתר, מדיניות הפרטיות והצהרת הנגישות במערכת הדמו",
  },
  terms: {
    subtitle: "תנאי השימוש במערכת הדמו — יש לקרוא לפני הרישום",
    section1Body:
      "מערכת הדמו נועדה להציג יכולות ניהול טפסים, תלמידים ומוסדות בחינוך המיוחד. הנתונים פיקטיביים בלבד.",
  },
  common: {
    footer: "מערכת טפסים — הדגמה עם נתונים פיקטיביים",
    copyright: "כל הזכויות שמורות לאופיסנס",
    allRightsReserved: "כל הזכויות שמורות לאופיסנס",
  },
  studentFields: {
    name: "שם מלא",
    phone: "טלפון",
    father: "שם האבא",
    mother: "שם האימא",
    className: "כיתה / קבוצה",
    teacher: "מורה",
    notes: "הערות",
  },
} as Partial<SiteTexts>;

function stripBrandName(value: string): string {
  return value
    .replace(/גיטי פדר/g, "מורה דמו")
    .replace(/["']?מתוה["']?/g, "מערכת טפסים")
    .replace(/["']?פרוטוקל["']?/g, "מערכת טפסים")
    .replace(/גיטי/g, "הדגמה")
    .replace(/\bMatoah\b/gi, "EduForms")
    .replace(/\bmatoah\b/g, "eduforms");
}

function sanitizeBrandStrings<T>(value: T): T {
  if (typeof value === "string") {
    return stripBrandName(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBrandStrings(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = sanitizeBrandStrings(nested);
    }
    return out as T;
  }
  return value;
}

export function getDefaultSiteTextsForMode(): SiteTexts {
  if (!isDemoMode()) return DEFAULT_SITE_TEXTS;
  return applyDemoBranding(DEFAULT_SITE_TEXTS);
}

export function applyDemoBranding(texts: SiteTexts): SiteTexts {
  if (!isDemoMode()) return texts;
  const merged = mergeSiteTexts(texts, DEMO_TEXT_PATCH);
  return sanitizeBrandStrings(merged);
}
