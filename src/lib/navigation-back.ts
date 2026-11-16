/**
 * ניווט «חזרה»: קודם העמוד שממנו הגיעו (from / היסטוריה פנימית),
 * ואם אין — עלייה לפי היררכיית ה-URL עם יעד נפילה בטוח.
 */

export const LOGGED_IN_HOME_HREF = "/personal-area";

/** מקטעי נתיב שבאים כזוג מפתח/ערך (למשל framework/[id]) */
const PAIR_KEYS = new Set([
  "framework",
  "status",
  "mode",
  "class-mode",
  "teacher",
  "frequency",
  "sector",
  "category",
  "class",
  "portfolio",
  "fill",
  "forms",
  "folder",
  "custom",
  "view",
]);

/** פרמטרי הקשר כיתה שצריך לשמור בחזרה מ־class-mode */
const CLASS_CONTEXT_QUERY_KEYS = ["name", "sector", "framework", "class"] as const;

const NAV_BACK_STORAGE_KEY = "matoah.nav.back-href";
const NAV_HISTORY_STORAGE_KEY = "matoah.nav.history-stack";
const NAV_HISTORY_MAX = 40;

const AUTH_SURFACE_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/guest-demo",
  "/select-institution",
]);

const UNSAFE_INTERNAL_HREF_CHARS = /[\\\u0000-\u001F\u007F]/;

function decodeHrefOnce(value: string): string {
  try {
    if (/%[0-9A-Fa-f]{2}/.test(value)) {
      return decodeURIComponent(value);
    }
  } catch {
    return value;
  }
  return value;
}

function resolvesToDummyOrigin(href: string): boolean {
  try {
    return new URL(href, "http://x").origin === "http://x";
  } catch {
    return false;
  }
}

function isSafeRelativePath(href: string): boolean {
  if (!href.startsWith("/")) return false;
  if (href.startsWith("//")) return false;
  if (href.includes("://")) return false;
  if (UNSAFE_INTERNAL_HREF_CHARS.test(href)) return false;
  return resolvesToDummyOrigin(href);
}

/** מונע open-redirect דרך ?from= — כולל `/\evil.com` ו־control chars */
export function isSafeInternalHref(href: string): boolean {
  const trimmed = href.trim();
  if (!isSafeRelativePath(trimmed)) return false;
  const decoded = decodeHrefOnce(trimmed);
  if (decoded !== trimmed && !isSafeRelativePath(decoded)) return false;
  return true;
}

/** מפענח ?from= בטוח (ללא decode כפול / קריסה על %) */
export function parseSafeFromParam(
  from: string | null | undefined
): string | null {
  if (!from) return null;
  const raw = from.trim();
  if (!raw) return null;
  let candidate = raw;
  try {
    // אם כבר מפוענח — decodeURIComponent על "%" בודד יכול לזרוק
    if (/%[0-9A-Fa-f]{2}/.test(raw)) {
      candidate = decodeURIComponent(raw);
    }
  } catch {
    candidate = raw;
  }
  return isSafeInternalHref(candidate) ? candidate : null;
}

/** נתיב בלי query/hash, בלי slash סופי */
export function hrefPathOnly(href: string): string {
  return (href.split("?")[0] ?? href).split("#")[0]?.replace(/\/$/, "") || "/";
}

export function sameNavHref(a: string, b: string): boolean {
  return hrefPathOnly(a) === hrefPathOnly(b);
}

/** Query string בלי `#`, בלי `?` מוביל */
export function hrefQuery(href: string): URLSearchParams {
  const q = href.includes("?")
    ? (href.slice(href.indexOf("?") + 1).split("#")[0] ?? "")
    : "";
  return new URLSearchParams(q);
}

/**
 * אותה «כתובת מסך» לחזרה: נתיב + מפתחות שמבחינים בין מסכים
 * (`name` = מורה / כיתה). בלי זה /teacher?name=א ו־/teacher?name=ב
 * נחשבים אותו עמוד, והיסטוריה / כפתור החזרה נתקעים.
 */
const LOCATION_QUERY_KEYS = ["name"] as const;

export function sameNavLocation(a: string, b: string): boolean {
  if (hrefPathOnly(a) !== hrefPathOnly(b)) return false;
  const qa = hrefQuery(a);
  const qb = hrefQuery(b);
  for (const key of LOCATION_QUERY_KEYS) {
    if ((qa.get(key) ?? "").trim() !== (qb.get(key) ?? "").trim()) {
      return false;
    }
  }
  return true;
}

