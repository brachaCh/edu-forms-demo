"use client";

const RING_BUFFER_SIZE = 50;

const KNOWN_ERROR_PREFIXES = ["[problem-report]", "[auth]", "[form]", "[supabase]"];

export type TechLogNetworkEntry = {
  type: "network";
  method: string;
  urlPath: string;
  status: number | null;
  durationMs: number | null;
  timestamp: number;
};

export type TechLogErrorEntry = {
  type: "error";
  category: string;
  timestamp: number;
};

export type TechLogEntry = TechLogNetworkEntry | TechLogErrorEntry;

export type TechLogSnapshot = {
  entries: TechLogEntry[];
  pageUrl: string;
  browser: string;
  screenSize: string;
  timestamp: number;
};

const ringBuffer: TechLogEntry[] = [];
let bufferIndex = 0;
let initialized = false;

function addEntry(entry: TechLogEntry) {
  if (ringBuffer.length < RING_BUFFER_SIZE) {
    ringBuffer.push(entry);
  } else {
    ringBuffer[bufferIndex] = entry;
    bufferIndex = (bufferIndex + 1) % RING_BUFFER_SIZE;
  }
}

function redactTechLogPath(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    let path = parsed.pathname;

    if (/^\/(fill|sign)\/[^/]+/.test(path)) {
      return path.startsWith("/fill/") ? "/fill/[token]" : "/sign/[token]";
    }

    if (path.includes("/storage/v1/object/")) {
      const parts = path.split("/");
      const opIndex = parts.indexOf("object");
      if (opIndex >= 0 && parts[opIndex + 1] && parts[opIndex + 2]) {
        return `/storage/v1/object/${parts[opIndex + 1]}/${parts[opIndex + 2]}/...`;
      }
    }

    path = path.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ":id"
    );
    path = path.replace(/[0-9a-f]{16,}/gi, ":id");
    path = path.replace(/\d{8,}/g, ":id");

    return path;
  } catch {
    const match = url.match(/^[^?#]*/);
    const raw = match?.[0] ?? url;
    return raw.replace(/[0-9a-f-]{36}/gi, ":id").replace(/\d{8,}/g, ":id");
  }
}

function extractErrorCategory(args: unknown[]): string {
  if (args.length === 0) return "unknown_error";

  const first = args[0];

  if (first instanceof Error) {
    return first.name || "Error";
  }

  if (typeof first === "string") {
    for (const prefix of KNOWN_ERROR_PREFIXES) {
      if (first.startsWith(prefix)) {
        return prefix.slice(1, -1);
      }
    }
    if (first.startsWith("[") && first.includes("]")) {
      const tag = first.match(/^\[([^\]]+)\]/)?.[1];
      if (tag && tag.length <= 30 && /^[a-z0-9-]+$/i.test(tag)) {
        return tag;
      }
    }
  }

  return "console_error";
}

function wrapFetch() {
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : String(input);
    const method =
      input instanceof Request ? input.method : (init?.method ?? "GET");
    const startTime = Date.now();
    let status: number | null = null;

    try {
      const response = await originalFetch.call(this, input, init);
      status = response.status;
      return response;
    } finally {
      addEntry({
        type: "network",
        method: method.toUpperCase(),
        urlPath: redactTechLogPath(url),
        status,
        durationMs: Date.now() - startTime,
        timestamp: startTime,
      });
    }
  };
}

function wrapXHR() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    (this as XMLHttpRequest & { __techLogMethod?: string; __techLogUrl?: string }).__techLogMethod = method;
    (this as XMLHttpRequest & { __techLogUrl?: string }).__techLogUrl = typeof url === "string" ? url : url.href;
    return originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as XMLHttpRequest & { __techLogMethod?: string; __techLogUrl?: string };
    const method = xhr.__techLogMethod ?? "GET";
    const url = xhr.__techLogUrl ?? "";
    const startTime = Date.now();

    const onComplete = () => {
      addEntry({
        type: "network",
        method: method.toUpperCase(),
        urlPath: redactTechLogPath(url),
        status: xhr.status || null,
        durationMs: Date.now() - startTime,
        timestamp: startTime,
      });
    };

    xhr.addEventListener("load", onComplete);
    xhr.addEventListener("error", onComplete);
    xhr.addEventListener("abort", onComplete);

    return originalSend.call(this, body);
  };
}

function wrapConsoleError() {
  const originalError = console.error;
  console.error = function (...args: unknown[]) {
    addEntry({
      type: "error",
      category: extractErrorCategory(args),
      timestamp: Date.now(),
    });

    return originalError.apply(this, args);
  };
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  const reason = event.reason;
  const category =
    reason instanceof Error ? reason.name : "unhandled_rejection";

  addEntry({
    type: "error",
    category,
    timestamp: Date.now(),
  });
}

function handleGlobalError(_event: ErrorEvent) {
  addEntry({
    type: "error",
    category: "global_error",
    timestamp: Date.now(),
  });
}

export function initTechLog() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  try {
    wrapFetch();
  } catch {
    // fetch wrap failed
  }

  try {
    wrapXHR();
  } catch {
    // XHR wrap failed
  }

  try {
    wrapConsoleError();
  } catch {
    // console.error wrap failed
  }

  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  window.addEventListener("error", handleGlobalError);
}

export function getTechLogSnapshot(): TechLogSnapshot {
  const ordered: TechLogEntry[] = [];
  if (ringBuffer.length < RING_BUFFER_SIZE) {
    ordered.push(...ringBuffer);
  } else {
    for (let i = 0; i < RING_BUFFER_SIZE; i++) {
      const idx = (bufferIndex + i) % RING_BUFFER_SIZE;
      const entry = ringBuffer[idx];
      if (entry) ordered.push(entry);
    }
  }

  const rawPageUrl =
    typeof window !== "undefined" ? window.location.pathname : "";
  const pageUrl = redactTechLogPath(rawPageUrl);

  return {
    entries: ordered,
    pageUrl,
    browser: typeof navigator !== "undefined" ? navigator.userAgent : "",
    screenSize:
      typeof window !== "undefined"
        ? `${window.screen.width}x${window.screen.height}`
        : "",
    timestamp: Date.now(),
  };
}

export function formatTechLogForSubmit(snapshot: TechLogSnapshot): string {
  const lines: string[] = [
    `נתיב: ${snapshot.pageUrl}`,
    `מסך: ${snapshot.screenSize}`,
    `דפדפן: ${snapshot.browser}`,
    "",
    "--- רשומות אחרונות ---",
  ];

  for (const entry of snapshot.entries) {
    const time = new Date(entry.timestamp).toLocaleTimeString("he-IL");
    if (entry.type === "network") {
      const status = entry.status ?? "?";
      const duration = entry.durationMs != null ? `${entry.durationMs}ms` : "?";
      lines.push(`[${time}] ${entry.method} ${entry.urlPath} → ${status} (${duration})`);
    } else {
      lines.push(`[${time}] שגיאה: [${entry.category}]`);
    }
  }

  return lines.join("\n");
}

export function clearTechLog() {
  ringBuffer.length = 0;
  bufferIndex = 0;
}
