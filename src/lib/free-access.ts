"use client";

export const FREE_ACCESS_KEY = "matoah.free-access";
export const FREE_ACCESS_EMAIL_KEY = "matoah.free-access-email";
export const FREE_ACCESS_STARTED_AT_KEY = "matoah.free-access-started-at";
export const FREE_ACCESS_WELCOME_KEY = "matoah.free-access-welcome";
/** אחרי סיום 20 הדקות — חוסם כניסה חופשית נוספת באותו דפדפן */
export const FREE_ACCESS_USED_KEY = "matoah.free-access-used";
/** מזהי תלמידים שיובאו מאקסל בסשן כניסה חופשית */
export const FREE_ACCESS_IMPORTED_IDS_KEY = "matoah.free-access-imported-ids";
/** תלמיד יחיד שמותר לנסות למלא בכניסה חופשית (הראשון שיובא) */
export const FREE_ACCESS_FILLABLE_STUDENT_ID_KEY =
  "matoah.free-access-fillable-student-id";

export const FREE_ACCESS_DURATION_MS = 20 * 60 * 1000;

const FREE_ACCESS_EVENT = "matoah-free-access-changed";

/** תלמיד הדמו שמוצג לפני ייבוא מאקסל */
export const FREE_ACCESS_DEFAULT_DEMO_STUDENT_ID = "demo-student-1";

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyFreeAccessListeners(): void {
  for (const listener of listeners) listener();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FREE_ACCESS_EVENT));
  }
}

function readStartedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FREE_ACCESS_STARTED_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function isFreeAccessUsedUp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FREE_ACCESS_USED_KEY) === "1";
  } catch {
    return false;
  }
}

export function getFreeAccessStartedAt(): number | null {
  return readStartedAt();
}

export function getFreeAccessRemainingMs(): number {
  if (typeof window === "undefined") return 0;
  try {
    if (window.localStorage.getItem(FREE_ACCESS_KEY) !== "1") return 0;
  } catch {
    return 0;
  }
  let started = readStartedAt();
  if (!started) {
    try {
      started = Date.now();
      window.localStorage.setItem(FREE_ACCESS_STARTED_AT_KEY, String(started));
    } catch {
      return 0;
    }
  }
  return Math.max(0, FREE_ACCESS_DURATION_MS - (Date.now() - started));
}

export function isFreeAccessSessionExpired(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(FREE_ACCESS_KEY) !== "1") return false;
  } catch {
    return false;
  }
  let started = readStartedAt();
  if (!started) {
    // סשן ישן בלי חותמת זמן — מתחילים ספירה עכשיו
    try {
      started = Date.now();
      window.localStorage.setItem(FREE_ACCESS_STARTED_AT_KEY, String(started));
    } catch {
      return true;
    }
  }
  return Date.now() - started >= FREE_ACCESS_DURATION_MS;
}

export function isFreeAccessMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(FREE_ACCESS_KEY) !== "1") return false;
  } catch {
    return false;
  }
  if (isFreeAccessSessionExpired()) return false;
  return true;
}

export function getFreeAccessEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const email = window.localStorage.getItem(FREE_ACCESS_EMAIL_KEY);
    return email?.trim() || null;
  } catch {
    return null;
  }
}