/** דף הנחיתה או בוחר הקטגוריות הציבורי */
export function isPublicEntryHref(href: string): boolean {
  const path = hrefPathOnly(href);
  return path === "/" || path === "/dashboard";
}

/** מסכי התחברות / הרשמה — לא יעד חזרה למשתמש מחובר */
export function isAuthSurfaceHref(href: string): boolean {
  const path = hrefPathOnly(href);
  if (AUTH_SURFACE_PATHS.has(path)) return true;
  return path.startsWith("/register/");
}

/** כרטיס / תיק / טפסים של תלמיד (לא רשימה) */
export function isStudentFileHref(href: string): boolean {
  const path = hrefPathOnly(href);
  if (path.endsWith("/students/new") || path.endsWith("/students")) {
    return false;
  }
  return (
    /\/students\/(?:view|portfolio|fill|forms|folder|category|pfolder|custom)\//.test(
      path
    ) || /\/students\/[^/]+$/.test(path)
  );
}

/** רשימת צוות (בלי /teacher?name= — רשימת התלמידים של מורה ספציפית) */
export function isStaffRosterHref(href: string): boolean {
  const path = hrefPathOnly(href);
  if (/\/(?:status|category)\/integration-teacher$/.test(path)) {
    return true;
  }
  // /teacher בלי ?name= עדיין מציג את רוסטר הצוות, לא רשימת תלמידים
  if (/\/(?:status|category)\/integration-teacher\/teacher$/.test(path)) {
    const query = href.includes("?")
      ? (href.slice(href.indexOf("?") + 1).split("#")[0] ?? "")
      : "";
    return !(new URLSearchParams(query).get("name") ?? "").trim();
  }
  return false;
}

/**
 * רשימת תלמידים (סטטוס / כיתה / מורה / שכיחות / ארכיון),
 * לא רוסטר צוות ולא תל"כ.
 */
export function isStudentListHref(href: string): boolean {
  const path = hrefPathOnly(href);
  if (isStudentFileHref(href) || isStaffRosterHref(href)) return false;
  if (/\/(?:class-mode|mode)\/(?:curriculum|tlk)(?:\/|$)/.test(path)) {
    return false;
  }
  if (path === "/personal-area/archive") return true;
  if (path === "/personal-area/mid-year-intake") return true;
  return (
    /\/(?:status|category)\//.test(path) ||
    /\/(?:class-mode|class|teacher|frequency|mode)\//.test(path)
  );
}

function loggedInHomeOrDefault(loggedInHomeHref?: string): string {
  const candidate = loggedInHomeHref?.trim();
  if (!candidate) return LOGGED_IN_HOME_HREF;
  return parseSafeFromParam(candidate) ?? LOGGED_IN_HOME_HREF;
}

/** יעד נפילה: לעולם לא בוחר הקטגוריות הציבורי למשתמש מחובר */
export function sanitizeBackHrefForSession(
  href: string,
  treatAsLoggedIn: boolean,
  loggedInHomeHref?: string
): string {
  const home = loggedInHomeOrDefault(loggedInHomeHref);
  const safe =
    parseSafeFromParam(href) ??
    (isSafeInternalHref(href.trim()) ? href.trim() : null);
  if (!safe) {
    return treatAsLoggedIn ? home : "/";
  }
  if (treatAsLoggedIn && (isPublicEntryHref(safe) || isAuthSurfaceHref(safe))) {
    return home;
  }
  return safe;
}

function readHistoryStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(NAV_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string =>
        typeof item === "string" && Boolean(parseSafeFromParam(item))
    );
  } catch {
    return [];
  }
}

function writeHistoryStack(stack: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      NAV_HISTORY_STORAGE_KEY,
      JSON.stringify(stack)
    );
  } catch {
    // ignore
  }
}

/** רושם את העמוד הנוכחי בהיסטוריה הפנימית (בלי כפילות רצופה) */
export function recordInAppHistory(href: string): void {
  const safe =
    parseSafeFromParam(href) ??
    (isSafeInternalHref(href.trim()) ? href.trim() : null);
  if (!safe) return;
  const stack = readHistoryStack();
  const last = stack[stack.length - 1];
  if (last && sameNavLocation(last, safe)) {
    stack[stack.length - 1] = safe;
  } else {
    stack.push(safe);
  }
  if (stack.length > NAV_HISTORY_MAX) {
    stack.splice(0, stack.length - NAV_HISTORY_MAX);
  }
  writeHistoryStack(stack);
}

