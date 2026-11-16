/**
 * Allowlist לעותק HTML של formSnapshotToFile — נכשל-סגור.
 * רק תגיות/מאפיינים שה-snapshot באמת מפיק.
 */

const ALLOWED_TAGS = new Set([
  "html",
  "head",
  "body",
  "meta",
  "title",
  "style",
  "header",
  "footer",
  "section",
  "div",
  "span",
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "col",
  "colgroup",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "u",
  "sup",
  "img",
]);

const VOID_TAGS = new Set(["br", "img", "meta", "col"]);

const GLOBAL_ATTRS = new Set(["class", "style", "dir", "lang"]);

const EXTRA_ATTRS: Record<string, ReadonlySet<string>> = {
  img: new Set(["src", "alt", "decoding"]),
  meta: new Set(["charset"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  div: new Set(["aria-hidden"]),
  header: new Set(["aria-hidden"]),
};

const URLISH_ATTRS = new Set([
  "src",
  "href",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "cite",
  "data",
  "srcset",
  "background",
]);

const EVENT_ATTR_IN_RAW = /(?:\s|\/)on[a-z]+\s*=/i;
const FORBIDDEN_TAGS_IN_RAW =
  /<(?:script|iframe|object|embed|base|form|link|svg|math|video|audio|source|track|template|noscript)\b/i;

function isWs(ch: string | undefined): boolean {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "\f";
}

function fromCodePointSafe(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** פענוח ישויות לפני בדיקת URL — כולל כפל-קידוד קצר */
export function decodeHtmlEntities(value: string): string {
  let prev = value;
  for (let n = 0; n < 3; n += 1) {
    const next = prev
      .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
        fromCodePointSafe(parseInt(hex, 16))
      )
      .replace(/&#(\d+);?/g, (_, dec: string) => fromCodePointSafe(Number(dec)))
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&nbsp;/gi, " ");
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

function compactLower(value: string): string {
  return value.toLowerCase().replace(/[\s\u0000-\u001f\u007f]+/g, "");
}

/** פענוח CSS escapes (\73 vg, \\75\\72\\6c) לפני בדיקת url() */
function decodeCssEscapes(value: string): string {
  return value
    .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?/g, (_, hex: string) =>
      fromCodePointSafe(parseInt(hex, 16))
    )
    .replace(/\\(.)/g, "$1");
}

const RASTER_DATA_URI =
  /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/]+=*$/i;

/** לוגו SVG כ-<img src> בלבד — הדפדפן לא מריץ script ב-SVG-as-image */
function isAllowedSvgDataUri(compact: string): boolean {
  if (!compact.startsWith("data:image/svg+xml")) return false;
  const comma = compact.indexOf(",");
  if (comma < 0 || comma === compact.length - 1) return false;
  const params = compact.slice("data:image/svg+xml".length, comma);
  if (
    params &&
    !/^;(?:charset=[-\w.]+|base64|utf-?8)(?:;(?:charset=[-\w.]+|base64|utf-?8))*$/.test(
      params
    )
  ) {
    return false;
  }
  const payload = compact.slice(comma + 1);
  if (/(?:^|;)base64(?:;|$)/.test(params)) {
    return /^[a-z0-9+/]+=*$/.test(payload);
  }
  return payload.length > 0;
}

export function isDangerousUrl(value: string): boolean {
  const compact = compactLower(decodeHtmlEntities(value));
  if (/^(?:javascript|vbscript|livescript):/.test(compact)) return true;
  if (compact.startsWith("data:text/html")) return true;
  if (compact.startsWith("data:text/javascript")) return true;
  if (compact.startsWith("data:application/javascript")) return true;
  if (compact.startsWith("data:application/x-javascript")) return true;
  return false;
}

function isAllowedImgSrc(value: string): boolean {
  if (isDangerousUrl(value)) return false;
  const decoded = decodeHtmlEntities(value).trim();
  const compact = compactLower(decoded);
  if (compact.startsWith("data:")) {
    return RASTER_DATA_URI.test(compact) || isAllowedSvgDataUri(compact);
  }
  if (decoded.startsWith("/") && !decoded.startsWith("//")) return true;
  if (/^https?:\/\//i.test(decoded)) return true;
  return false;
}

function isAllowedStyleValue(value: string): boolean {
  const compact = compactLower(
    decodeCssEscapes(decodeHtmlEntities(value))
  );
  if (compact.includes("javascript:")) return false;
  if (compact.includes("vbscript:")) return false;
  if (compact.includes("expression(")) return false;
  if (compact.includes("@import")) return false;
  if (compact.includes("behavior:")) return false;
  if (compact.includes("-moz-binding")) return false;
  // snapshots לא משתמשים ב-url() — כל url(...) נדחה (כולל data:image/svg+xml)
  if (compact.includes("url(")) return false;
  return true;
}

function isAllowedAttr(tag: string, name: string, value: string): boolean {
  if (/^on[a-z]+$/.test(name)) return false;
  if (!/^[a-z][a-z0-9:-]*$/.test(name)) return false;
  const extra = EXTRA_ATTRS[tag];
  if (!GLOBAL_ATTRS.has(name) && !extra?.has(name)) return false;
  if (name === "style" && !isAllowedStyleValue(value)) return false;
  if (URLISH_ATTRS.has(name) && isDangerousUrl(value)) return false;
  if (tag === "img" && name === "src" && !isAllowedImgSrc(value)) return false;
  if (tag === "meta") {
    if (name === "charset") return value.trim().toLowerCase() === "utf-8";
    return false;
  }
  if (name === "decoding") return value.trim().toLowerCase() === "sync";
  if (name === "colspan" || name === "rowspan") return /^\d+$/.test(value.trim());
  if (name === "aria-hidden") return value.trim() === "true" || value.trim() === "false";
  return true;
}

function skipWs(html: string, i: number): number {
  while (i < html.length && isWs(html[i])) i += 1;
  return i;
}

function parseAttributes(
  html: string,
  start: number
): { attrs: Array<{ name: string; value: string }>; selfClosing: boolean; next: number } | null {
  const attrs: Array<{ name: string; value: string }> = [];
  let i = start;
  let selfClosing = false;
  while (i < html.length) {
    while (i < html.length && (isWs(html[i]) || html[i] === "/")) {
      if (html[i] === "/" && html[i + 1] === ">") {
        return { attrs, selfClosing: true, next: i + 2 };
      }
      i += 1;
    }
    if (html[i] === ">") return { attrs, selfClosing, next: i + 1 };
    if (i >= html.length) return null;

    const nameStart = i;
    while (
      i < html.length &&
      !isWs(html[i]) &&
      html[i] !== "=" &&
      html[i] !== ">" &&
      html[i] !== "/"
    ) {
      i += 1;
    }
    if (i === nameStart) return null;
    const name = html.slice(nameStart, i).toLowerCase();
    i = skipWs(html, i);
    let value = "";
    if (html[i] === "=") {
      i = skipWs(html, i + 1);
      if (html[i] === '"' || html[i] === "'") {
        const q = html[i];
        i += 1;
        const valueStart = i;
        while (i < html.length && html[i] !== q) i += 1;
        if (html[i] !== q) return null;
        value = html.slice(valueStart, i);
        i += 1;
      } else {
        const valueStart = i;
        while (
          i < html.length &&
          !isWs(html[i]) &&
          html[i] !== ">" &&
          html[i] !== "/"
        ) {
          i += 1;
        }
        value = html.slice(valueStart, i);
      }
    }
    attrs.push({ name, value });
  }
  return null;
}

function consumeStyleBody(html: string, start: number): number | null {
  const close = html.slice(start).search(/<\/style\s*>/i);
  if (close < 0) return null;
  const body = html.slice(start, start + close);
  if (body.includes("<")) return null;
  if (!isAllowedStyleValue(body)) return null;
  const endTag = html.slice(start + close).match(/^<\/style\s*>/i);
  if (!endTag) return null;
  return start + close + endTag[0].length;
}

/**
 * true רק אם זה עותק formSnapshotToFile — כל תג/מאפיין אחר נדחה.
 */
export function isFormSnapshotHtml(html: string): boolean {
  if (!html || html.includes("\u0000")) return false;
  const trimmed = html.replace(/^\uFEFF/, "").trim();
  if (!/^<!DOCTYPE html>/i.test(trimmed)) return false;
  if (!/<html\s+lang="he"\s+dir="rtl">/i.test(trimmed)) return false;
  if (!/<meta\s+charset="utf-8"/i.test(trimmed)) return false;
  if (!/<div class="page">/.test(trimmed)) return false;
  if (!/<div class="page-frame"/.test(trimmed)) return false;
  if (!/<\/html>\s*$/i.test(trimmed)) return false;
  if (EVENT_ATTR_IN_RAW.test(trimmed)) return false;
  if (FORBIDDEN_TAGS_IN_RAW.test(trimmed)) return false;
  if (/<!--/.test(trimmed)) return false;
  if (/<meta\b[^>]*http-equiv\b/i.test(trimmed)) return false;

  const afterDoctype = trimmed.replace(/^<!DOCTYPE html>\s*/i, "");
  let i = 0;
  while (i < afterDoctype.length) {
    const lt = afterDoctype.indexOf("<", i);
    if (lt < 0) {
      break;
    }
    if (lt > i) {
      i = lt;
    }
    if (afterDoctype.startsWith("</", i)) {
      i += 2;
      const nameStart = i;
      while (i < afterDoctype.length && /[a-zA-Z0-9:-]/.test(afterDoctype[i]!)) {
        i += 1;
      }
      const name = afterDoctype.slice(nameStart, i).toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return false;
      i = skipWs(afterDoctype, i);
      if (afterDoctype[i] !== ">") return false;
      i += 1;
      continue;
    }
    if (afterDoctype[i + 1] === "!" || afterDoctype[i + 1] === "?") {
      return false;
    }
    if (afterDoctype[i] !== "<") return false;
    i += 1;
    const nameStart = i;
    if (!/[a-zA-Z]/.test(afterDoctype[i] ?? "")) return false;
    while (i < afterDoctype.length && /[a-zA-Z0-9:-]/.test(afterDoctype[i]!)) {
      i += 1;
    }
    const name = afterDoctype.slice(nameStart, i).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return false;
    const parsed = parseAttributes(afterDoctype, i);
    if (!parsed) return false;
    for (const attr of parsed.attrs) {
      if (!isAllowedAttr(name, attr.name, attr.value)) return false;
    }
    i = parsed.next;
    if (name === "style") {
      if (parsed.selfClosing) return false;
      const afterStyle = consumeStyleBody(afterDoctype, i);
      if (afterStyle == null) return false;
      i = afterStyle;
      continue;
    }
    if (parsed.selfClosing && !VOID_TAGS.has(name) && name !== "style") {
      // <div /> לא מופיע ב-snapshot — נכשל-סגור
      return false;
    }
  }
  return true;
}
