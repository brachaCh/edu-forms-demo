/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { sanitizePrintHtml } from "./sanitize-print-html";

const VALID_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function asDom(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body;
}

function assertPrintSafe(body: HTMLElement) {
  expect(body.querySelector("script,style,svg,math,iframe,object,embed,form,noscript,template")).toBeNull();
  for (const el of Array.from(body.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith("on")).toBe(false);
      expect(attr.name.toLowerCase()).not.toBe("style");
      expect(attr.name.toLowerCase()).not.toBe("srcset");
      expect(attr.value).not.toMatch(/javascript:/i);
      expect(attr.value).not.toMatch(/vbscript:/i);
      expect(attr.value).not.toMatch(/svg\+xml/i);
      if (attr.name.toLowerCase() === "href") {
        expect(attr.value.startsWith("//")).toBe(false);
        expect(attr.value).not.toMatch(/^\s*javascript:/i);
        expect(attr.value.includes("\\")).toBe(false);
      }
      if (attr.name.toLowerCase() === "src") {
        expect(attr.value).toMatch(
          /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp);base64,[A-Za-z0-9+/=]+$/i
        );
      }
    }
  }
}

describe("sanitizePrintHtml", () => {
  it("keeps ordinary Hebrew RTL markup, tables, and raster images", () => {
    const html = [
      `<p dir="rtl">מיצוי אפשרויות</p>`,
      `<strong>חשוב</strong>`,
      `<table><tr><td>תא</td></tr></table>`,
      `<img src="${VALID_PNG}" alt="ok">`,
    ].join("");
    const clean = sanitizePrintHtml(html);
    const body = asDom(clean);
    assertPrintSafe(body);

    const p = body.querySelector("p");
    expect(p?.getAttribute("dir")).toBe("rtl");
    expect(p?.textContent).toBe("מיצוי אפשרויות");
    expect(body.querySelector("strong")?.textContent).toBe("חשוב");
    expect(body.querySelector("td")?.textContent).toBe("תא");
    expect(body.querySelector("table")).not.toBeNull();
    const img = body.querySelector("img");
    expect(img?.getAttribute("src")).toBe(VALID_PNG);
    expect(img?.getAttribute("alt")).toBe("ok");
  });

  it("strips script tags and their contents", () => {
    const clean = sanitizePrintHtml(
      `<p>שלום</p><script>alert("xss")</script><p>עוד</p>`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.textContent).toContain("שלום");
    expect(body.textContent).toContain("עוד");
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toContain("alert");
  });

  it("strips event handlers", () => {
    const clean = sanitizePrintHtml(
      `<p onclick="alert(1)" onmouseover="alert(2)">טקסט</p>`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.querySelector("p")?.textContent).toBe("טקסט");
    expect(body.querySelector("p")?.getAttribute("onclick")).toBeNull();
  });

  it("keeps only safe http(s)/mailto/#/path links and adds rel/target", () => {
    const clean = sanitizePrintHtml(
      `<a href="javascript:alert(1)">לחץ</a><a href="data:text/html,hi">גם</a><a href="https://example.com/x">בסדר</a><a href="mailto:a@b.com">מייל</a><a href="#sec">עוגן</a><a href="/local">נתיב</a>`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("data:text/html");
    const https = body.querySelector('a[href="https://example.com/x"]');
    expect(https).not.toBeNull();
    expect(https?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(https?.getAttribute("target")).toBe("_blank");
    expect(body.querySelector('a[href="mailto:a@b.com"]')).not.toBeNull();
    expect(body.querySelector('a[href="#sec"]')).not.toBeNull();
    expect(body.querySelector('a[href="/local"]')).not.toBeNull();
    expect(body.textContent).toContain("לחץ");
  });

  it("keeps only embedded raster images", () => {
    const clean = sanitizePrintHtml(
      `<img src="${VALID_PNG}" alt="ok" /><img src="https://evil.example/x.png" alt="no" /><img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+" alt="svg" />`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    const imgs = Array.from(body.querySelectorAll("img"));
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.getAttribute("src")).toBe(VALID_PNG);
    expect(imgs[0]?.getAttribute("alt")).toBe("ok");
    expect(clean).not.toContain("evil.example");
    expect(clean).not.toContain("svg+xml");
  });

  it("drops iframe, object, style, and svg with contents", () => {
    const clean = sanitizePrintHtml(
      `<p>לפני</p><iframe src="https://evil.example"></iframe><object data="x"></object><style>body{background:url(https://evil.example)}</style><svg><script>alert(1)</script></svg><p>אחרי</p>`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.textContent).toContain("לפני");
    expect(body.textContent).toContain("אחרי");
    expect(clean).not.toMatch(/iframe|object|style|svg|script|evil/i);
  });

  it("does not keep style attributes that could load URLs", () => {
    const clean = sanitizePrintHtml(
      `<p style="background:url(https://evil.example)">x</p>`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.querySelector("p")?.getAttribute("style")).toBeNull();
    expect(body.querySelector("p")?.textContent).toBe("x");
  });

  it("closes unclosed allowed tags", () => {
    expect(sanitizePrintHtml("<p>פתוח")).toBe("<p>פתוח</p>");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizePrintHtml("")).toBe("");
  });
});

describe("sanitizePrintHtml adversarial payloads", () => {
  it("handles '>' and quotes inside attribute values", () => {
    const clean = sanitizePrintHtml(
      `<img title="x>" src="${VALID_PNG}" onerror=alert(1)>`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    const img = body.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(VALID_PNG);
    expect(img?.getAttribute("onerror")).toBeNull();
    expect(img?.getAttribute("title")).toBeNull();
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toContain("alert");
  });

  it("rejects slash-before-attr img and onerror", () => {
    const clean = sanitizePrintHtml(`<img/src=x onerror=alert(1)>`);
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.querySelector("img")).toBeNull();
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toContain("alert");
  });

  it("rejects uppercase DATA:image/svg+xml", () => {
    const clean = sanitizePrintHtml(
      `<img src="DATA:image/svg+xml;base64,PHN2Zy8+" alt="x">`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.querySelector("img")).toBeNull();
    expect(clean).not.toMatch(/svg\+xml/i);
    expect(clean).not.toMatch(/DATA:image/i);
  });

  it("rejects protocol-relative and backslash hrefs", () => {
    const clean = sanitizePrintHtml(
      `<a href="//evil">p</a><a href="/\\evil">b</a><a href="\\\\evil">c</a>`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    for (const a of Array.from(body.querySelectorAll("a"))) {
      const href = a.getAttribute("href");
      expect(href == null || !href.startsWith("//")).toBe(true);
      expect(href == null || !href.includes("\\")).toBe(true);
      expect(href == null || !/evil/i.test(href)).toBe(true);
    }
    expect(clean).not.toContain("//evil");
    expect(clean).not.toContain("/\\evil");
  });

  it("rejects javascript hrefs with leading space and entity encoding", () => {
    const clean = sanitizePrintHtml(
      [
        `<a href=" javascript:alert(1)">space</a>`,
        `<a href="&#106;avascript:alert(1)">dec</a>`,
        `<a href="&#x6A;avascript:alert(1)">hex</a>`,
        `<a href="&#x6a;avascript:alert(1)">hex2</a>`,
        `<a href="java&#9;script:alert(1)">tab</a>`,
      ].join("")
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toContain("alert(1)");
    for (const a of Array.from(body.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).toBeNull();
    }
  });

  it("drops noscript / svg / math early-close mXSS shapes", () => {
    const clean = sanitizePrintHtml(
      [
        `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`,
        `<svg><p><style><p id="</style><img src=x onerror=alert(2)>"></svg>`,
        `<math><p><style><img src=x onerror=alert(3)></style></math>`,
        `<p>בטוח</p>`,
      ].join("")
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.querySelector("noscript,svg,math,style,script")).toBeNull();
    expect(body.querySelector("[onerror],[onclick]")).toBeNull();
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(body.textContent).toContain("בטוח");
  });

  it("drops nested and malformed script", () => {
    const clean = sanitizePrintHtml(
      `<p>לפני</p><div><script>alert(1)</script></div><p>אחרי</p><script<script>alert(2)</script>`
    );
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.querySelector("script")).toBeNull();
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toContain("alert");
    expect(body.textContent).toContain("לפני");
    expect(body.textContent).toContain("אחרי");
  });

  it("drops nested svg-breakout anchors", () => {
    const clean = sanitizePrintHtml(`<a href=x><svg><a>break</a></svg>keep</a>`);
    const body = asDom(clean);
    assertPrintSafe(body);
    expect(body.querySelector("svg")).toBeNull();
    expect(body.querySelector('a[href="x"]')).toBeNull();
    for (const a of Array.from(body.querySelectorAll("a"))) {
      const href = a.getAttribute("href") ?? "";
      expect(href.startsWith("//")).toBe(false);
      expect(href).not.toMatch(/javascript:/i);
    }
    expect(clean).not.toContain("javascript:");
  });
});