/** העמוד הקודם בהיסטוריה הפנימית, בלי דפי כניסה/התחברות */
export function previousInAppHistory(currentHref: string): string | null {
  const stack = readHistoryStack();
  let i = stack.length - 1;
  while (i >= 0 && sameNavLocation(stack[i]!, currentHref)) i -= 1;
  while (i >= 0 && isAuthSurfaceHref(stack[i]!)) {
    i -= 1;
  }
  return i >= 0 ? stack[i]! : null;
}

/** אחרי ניווט חזרה — גוזרים את העמוד הנוכחי מראש הערימה */
export function consumeInAppHistory(currentHref: string): void {
  const stack = readHistoryStack();
  while (
    stack.length > 0 &&
    sameNavLocation(stack[stack.length - 1]!, currentHref)
  ) {
    stack.pop();
  }
  writeHistoryStack(stack);
}

/** האם יעד שמור ב־sessionStorage מתאים כרשימה לחזרה מהמסך הנוכחי */
export function storedListFromForPath(
  pathname: string,
  stored: string | null | undefined
): string | null {
  const safe = stored ? parseSafeFromParam(stored) : null;
  if (!safe) return null;
  const architectural = parentHref(pathname);
  const archPath = hrefPathOnly(architectural);
  const losesListContext =
    archPath === "/personal-area" ||
    archPath === "/personal-area/students" ||
    archPath === "/dashboard" ||
    archPath === "/";
  if (!losesListContext) return null;
  if (isStaffRosterHref(safe) && isStudentFileHref(pathname)) {
    return null;
  }
  if (!isStudentListHref(safe) && !isStaffRosterHref(safe)) {
    return null;
  }
  return safe;
}

/**
 * יעד כפתור «חזרה» בכותרת.
 * 1) ?from= דרך הארכיטקטורה (TZ-21 + תיקיות אותו תלמיד)
 * 2) העמוד הקודם בהיסטוריה הפנימית
 * 3) רשימה שמורה ב־sessionStorage
 * 4) הורה ארכיטקטוני
 * למשתמש מחובר — אף פעם לא `/` או `/dashboard`.
 */
export function resolveHeaderBackHref(options: {
  pathname: string;
  levels?: number;
  from?: string | null;
  storedFrom?: string | null;
  historyPrevious?: string | null;
  fallback?: string;
  search?: string | null;
  treatAsLoggedIn: boolean;
  /** פרופיל המוסד כשיש סשן — במקום /personal-area הכללי */
  loggedInHomeHref?: string;
}): string {
  const {
    pathname,
    levels = 1,
    from,
    storedFrom,
    historyPrevious,
    search,
    treatAsLoggedIn,
  } = options;
  const home = loggedInHomeOrDefault(options.loggedInHomeHref);
  const fallback = sanitizeBackHrefForSession(
    options.fallback ?? (treatAsLoggedIn ? home : "/"),
    treatAsLoggedIn,
    home
  );
  const currentHref = hrefWithSearch(pathname, search);

  // Giti: בכותרת, חזרה מ־/dashboard לעולם לפרופיל המוסד — בלי בוחר הקטגוריות
  if (treatAsLoggedIn && hrefPathOnly(pathname) === "/dashboard") {
    return sameNavLocation(home, currentHref) ? fallback : home;
  }

  const apply = (href: string): string => {
    const sanitized = sanitizeBackHrefForSession(href, treatAsLoggedIn, home);
    if (!sameNavLocation(sanitized, currentHref)) return sanitized;
    return fallback;
  };

  const architectural = (): string =>
    apply(
      resolveBackHref({
        pathname,
        levels,
        fallback,
        search,
      })
    );

  const safeFrom = from ? parseSafeFromParam(from) : null;
  if (safeFrom) {
    return apply(
      resolveBackHref({
        pathname,
        levels,
        from: safeFrom,
        fallback,
        search,
      })
    );
  }

  const prev =
    historyPrevious && parseSafeFromParam(historyPrevious)
      ? parseSafeFromParam(historyPrevious)
      : null;
  if (prev && !sameNavLocation(prev, currentHref) && !isAuthSurfaceHref(prev)) {
    const sanitized = sanitizeBackHrefForSession(prev, treatAsLoggedIn, home);
    if (!sameNavLocation(sanitized, currentHref)) return sanitized;
  }

  const stored = storedListFromForPath(pathname, storedFrom);
  if (stored) return apply(stored);

  if (levels === 1) {
    const first = architectural();
    if (!sameNavLocation(first, currentHref)) return first;
    return apply(
      resolveBackHref({
        pathname,
        levels: 2,
        fallback,
        search,
      })
    );
  }

  return architectural();
}

