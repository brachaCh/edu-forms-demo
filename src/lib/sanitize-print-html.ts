/**
 * Allowlist sanitizer for HTML that will be injected into the student-file
 * print window (uploaded .docx after mammoth). Mammoth does not sanitize.
 *
 * Uses the browser DOMParser and rebuilds a fresh tree — never regex-parses
 * tags. A bypass here is authenticated XSS: the result is written via
 * document.write into a same-origin print window.
 */

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const DROP_WITH_CONTENTS = new Set([
  "applet",
  "audio",
  "base",
  "button",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "noscript",
  "object",
  "script",
  "style",
  "svg",
  "template",
  "textarea",
  "video",
]);

const SVG_NS = "http://www.w3.org/2000/svg";
const MATH_NS = "http://www.w3.org/1998/Math/MathML";

const SAFE_DIR = /^(rtl|ltr|auto)$/i;
const SAFE_SPAN = /^\d{1,4}$/;
const SAFE_IMG_SRC =
  /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp);base64,[A-Za-z0-9+/=]+$/i;

/** C0/C1 controls, ASCII whitespace, and common format/zero-width chars. */
const HREF_STRIP_CHARS =
  /[\s\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;

function tagNameOf(el: Element): string {
  return (el.localName || el.tagName || "").toLowerCase();
}

function isDroppedSubtree(el: Element): boolean {
  const tag = tagNameOf(el);
  if (DROP_WITH_CONTENTS.has(tag)) return true;
  // `<script<script>` parses as a tag name containing `<` — do not unwrap.
  if (tag.includes("<") || tag.includes(">") || tag.includes("/") || tag.includes(":")) {
    return true;
  }
  for (const dropped of DROP_WITH_CONTENTS) {
    if (tag.startsWith(dropped)) return true;
  }
  const ns = el.namespaceURI;
  return ns === SVG_NS || ns === MATH_NS;
}

function sanitizeImgSrc(value: string): string | null {
  const trimmed = value.trim();
  if (!SAFE_IMG_SRC.test(trimmed)) return null;
  return trimmed;
}

/**
 * Scheme check uses the DOM-decoded attribute value after stripping
 * control/whitespace characters (covers ` javascript:`, `java\nscript:`,
 * and numeric/hex entity-decoded `javascript:`).
 */
function sanitizeHref(value: string): string | null {
  const cleaned = value.replace(HREF_STRIP_CHARS, "");
  if (!cleaned || cleaned.includes("\\")) return null;

  const lower = cleaned.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:")
  ) {
    return null;
  }
  if (cleaned.startsWith("//")) return null;
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return cleaned;
  }
  if (lower.startsWith("mailto:")) return cleaned;
  if (cleaned.startsWith("#")) return cleaned;
  if (cleaned.startsWith("/") && !cleaned.startsWith("//")) return cleaned;
  return null;
}

function copyAllowedAttrs(src: Element, dest: Element, tag: string): void {
  if (tag === "img") {
    const srcValue = src.getAttribute("src");
    if (srcValue) {
      const safe = sanitizeImgSrc(srcValue);
      if (safe) dest.setAttribute("src", safe);
    }
    const alt = src.getAttribute("alt");
    if (alt != null) dest.setAttribute("alt", alt.slice(0, 200));
  }

  if (tag === "a") {
    const href = src.getAttribute("href");
    if (href != null) {
      const safe = sanitizeHref(href);
      if (safe) {
        dest.setAttribute("href", safe);
        dest.setAttribute("rel", "noopener noreferrer");
        dest.setAttribute("target", "_blank");
      }
    }
  }

  if (tag === "td" || tag === "th") {
    for (const name of ["colspan", "rowspan"] as const) {
      const raw = src.getAttribute(name);
      if (raw != null && SAFE_SPAN.test(raw.trim())) {
        dest.setAttribute(name, raw.trim());
      }
    }
  }

  const dir = src.getAttribute("dir");
  if (dir && SAFE_DIR.test(dir.trim())) {
    dest.setAttribute("dir", dir.trim().toLowerCase());
  }
}

function sanitizeChildren(
  source: ParentNode,
  dest: Element,
  outDoc: Document
): void {
  for (const node of Array.from(source.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      dest.appendChild(outDoc.createTextNode(node.textContent ?? ""));
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as Element;
    if (isDroppedSubtree(el)) continue;

    const tag = tagNameOf(el);
    if (!ALLOWED_TAGS.has(tag)) {
      sanitizeChildren(el, dest, outDoc);
      continue;
    }

    const fresh = outDoc.createElement(tag);
    copyAllowedAttrs(el, fresh, tag);

    if (tag === "img" && !fresh.hasAttribute("src")) {
      continue;
    }

    sanitizeChildren(el, fresh, outDoc);

    if (tag === "a" && !fresh.hasAttribute("href")) {
      while (fresh.firstChild) dest.appendChild(fresh.firstChild);
      continue;
    }

    dest.appendChild(fresh);
  }
}

function parseHtmlDocument(html: string): Document {
  if (typeof DOMParser === "undefined") {
    throw new Error("PRINT_HTML_SANITIZER_REQUIRES_DOM");
  }
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * Returns a print-safe HTML fragment. Empty string if nothing remains.
 */
export function sanitizePrintHtml(html: string): string {
  if (!html) return "";

  const parsed = parseHtmlDocument(html);
  const outDoc = parseHtmlDocument("<!doctype html><title></title>");
  const dest = outDoc.createElement("div");

  if (parsed.body) sanitizeChildren(parsed.body, dest, outDoc);
  // Head-only payloads (meta/link/base/style/script) are dropped by not walking head.

  return dest.innerHTML.trim();
}
