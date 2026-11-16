import { DEMO_STUDENTS, DEMO_USER } from "./demo-data";
import { isDemoMode } from "./demo-mode";
import { isFreeAccessMode } from "./free-access";

const STUDENTS_KEY = "matoah.students";
const USER_KEY = "matoah.user";
const SITE_TEXTS_KEY = "matoah.site-texts";
/** העלאת גרסה מרעננת נתוני דמו ותוויות שדות */
const DEMO_SEED_VERSION = "3";
const DEMO_SEEDED_KEY = `matoah.demo.seeded.v${DEMO_SEED_VERSION}`;

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** טוען נתוני דמו נקיים ל-localStorage */
export function ensureDemoDataSeeded(): void {
  if (typeof window === "undefined") return;
  if (!isDemoMode() && !isFreeAccessMode()) return;

  if (readJSON<boolean>(DEMO_SEEDED_KEY)) return;

  // מוחק עריכות ישנות לתוויות (למשל "שם משפחה" על שדה טלפון)
  window.localStorage.removeItem(SITE_TEXTS_KEY);

  writeJSON(STUDENTS_KEY, DEMO_STUDENTS);
  writeJSON(USER_KEY, DEMO_USER);
  writeJSON(DEMO_SEEDED_KEY, true);
}

export function resetDemoData(): void {
  if (typeof window === "undefined" || (!isDemoMode() && !isFreeAccessMode())) {
    return;
  }
  window.localStorage.removeItem(SITE_TEXTS_KEY);
  window.localStorage.removeItem("matoah.demo.seeded");
  window.localStorage.removeItem("matoah.demo.seeded.v2");
  writeJSON(STUDENTS_KEY, DEMO_STUDENTS);
  writeJSON(USER_KEY, DEMO_USER);
  writeJSON(DEMO_SEEDED_KEY, true);
}