/**
 * כמו resolveHeaderBackHref, אבל אף פעם לא מחזיר את המסך הנוכחי
 * כשיש הורה / פרופיל מוסד. כפתור «חזרה» לא אמור להיות no-op.
 */
export function resolveDistinctHeaderBackHref(
  options: Parameters<typeof resolveHeaderBackHref>[0] & {
    currentHref?: string;
  }
): string {
  const home = loggedInHomeOrDefault(options.loggedInHomeHref);
  const currentHref =
    options.currentHref ?? hrefWithSearch(options.pathname, options.search);
  const target = resolveHeaderBackHref(options);
  if (!sameNavLocation(target, currentHref)) return target;

  const parent = withPreservedSectorContext(
    hrefPathOnly(options.pathname),
    parentHref(hrefPathOnly(options.pathname), home),
    options.search
  );
  const climbed = sanitizeBackHrefForSession(
    parent,
    options.treatAsLoggedIn,
    home
  );
  if (!sameNavLocation(climbed, currentHref)) return climbed;

  const grand = sanitizeBackHrefForSession(
    parentHref(hrefPathOnly(climbed), home),
    options.treatAsLoggedIn,
    home
  );
  if (!sameNavLocation(grand, currentHref)) return grand;

  return options.treatAsLoggedIn ? home : (options.fallback ?? "/");
}

/** האם הנתיב הוא מסך תל"כ (תוכנית לימודים כיתתית) */
export function isClassCurriculumHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const path = (href.split("?")[0] ?? href).split("#")[0] ?? href;
  return /\/(?:class-mode|mode)\/(?:curriculum|tlk)(?:\/|$)/.test(path);
}

/**
 * מחבר pathname + search ל־href מלא.
 * חיוני אחרי rewrite של שם כיתה בעברית ל־?name= — בלי זה «חזרה» מאבדת את הכיתה ו־404.
 */
export function hrefWithSearch(
  pathname: string,
  search?: string | null
): string {
  const path = (pathname.split("?")[0] ?? pathname).split("#")[0] ?? pathname;
  if (!search) return path;
  const qs = search.startsWith("?") ? search.slice(1) : search;
  return qs ? `${path}?${qs}` : path;
}

/**
 * יעד `from` לפתיחת מסך-בן מתוך תיק/טפסים.
 * אם ההקשר החיצוני הוא מחוץ לתיק (למשל תל"כ) — שומרים אותו,
 * כדי ש«חזרה» לא תקפוץ לתיק התלמיד של בעל התל"כ.
 */
