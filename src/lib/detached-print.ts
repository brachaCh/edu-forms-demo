/**
 * חלון הדפסה מנותק.
 *
 * `window.open("", "_blank")` + `print()` פותח חלון שחולק תהליך עם הדף הראשי —
 * וכל עוד דיאלוג ההדפסה פתוח, הדף הראשי קפוא (Chrome/Edge).
 * כאן פותחים את החלון עם `noopener` (תהליך נפרד) לדף `/print/[key]`,
 * ומעבירים אליו את ה-HTML + התקדמות דרך BroadcastChannel.
 *
 * שימוש:
 *   const win = openDetachedPrintWindow("הדפסת טופס");   // מיד בלחיצה
 *   … בניית HTML (async) …
 *   if (!(await win.whenReady())) { alert(POPUP_BLOCKED_MESSAGE); return; }
 *   win.deliver(html, { autoPrint: true });
 */

export const POPUP_BLOCKED_MESSAGE =
  "הדפדפן חסם את חלון ההדפסה. יש לאפשר חלונות קופצים.";

/** מוצג בחלון ההדפסה כשאין כל הודעה מהדף הראשי (כולל אחרי עדכון פריסה) */
export const PRINT_ORPHAN_MESSAGE =
  "לא התקבל מסמך להדפסה. רעננו את הדף הראשי (ייתכן שהמערכת עודכנה) ונסו שוב.";

export const PRINT_HANDOFF_TOO_LARGE_MESSAGE =
  "המסמך גדול מדי להעברה לחלון ההדפסה. נסו להדפיס תיקיות בודדות.";

export const PRINT_WINDOW_NOT_READY_MESSAGE =
  "חלון ההדפסה לא התחבר לדף הראשי. רעננו את הדף הראשי ונסו שוב.";

export const DETACHED_PRINT_CHANNEL_PREFIX = "matoah-print:";

/** BroadcastChannel עם noopener לפעמים לא מעביר הודעות — localStorage משותף לאותו origin */
export const PRINT_BUS_STORAGE_PREFIX = "matoah-print-bus:";
export const PRINT_REPLY_STORAGE_PREFIX = "matoah-print-reply:";
export const PRINT_HTML_STORAGE_PREFIX = "matoah-print-html:";
export const PRINT_CONSUMED_STORAGE_PREFIX = "matoah-print-consumed:";
export const PRINT_HTML_IDB_NAME = "matoah-print";
export const PRINT_HTML_IDB_STORE = "deliveries";
/** leftover student files older than this are wiped on app start / logout */
export const PRINT_HANDOFF_TTL_MS = 10 * 60 * 1000;

/** מוצג אחרי F5 בחלון שהמסמך שלו כבר נמחק (קריאה חד-פעמית) */
export const PRINT_CONSUMED_MESSAGE =
  "המסמך כבר הודפס. הדפיסו שוב מהדף הראשי.";

/** BroadcastChannel עלול להיכשל על מחרוזת אחת ענקית — מפצלים לנתחים */
export const PRINT_HTML_CHUNK_CHARS = 240_000;

/** הודעות מהדף הראשי לחלון ההדפסה */
export type DetachedPrintMessage =
  | { type: "progress"; done: number; total: number; label?: string }
  | { type: "html"; html: string; autoPrint: boolean }
  | {
      type: "html-chunk";
      id: string;
      index: number;
      total: number;
      chunk: string;
      autoPrint: boolean;
    }
  | { type: "html-stored"; autoPrint: boolean }
  | { type: "error"; message: string }
  | { type: "close" };

export type PrintBusEnvelope = {
  seq: number;
  message: DetachedPrintMessage;
  createdAt?: number;
};
export type PrintReplyEnvelope = {
  seq: number;
  message: DetachedPrintReply;
  createdAt?: number;
};
export type StoredPrintHtml = {
  html: string;
  autoPrint: boolean;
  createdAt: number;
};

/** הודעות מחלון ההדפסה לדף הראשי */
export type DetachedPrintReply = { type: "ready" } | { type: "printed" };