export function shouldShowFreeAccessWelcome(): boolean {
  if (typeof window === "undefined") return false;
  if (!isFreeAccessMode()) return false;
  try {
    return window.localStorage.getItem(FREE_ACCESS_WELCOME_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markFreeAccessWelcomeShown(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FREE_ACCESS_WELCOME_KEY, "1");
  } catch {
    // ignore
  }
}

/** פותח סשן דמו בשרת. מייל אופציונלי — לדיווח הרשמה בלבד. */
export async function establishGuestDemoSession(
  email?: string | null
): Promise<boolean> {
  const trimmed = email?.trim().toLowerCase() ?? "";
  try {
    const response = await fetch("/api/auth/guest-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trimmed ? { email: trimmed } : {}),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function enableFreeAccessMode(email?: string): void {
  if (typeof window === "undefined") return;
  if (isFreeAccessUsedUp()) return;
  try {
    window.localStorage.setItem(FREE_ACCESS_KEY, "1");
    window.localStorage.setItem(FREE_ACCESS_STARTED_AT_KEY, String(Date.now()));
    window.localStorage.removeItem(FREE_ACCESS_WELCOME_KEY);
    window.localStorage.removeItem(FREE_ACCESS_IMPORTED_IDS_KEY);
    window.localStorage.removeItem(FREE_ACCESS_FILLABLE_STUDENT_ID_KEY);
    const trimmed = email?.trim().toLowerCase() ?? "";
    if (trimmed) {
      window.localStorage.setItem(FREE_ACCESS_EMAIL_KEY, trimmed);
    }
  } catch {
    // ignore
  }
  notifyFreeAccessListeners();
}

export function clearFreeAccessMode(options?: { markUsed?: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FREE_ACCESS_KEY);
    window.localStorage.removeItem(FREE_ACCESS_EMAIL_KEY);
    window.localStorage.removeItem(FREE_ACCESS_STARTED_AT_KEY);
    window.localStorage.removeItem(FREE_ACCESS_WELCOME_KEY);
    window.localStorage.removeItem(FREE_ACCESS_IMPORTED_IDS_KEY);
    window.localStorage.removeItem(FREE_ACCESS_FILLABLE_STUDENT_ID_KEY);
    if (options?.markUsed) {
      window.localStorage.setItem(FREE_ACCESS_USED_KEY, "1");
    }
  } catch {
    // ignore
  }
  notifyFreeAccessListeners();
}

/** מזהי תלמידים שיובאו מאקסל בסשן הנוכחי */
export function getFreeAccessImportedStudentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FREE_ACCESS_IMPORTED_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => String(id ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * רושם תלמיד שיובא מאקסל.
 * התלמיד הראשון שנרשם הופך לתלמיד היחיד שמותר לנסות למלא.
 */
export function rememberFreeAccessImportedStudent(studentId: string): void {
  if (typeof window === "undefined") return;
  const id = studentId.trim();
  if (!id) return;
  try {
    const ids = getFreeAccessImportedStudentIds();
    if (!ids.includes(id)) {
      ids.push(id);
      window.localStorage.setItem(
        FREE_ACCESS_IMPORTED_IDS_KEY,
        JSON.stringify(ids)
      );
    }
    const fillable = window.localStorage.getItem(
      FREE_ACCESS_FILLABLE_STUDENT_ID_KEY
    );
    if (!fillable?.trim()) {
      window.localStorage.setItem(FREE_ACCESS_FILLABLE_STUDENT_ID_KEY, id);
    }
  } catch {
    // ignore
  }
  notifyFreeAccessListeners();
}

/** תלמיד יחיד שמותר למלא בכניסה חופשית (ראשון שיובא, או דמו לפני ייבוא) */
export function getFreeAccessFillableStudentId(): string {
  if (typeof window === "undefined") {
    return FREE_ACCESS_DEFAULT_DEMO_STUDENT_ID;
  }
  try {
    const stored = window.localStorage
      .getItem(FREE_ACCESS_FILLABLE_STUDENT_ID_KEY)
      ?.trim();
    if (stored) return stored;
  } catch {
    // ignore
  }
  return FREE_ACCESS_DEFAULT_DEMO_STUDENT_ID;
}

export function isFreeAccessStudentFillable(studentId: string): boolean {
  if (!isFreeAccessMode()) return true;
  return studentId.trim() === getFreeAccessFillableStudentId();
}

/** מסיים סשן כניסה חופשית (תום זמן / יציאה) ומסמן שלא ניתן להיכנס שוב */
export function endFreeAccessSession(): void {
  clearFreeAccessMode({ markUsed: true });
}

/** למנויים (למשל DataStoreProvider) — מתעדכן מיד כשנכנסים/יוצאים מכניסה חופשית */
export function subscribeFreeAccessMode(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window === "undefined") {
    return () => {
      listeners.delete(listener);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === FREE_ACCESS_KEY ||
      event.key === FREE_ACCESS_EMAIL_KEY ||
      event.key === FREE_ACCESS_STARTED_AT_KEY ||
      event.key === FREE_ACCESS_USED_KEY ||
      event.key === FREE_ACCESS_WELCOME_KEY ||
      event.key === FREE_ACCESS_IMPORTED_IDS_KEY ||
      event.key === FREE_ACCESS_FILLABLE_STUDENT_ID_KEY
    ) {
      listener();
    }
  };
  const onLocal = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(FREE_ACCESS_EVENT, onLocal);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(FREE_ACCESS_EVENT, onLocal);
  };
}

export const FREE_ACCESS_SAVE_BLOCKED = "לא ניתן לשמור בכניסה חופשית";
export const FREE_ACCESS_SEND_BLOCKED = "לא ניתן לשלוח מייל בכניסה חופשית";
export const FREE_ACCESS_PRINT_BLOCKED =
  "בכניסה חופשית אין אפשרות להדפסת טפסים";
export const FREE_ACCESS_EXPIRED_MESSAGE =
  "זמן הכניסה החופשית הסתיים. להמשך שימוש יש להירשם למערכת.";
export const FREE_ACCESS_USED_UP_MESSAGE =
  "כבר ניצלתם את 20 דקות הכניסה החופשית במכשיר זה.";