export function nestedNavFrom(
  currentPathname: string,
  outerBackHref?: string | null
): string {
  const outer =
    parseSafeFromParam(outerBackHref) ??
    (outerBackHref && isSafeInternalHref(outerBackHref.trim())
      ? outerBackHref.trim()
      : null);
  if (outer) {
    const outerPath = (outer.split("?")[0] ?? outer).split("#")[0] ?? outer;
    if (isClassCurriculumHref(outerPath)) return outer;
    if (!/\/students\/(?:portfolio|view)\//.test(outerPath)) return outer;
  }
  return currentPathname;
}

/** מוסיף ?from= לקישור פנימי */
export function hrefWithFrom(href: string, from?: string | null): string {
  const safeFrom =
    (from ? parseSafeFromParam(from) : null) ??
    (from && isSafeInternalHref(from.trim()) ? from.trim() : null);
  if (!safeFrom) return href;
  const hashIndex = href.indexOf("#");
  const base = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  if (/[?&]from=/.test(base)) return href;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}from=${encodeURIComponent(safeFrom)}${hash}`;
}

/** שומר יעד חזרה לכפתור הכותרת (כשאין ?from= ב-URL) */
export function rememberNavBackHref(href: string): void {
  if (typeof window === "undefined") return;
  const trimmed = href.trim();
  const safe =
    parseSafeFromParam(trimmed) ??
    (isSafeInternalHref(trimmed) ? trimmed : null);
  if (!safe) return;
  try {
    window.sessionStorage.setItem(NAV_BACK_STORAGE_KEY, safe);
  } catch {
    // ignore
  }
}

/** מוחק יעד חזרה שמור — מונע קפיצה לרשימה לא קשורה אחרי ניווט בתפריט */
export function clearNavBackHref(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(NAV_BACK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** מוחק את ערימת ההיסטוריה הפנימית */
export function clearNavHistoryStack(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(NAV_HISTORY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** מנקה יעד רשימה שמור וערימת חזרה — בהחלפת מוסד ובהתנתקות */
export function clearNavSession(): void {
  clearNavBackHref();
  clearNavHistoryStack();
}

export function readNavBackHref(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return parseSafeFromParam(
      window.sessionStorage.getItem(NAV_BACK_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

/** רמה אחת למעלה בעץ הניווט של האפליקציה */
export function parentHref(pathname: string, fallback = "/"): string {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const parts = pathOnly.split("/").filter(Boolean);
  if (parts.length === 0) return fallback;

  // סרטוני הדרכה — לא דרך מסך בחירת מגזר של /dashboard
  if (
    parts.length === 2 &&
    parts[0] === "dashboard" &&
    parts[1] === "tutorials"
  ) {
    return fallback;
  }

  // טבלת מסגרת קצרה → בחירת מגזר
  if (
    parts.length === 4 &&
    parts[0] === "personal-area" &&
    parts[1] === "sector-table" &&
    parts[2] &&
    parts[3]
  ) {
    return `/personal-area/sector-home/${encodeURIComponent(parts[2])}`;
  }

  // בחירת מגזר קצרה → אזור אישי
  if (
    parts.length === 3 &&
    parts[0] === "personal-area" &&
    parts[1] === "sector-home" &&
    parts[2]
  ) {
    return "/personal-area";
  }

  // ארכיון תיקי תלמידים → אזור אישי
  if (
    parts.length === 2 &&
    parts[0] === "personal-area" &&
    parts[1] === "archive"
  ) {
    return "/personal-area";
  }

  // דף בית של תיק תלמיד → כרטיס (לא רשימה גלובלית)
  if (
    parts.length === 4 &&
    parts[0] === "personal-area" &&
    parts[1] === "students" &&
    parts[2] === "portfolio" &&
    parts[3]
  ) {
    return `/personal-area/students/view/${encodeURIComponent(parts[3])}`;
  }

  // עמוד מילוי קצר ויציב → תיק תלמיד
  if (
    parts.length === 5 &&
    parts[0] === "personal-area" &&
    parts[1] === "students" &&
    parts[2] === "fill" &&
    parts[3] &&
    parts[4]
  ) {
    return `/personal-area/students/portfolio/${encodeURIComponent(parts[3])}`;
  }

  // עמוד טפסים קצר ויציב → תיק תלמיד
  if (
    parts.length === 5 &&
    parts[0] === "personal-area" &&
    parts[1] === "students" &&
    parts[2] === "forms" &&
    parts[3] &&
    parts[4]
  ) {
    return `/personal-area/students/portfolio/${encodeURIComponent(parts[3])}`;
  }

  // תיקיית משנה קצרה ויציבה (קבוצות כמו ויתור סודיות) → תיק תלמיד
  if (
    parts.length === 5 &&
    parts[0] === "personal-area" &&
    parts[1] === "students" &&
    parts[2] === "folder" &&
    parts[3] &&
    parts[4]
  ) {
    return `/personal-area/students/portfolio/${encodeURIComponent(parts[3])}`;
  }

  // תיקיית קטגוריה קצרה ויציבה → תיק תלמיד
  if (
    parts.length === 5 &&
    parts[0] === "personal-area" &&
    parts[1] === "students" &&
    (parts[2] === "category" || parts[2] === "pfolder") &&
    parts[3] &&
    parts[4]
  ) {
    return `/personal-area/students/portfolio/${encodeURIComponent(parts[3])}`;
  }

  // עריכת תלמיד → כרטיס
  if (
    parts.length === 3 &&
    parts[0] === "personal-area" &&
    parts[1] === "students" &&
    parts[2] &&
    parts[2] !== "new" &&
    parts[2] !== "portfolio" &&
    parts[2] !== "view"
  ) {
    return `/personal-area/students/view/${encodeURIComponent(parts[2])}`;
  }

  // כרטיס תלמיד → אזור אישי (לא רשימת כל התלמידים)
  if (
    parts.length === 4 &&
    parts[0] === "personal-area" &&
    parts[1] === "students" &&
    parts[2] === "view" &&
    parts[3]
  ) {
    return "/personal-area";
  }

  // הוספת תלמיד / רשימה גלובלית ישנה → אזור אישי
  if (
    parts[0] === "personal-area" &&
    parts[1] === "students" &&
    (parts.length === 2 || (parts.length === 3 && parts[2] === "new"))
  ) {
    return "/personal-area";
  }

  // /.../class-mode/[mode] → /.../class  (שם הכיתה נשמר ב־?name=)
  if (parts.length >= 2 && parts[parts.length - 2] === "class-mode") {
    const next = [...parts.slice(0, -2), "class"];
    return `/${next.join("/")}`;
  }

  // רשימת תלמידים של מורה → רוסטר הצוות / רשימת המורות (בלי ?name=)
  if (parts[parts.length - 1] === "teacher") {
    const next = parts.slice(0, -1);
    return next.length === 0 ? fallback : `/${next.join("/")}`;
  }

  parts.pop();
  while (parts.length > 0 && PAIR_KEYS.has(parts[parts.length - 1]!)) {
    parts.pop();
  }

  return parts.length === 0 ? fallback : `/${parts.join("/")}`;
}

/** עולים `levels` רמות מהנתיב הנוכחי */
export function ancestorHref(
  pathname: string,
  levels: number,
  fallback = "/"
): string {
  let current = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const steps = Math.max(0, Math.floor(levels));
  for (let i = 0; i < steps; i++) {
    const next = parentHref(current, fallback);
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * יעד חזרה אחרי `levels` לחיצות.
 * ברירת מחדל: עלייה לפי ארכיטקטורת ה-URL.
 * `from` משמש רק כשהעלייה הארכיטקטונית מאבדת הקשר רשימה (כרטיס/תיק → /personal-area).
 * `search` — לשמירת ?name= וכו׳ כשעולים מ־class-mode ל־class.
 */
export function resolveBackHref(options: {
  pathname: string;
  levels: number;
  from?: string | null;
  fallback?: string;
  search?: string | null;
}): string {
  const { pathname, levels, from, fallback = "/", search } = options;
  const safeFrom = from ? parseSafeFromParam(from) : null;
  const steps = Math.max(1, Math.floor(levels));
  const pathOnly = (pathname.split("?")[0] ?? pathname).split("#")[0] ?? pathname;

  let architectural = ancestorHref(pathOnly, steps, fallback);
  architectural = withPreservedClassContext(
    pathOnly,
    architectural,
    search
  );
  architectural = withPreservedSectorContext(pathOnly, architectural, search);

  if (!safeFrom) return architectural;

  const fromPath = (safeFrom.split("?")[0] ?? safeFrom).split("#")[0] ?? safeFrom;

  // לא לקפוץ ל-from עמוק יותר מהמיקום הנוכחי / זהה אליו
  if (fromPath === pathOnly || fromPath.startsWith(`${pathOnly}/`)) {
    return architectural;
  }

  // סרטוני הדרכה — תמיד חזרה ל־from (דף הבית / אזור אישי / דשבורד)
  if (pathOnly === "/dashboard/tutorials") {
    return safeFrom;
  }

  if (
    steps === 1 &&
    shouldPreferFromOverArchitecture(pathOnly, architectural, fromPath)
  ) {
    return safeFrom;
  }

  // לחיצות נוספות — ממשיכים לטפס מ-from רק אחרי שכבר חזרנו אליו
  if (steps > 1 && shouldPreferFromOverArchitecture(pathOnly, ancestorHref(pathOnly, 1, fallback), fromPath)) {
    return ancestorHref(fromPath, steps - 1, fallback);
  }

  return architectural;
}

const SECTOR_CONTEXT_QUERY_KEYS = ["sector", "framework", "area"] as const;

/** מעביר sector/framework/area כשעולים מרשימת מורה / סטטוס קצרה */
export function withPreservedSectorContext(
  _pathname: string,
  parent: string,
  search?: string | null
): string {
  if (!search) return parent;
  const incoming = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const parentPath = hrefPathOnly(parent);
  const existing = new URLSearchParams(
    parent.includes("?") ? parent.slice(parent.indexOf("?") + 1) : ""
  );
  for (const key of SECTOR_CONTEXT_QUERY_KEYS) {
    const value = incoming.get(key);
    if (value && !existing.get(key)) existing.set(key, value);
  }
  const qs = existing.toString();
  return qs ? `${parentPath}?${qs}` : parentPath;
}

/** מעביר ?name=/sector=/framework= כשעולים ממצב כיתה אל /class */
function withPreservedClassContext(
  pathname: string,
  parent: string,
  search?: string | null
): string {
  if (!search) return parent;
  const incoming = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  if (!incoming.get("name")) return parent;

  const pathOnly = (pathname.split("?")[0] ?? pathname).split("#")[0] ?? pathname;
  if (!/\/(?:class-mode|mode)\/(?:student|curriculum|tlk)(?:\/|$)/.test(pathOnly)) {
    return parent;
  }

  let parentPath = (parent.split("?")[0] ?? parent).split("#")[0] ?? parent;
  parentPath = parentPath.replace(/\/$/, "");
  if (parentPath.endsWith("/special-ed-class")) {
    parentPath = `${parentPath}/class`;
  }
  if (!/\/class$/.test(parentPath)) return parent;

  const existing = new URLSearchParams(
    parent.includes("?") ? parent.slice(parent.indexOf("?") + 1) : ""
  );
  for (const key of CLASS_CONTEXT_QUERY_KEYS) {
    const value = incoming.get(key);
    if (value && !existing.get(key)) existing.set(key, value);
  }
  const qs = existing.toString();
  return qs ? `${parentPath}?${qs}` : parentPath;
}

/**
 * from רלוונטי רק ביציאה מכרטיס/עריכה/תיק אל «אזור אישי» כללי —
 * כדי לחזור לרשימה המסוננת (סטטוס/כיתה) לפי הארכיטקטורה העסקית.
 * בנוסף: בתוך אותו תלמיד — חזרה לתיקייה/טפסים שממנה נפתח המסך (לא דילוג לתיק).
 */
function studentIdFromPath(pathname: string): string | null {
  const match = pathname.match(
    /\/students\/(?:view|portfolio|fill|forms|folder|category|pfolder|custom)\/([^/]+)/
  );
  if (match?.[1]) return decodeURIComponent(match[1]);
  const edit = pathname.match(/\/students\/([^/]+)$/);
  if (
    edit?.[1] &&
    edit[1] !== "new" &&
    edit[1] !== "portfolio" &&
    edit[1] !== "view"
  ) {
    return decodeURIComponent(edit[1]);
  }
  return null;
}

function isSameStudentNav(pathname: string, fromPath: string): boolean {
  const currentId = studentIdFromPath(pathname);
  const fromId = studentIdFromPath(fromPath);
  return Boolean(currentId && fromId && currentId === fromId);
}

function shouldPreferFromOverArchitecture(
  pathname: string,
  architecturalParent: string,
  fromPath: string
): boolean {
  const parentBase = (architecturalParent.split("?")[0] ?? architecturalParent)
    .split("#")[0]
    ?.replace(/\/$/, "") || "/";

  const onStudentSurface =
    /\/students\/(?:view|portfolio|fill|category|pfolder|forms|folder)\//.test(
      pathname
    ) || /\/students\/[^/]+$/.test(pathname);

  // תל"כ — לא לקפוץ לתיק התלמיד של בעל התל"כ
  if (
    onStudentSurface &&
    /\/(?:class-mode|mode)\/(?:curriculum|tlk)(?:\/|$)/.test(fromPath)
  ) {
    return true;
  }

  // מילוי/טפסים → חזרה לתיקייה או לרמת הביניים שממנה נכנסו (אותו תלמיד)
  if (
    onStudentSurface &&
    isSameStudentNav(pathname, fromPath) &&
    /\/students\/(?:category|pfolder|forms|folder|portfolio|view)\//.test(
      fromPath
    )
  ) {
    return true;
  }

  const losesListContext =
    parentBase === "/personal-area" ||
    parentBase === "/personal-area/students" ||
    parentBase === "/dashboard" ||
    parentBase === "/";

  if (!losesListContext) return false;

  if (!onStudentSurface) return false;

  // from צריך להיות רשימה בהיררכיה (סטטוס / כיתה / מורה / שכיחות)
  return (
    /\/(?:status|category)\//.test(fromPath) ||
    /\/(?:class-mode|class|teacher|frequency|mode)\//.test(fromPath)
  );
}