export interface DetachedPrintWindow {
  readonly key: string;
  /** true כשחלון ההדפסה נטען ומאזין; false אם נחסם/לא נפתח בזמן */
  whenReady(timeoutMs?: number): Promise<boolean>; // ברירת מחדל 15 שניות
  setProgress(done: number, total: number, label?: string): void;
  /**
   * שולח את ה-HTML המלא לחלון. `autoPrint` — להוסיף סקריפט שמדפיס אחרי טעינת התמונות
   * (false כשה-HTML כבר כולל סקריפט הדפסה משלו).
   */
  deliver(html: string, options?: { autoPrint?: boolean }): void;
  /** מציג שגיאה ספציפית בחלון במקום לסגור אותו בשקט */
  fail(message: string): void;
  /** סוגר את חלון ההדפסה (למשל אחרי כישלון) ומנתק את הערוץ */
  close(): void;
  /** מנתק את הערוץ בלי לסגור את החלון (אחרי מסירה מוצלחת) */
  dispose(): void;
}

export function splitPrintHtmlChunks(
  html: string,
  maxChars = PRINT_HTML_CHUNK_CHARS
): string[] {
  const size = Math.max(1, maxChars);
  if (html.length <= size) return [html];
  const chunks: string[] = [];
  for (let i = 0; i < html.length; i += size) {
    chunks.push(html.slice(i, i + size));
  }
  return chunks;
}

/** מחזיר את ה-HTML המלא כשכל הנתחים הגיעו; אחרת null */
export function assemblePrintHtmlChunks(
  parts: Array<string | undefined>,
  total: number
): string | null {
  if (total <= 0) return null;
  const out: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const part = parts[i];
    if (typeof part !== "string") return null;
    out.push(part);
  }
  return out.join("");
}

export function htmlDeliveryMessages(
  html: string,
  autoPrint: boolean,
  chunkId?: string
): DetachedPrintMessage[] {
  const chunks = splitPrintHtmlChunks(html);
  if (chunks.length <= 1) {
    return [{ type: "html", html, autoPrint }];
  }
  const id = chunkId || `html-${chunks.length}`;
  return chunks.map((chunk, index) => ({
    type: "html-chunk" as const,
    id,
    index,
    total: chunks.length,
    chunk,
    autoPrint,
  }));
}

export function detachedPrintChannelName(key: string): string {
  return `${DETACHED_PRINT_CHANNEL_PREFIX}${key}`;
}

export function detachedPrintUrl(key: string, title: string): string {
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  const query = params.toString();
  return `/print/${encodeURIComponent(key)}${query ? `?${query}` : ""}`;
}

export function printBusStorageKey(key: string): string {
  return `${PRINT_BUS_STORAGE_PREFIX}${key}`;
}

export function printReplyStorageKey(key: string): string {
  return `${PRINT_REPLY_STORAGE_PREFIX}${key}`;
}

export function printHtmlStorageKey(key: string): string {
  return `${PRINT_HTML_STORAGE_PREFIX}${key}`;
}

export function printConsumedStorageKey(key: string): string {
  return `${PRINT_CONSUMED_STORAGE_PREFIX}${key}`;
}

export function parsePrintBusEnvelope(
  raw: string | null | undefined
): PrintBusEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PrintBusEnvelope>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.seq !== "number" || !parsed.message) return null;
    if (typeof parsed.message !== "object" || !("type" in parsed.message)) {
      return null;
    }
    return {
      seq: parsed.seq,
      message: parsed.message as DetachedPrintMessage,
      createdAt:
        typeof parsed.createdAt === "number" ? parsed.createdAt : undefined,
    };
  } catch {
    return null;
  }
}

export function parsePrintReplyEnvelope(
  raw: string | null | undefined
): PrintReplyEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PrintReplyEnvelope>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.seq !== "number" || !parsed.message) return null;
    if (parsed.message.type !== "ready" && parsed.message.type !== "printed") {
      return null;
    }
    return {
      seq: parsed.seq,
      message: parsed.message as DetachedPrintReply,
      createdAt:
        typeof parsed.createdAt === "number" ? parsed.createdAt : undefined,
    };
  } catch {
    return null;
  }
}

export function nextPrintEnvelope<T>(
  prevRaw: string | null | undefined,
  message: T,
  parsePrev: (
    raw: string | null | undefined
  ) => { seq: number; createdAt?: number } | null
): string {
  const prev = parsePrev(prevRaw);
  return JSON.stringify({
    seq: (prev?.seq ?? 0) + 1,
    message,
    createdAt: prev?.createdAt ?? Date.now(),
  });
}

/** הודעות קטנות בלבד — HTML מלא נשמר ב-IndexedDB */
export function shouldMirrorPrintMessage(
  message: DetachedPrintMessage
): boolean {
  return (
    message.type === "progress" ||
    message.type === "error" ||
    message.type === "close" ||
    message.type === "html-stored"
  );
}

function openPrintHtmlDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PRINT_HTML_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRINT_HTML_IDB_STORE)) {
        db.createObjectStore(PRINT_HTML_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("PRINT_IDB_OPEN_FAILED"));
  });
}

export async function storePrintHtml(
  key: string,
  html: string,
  autoPrint: boolean,
  createdAt = Date.now()
): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const db = await openPrintHtmlDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PRINT_HTML_IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("PRINT_IDB_WRITE_FAILED"));
      tx.objectStore(PRINT_HTML_IDB_STORE).put(
        { html, autoPrint, createdAt } satisfies StoredPrintHtml,
        key
      );
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function readPrintHtml(key: string): Promise<StoredPrintHtml | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openPrintHtmlDb();
    const value = await new Promise<StoredPrintHtml | null>((resolve, reject) => {
      const tx = db.transaction(PRINT_HTML_IDB_STORE, "readonly");
      const req = tx.objectStore(PRINT_HTML_IDB_STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as Partial<StoredPrintHtml> | undefined;
        if (row && typeof row.html === "string") {
          resolve({
            html: row.html,
            autoPrint: Boolean(row.autoPrint),
            createdAt: typeof row.createdAt === "number" ? row.createdAt : 0,
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error ?? new Error("PRINT_IDB_READ_FAILED"));
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function deletePrintHtml(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openPrintHtmlDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PRINT_HTML_IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("PRINT_IDB_DELETE_FAILED"));
      tx.objectStore(PRINT_HTML_IDB_STORE).delete(key);
    });
    db.close();
  } catch {
    // ignore
  }
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function listMatoahPrintStorageKeys(
  storage: Pick<Storage, "length" | "key"> | null = safeLocalStorage()
): string[] {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") {
    return [];
  }
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const storedKey = storage.key(i);
    if (storedKey?.startsWith("matoah-print")) keys.push(storedKey);
  }
  return keys;
}

function readStorageCreatedAt(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { createdAt?: unknown };
    return typeof parsed.createdAt === "number" ? parsed.createdAt : null;
  } catch {
    return null;
  }
}

/** מסיר את מפתחות ה-handoff לחלון (לא את סמן «כבר הודפס») */
export function clearPrintHandoffStorage(key: string): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(printBusStorageKey(key));
    storage.removeItem(printReplyStorageKey(key));
    storage.removeItem(printHtmlStorageKey(key));
  } catch {
    // ignore
  }
}

export function markPrintConsumed(key: string, createdAt = Date.now()): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(
      printConsumedStorageKey(key),
      JSON.stringify({ createdAt })
    );
  } catch {
    // ignore
  }
}

export function isPrintConsumed(key: string): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  try {
    return storage.getItem(printConsumedStorageKey(key)) !== null;
  } catch {
    return false;
  }
}

export async function deletePrintHandoff(key: string): Promise<void> {
  await deletePrintHtml(key);
  clearPrintHandoffStorage(key);
}

export async function consumePrintHandoff(key: string): Promise<void> {
  markPrintConsumed(key);
  await deletePrintHandoff(key);
}

export function shouldPublishStoredPrintHtml(state: {
  ok: boolean;
  disposed: boolean;
  closed: boolean;
  consumed: boolean;
}): "post" | "delete" | "skip" {
  if (state.disposed || state.closed || state.consumed) return "delete";
  if (state.ok) return "post";
  return "skip";
}

export function sweepExpiredPrintLocalStorage(
  now = Date.now(),
  ttlMs = PRINT_HANDOFF_TTL_MS
): string[] {
  const storage = safeLocalStorage();
  if (!storage) return [];
  const removed: string[] = [];
  for (const storedKey of listMatoahPrintStorageKeys(storage)) {
    let expired = storedKey.startsWith(PRINT_HTML_STORAGE_PREFIX);
    if (!expired) {
      try {
        const createdAt = readStorageCreatedAt(storage.getItem(storedKey));
        expired = createdAt === null || now - createdAt > ttlMs;
      } catch {
        expired = true;
      }
    }
    if (!expired) continue;
    try {
      storage.removeItem(storedKey);
      removed.push(storedKey);
    } catch {
      // ignore
    }
  }
  return removed;
}

export async function sweepExpiredPrintHtml(
  now = Date.now(),
  ttlMs = PRINT_HANDOFF_TTL_MS
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openPrintHtmlDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PRINT_HTML_IDB_STORE, "readwrite");
      const store = tx.objectStore(PRINT_HTML_IDB_STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const row = cursor.value as Partial<StoredPrintHtml> | undefined;
        const createdAt = typeof row?.createdAt === "number" ? row.createdAt : 0;
        if (!createdAt || now - createdAt > ttlMs) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("PRINT_IDB_SWEEP_FAILED"));
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function sweepExpiredPrintHandoffs(now = Date.now()): Promise<void> {
  sweepExpiredPrintLocalStorage(now);
  await sweepExpiredPrintHtml(now);
}

export async function clearAllPrintHandoffs(): Promise<void> {
  const storage = safeLocalStorage();
  if (storage) {
    for (const storedKey of listMatoahPrintStorageKeys(storage)) {
      try {
        storage.removeItem(storedKey);
      } catch {
        // ignore
      }
    }
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openPrintHtmlDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PRINT_HTML_IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("PRINT_IDB_CLEAR_FAILED"));
      tx.objectStore(PRINT_HTML_IDB_STORE).clear();
    });
    db.close();
  } catch {
    // ignore
  }
}

/** IndexedDB only — document HTML must not go into localStorage */
export async function persistPrintHtml(
  key: string,
  html: string,
  autoPrint: boolean
): Promise<boolean> {
  return storePrintHtml(key, html, autoPrint);
}

export async function loadPersistedPrintHtml(
  key: string
): Promise<StoredPrintHtml | null> {
  return readPrintHtml(key);
}

function writeStorageEnvelope(
  storageKey: string,
  message: unknown,
  parsePrev: (
    raw: string | null | undefined
  ) => { seq: number; createdAt?: number } | null
): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(
      storageKey,
      nextPrintEnvelope(storage.getItem(storageKey), message, parsePrev)
    );
    return true;
  } catch {
    return false;
  }
}

export function writePrintBusMessage(
  key: string,
  message: DetachedPrintMessage
): boolean {
  if (!shouldMirrorPrintMessage(message)) return false;
  return writeStorageEnvelope(printBusStorageKey(key), message, parsePrintBusEnvelope);
}

export function writePrintReply(
  key: string,
  message: DetachedPrintReply
): boolean {
  return writeStorageEnvelope(
    printReplyStorageKey(key),
    message,
    parsePrintReplyEnvelope
  );
}

function randomKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * פותח חלון הדפסה מנותק. יש לקרוא סינכרונית בתוך אירוע הלחיצה
 * (אחרת חוסם החלונות הקופצים יעצור אותו).
 * מחזיר null אם אין BroadcastChannel (דפדפן ישן) — אז נופלים למסלול הרגיל.
 */
export function openDetachedPrintWindow(title: string): DetachedPrintWindow | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  const key = randomKey();
  const channel = new BroadcastChannel(detachedPrintChannelName(key));

  let ready = false;
  let disposed = false;
  let closed = false;
  let pending: DetachedPrintMessage[] = [];
  const readyWaiters: Array<(value: boolean) => void> = [];

  const markReady = () => {
    const firstTime = !ready;
    ready = true;
    if (firstTime) {
      for (const resolve of readyWaiters.splice(0)) resolve(true);
      flush(pending.splice(0));
    }
    // F5 after a successful read-once delivery must not resend the student file
  };

  const post = (message: DetachedPrintMessage): boolean => {
    if (disposed) return false;
    writePrintBusMessage(key, message);
    try {
      channel.postMessage(message);
      return true;
    } catch {
      return false;
    }
  };

  const postHandoffError = () => {
    post({ type: "error", message: PRINT_HANDOFF_TOO_LARGE_MESSAGE });
  };

  const flush = (messages: DetachedPrintMessage[]) => {
    for (const message of messages) {
      if (post(message)) continue;
      if (message.type === "html" || message.type === "html-chunk") {
        postHandoffError();
        return;
      }
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== printReplyStorageKey(key)) return;
    const reply = parsePrintReplyEnvelope(event.newValue)?.message;
    if (reply?.type === "ready") markReady();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  const dropHandoff = () => {
    void deletePrintHandoff(key);
  };

  /** HTML/IDB only — keep the bus so a late-ready print window can still read error/close. */
  const dropHtml = () => {
    void deletePrintHtml(key);
    const storage = safeLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(printReplyStorageKey(key));
      storage.removeItem(printHtmlStorageKey(key));
    } catch {
      // ignore
    }
  };

  const replyPoll = window.setInterval(() => {
    if (ready || disposed) return;
    try {
      const reply = parsePrintReplyEnvelope(
        localStorage.getItem(printReplyStorageKey(key))
      )?.message;
      if (reply?.type === "ready") markReady();
    } catch {
      // localStorage can throw in private mode / full quota
    }
  }, 400);

  channel.onmessage = (event: MessageEvent<DetachedPrintReply>) => {
    const reply = event.data;
    if (!reply || typeof reply !== "object") return;
    if (reply.type === "ready") markReady();
  };

  const teardown = (delayMs: number, options?: { keepBus?: boolean }) => {
    window.setTimeout(() => {
      const leftover = pending.splice(0);
      if (leftover.length > 0) {
        flush(leftover);
      }
      disposed = true;
      if (options?.keepBus) {
        dropHtml();
      } else {
        dropHandoff();
      }
      window.clearInterval(replyPoll);
      window.removeEventListener("storage", onStorage);
      for (const resolve of readyWaiters.splice(0)) resolve(false);
      try {
        channel.close();
      } catch {
        // ignore
      }
    }, delayMs);
  };

  const deliverTerminal = (
    message: Extract<DetachedPrintMessage, { type: "error" } | { type: "close" }>
  ) => {
    closed = true;
    // Stale progress must not overwrite the terminal envelope on the shared bus key.
    pending = pending.filter(
      (item) => item.type === "error" || item.type === "close"
    );
    pending.push(message);
    post(message);
    dropHtml();
    teardown(300, { keepBus: true });
  };

  // noopener → מחזיר תמיד null; הצלחה נמדדת לפי הודעת "ready" מהחלון
  window.open(detachedPrintUrl(key, title), "_blank", "noopener,noreferrer");

  const send = (message: DetachedPrintMessage) => {
    if (ready) {
      if (
        !post(message) &&
        (message.type === "html" || message.type === "html-chunk")
      ) {
        postHandoffError();
      }
    } else {
      pending.push(message);
    }
  };

  return {
    key,
    whenReady(timeoutMs = 15_000) {
      if (ready) return Promise.resolve(true);
      if (disposed) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => {
          const index = readyWaiters.indexOf(wrapped);
          if (index >= 0) readyWaiters.splice(index, 1);
          closed = true;
          dropHandoff();
          resolve(false);
        }, timeoutMs);
        const wrapped = (value: boolean) => {
          window.clearTimeout(timer);
          resolve(value);
        };
        readyWaiters.push(wrapped);
      });
    },
    setProgress(done, total, label) {
      send({ type: "progress", done, total, label });
    },
    deliver(html, options) {
      const autoPrint = options?.autoPrint ?? true;
      const messages = htmlDeliveryMessages(html, autoPrint, randomKey());
      void persistPrintHtml(key, html, autoPrint).then((ok) => {
        const action = shouldPublishStoredPrintHtml({
          ok,
          disposed,
          closed,
          consumed: isPrintConsumed(key),
        });
        if (action === "delete") {
          void deletePrintHtml(key);
          return;
        }
        if (action === "post") post({ type: "html-stored", autoPrint });
      });
      if (ready) flush(messages);
      else pending.push(...messages);
    },
    fail(message) {
      deliverTerminal({ type: "error", message });
    },
    close() {
      deliverTerminal({ type: "close" });
    },
    dispose() {
      // משאירים את הערוץ פתוח עוד קצת — למקרה של ריענון החלון
      teardown(60_000);
    },
  };
}

/** סקריפט שמדפיס אחרי שכל התמונות נטענו (מוזרק ל-HTML כש-autoPrint) */
export const AUTO_PRINT_SCRIPT = `<script>
(function () {
  var printed = false;
  function go() {
    if (printed) return;
    printed = true;
    try { window.focus(); window.print(); } catch (e) {}
  }
  var imgs = Array.prototype.slice.call(document.images);
  if (imgs.length === 0) { setTimeout(go, 200); return; }
  var pending = imgs.length;
  function done() { pending -= 1; if (pending <= 0) setTimeout(go, 80); }
  imgs.forEach(function (img) {
    if (img.complete) { done(); return; }
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
  setTimeout(go, 12000);
})();
</script>`;

/** מוסיף את סקריפט ההדפסה לפני </body> (או בסוף אם אין) */
export function withAutoPrintScript(html: string): string {
  const index = html.lastIndexOf("</body>");
  if (index < 0) return `${html}${AUTO_PRINT_SCRIPT}`;
  return `${html.slice(0, index)}${AUTO_PRINT_SCRIPT}${html.slice(index)}`;
}
