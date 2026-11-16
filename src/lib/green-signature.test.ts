import { describe, expect, it } from "vitest";
import { getFormSchema } from "@/lib/form-schemas";
import { buildFormSnapshotHtml } from "@/lib/form-snapshot";
import { buildSimpleSignSignedMarker } from "@/lib/simplesign/constants";
import {
  decodePngDataUrl,
  formatSignatureMarkup,
  isSignatureInk,
  looksLikeBlockedSignatureRaster,
  looksLikePlaceholderIcon,
  pngDataUrlToInkSvg,
  rgbaInkBounds,
  rgbaToBoxShadow,
  rgbaToHorizontalSegments,
  rgbaToInkSvg,
  rgbaToStrokes,
  sanitizeSignatureSvg,
  snapshotHtmlWithoutBlockedImages,
  stripScriptsForView,
  strokesToBoxShadow,
  strokesToSegments,
  strokesToSvg,
  fitSignatureTransform,
  fitStrokesToDest,
  isValidSubmittedSignature,
  parseInkPathSignature,
  strokesToInkPath,
} from "@/lib/green-signature";

describe("green signature ink", () => {
  it("stores parent signatures as ink path text", () => {
    const ink = strokesToInkPath(
      [
        [
          { x: 12, y: 24 },
          { x: 48, y: 28 },
        ],
      ],
      240,
      56
    );
    expect(isSignatureInk(ink)).toBe(true);
    expect(ink.startsWith("ink1|")).toBe(true);
    expect(isValidSubmittedSignature(ink)).toBe(true);
    expect(parseInkPathSignature(ink)?.strokes.length).toBe(1);
    expect(formatSignatureMarkup(ink)).toContain("box-shadow");
    expect(formatSignatureMarkup(ink)).not.toContain("data:image");
    expect(formatSignatureMarkup(ink)).not.toContain("<svg");
  });

  it("renders a SimpleSign marker as a readable «signed» badge, not the raw token", () => {
    const marker = buildSimpleSignSignedMarker(
      "tjBVJroiB2D7XQaGqRAmZD5R4JJoWHSIaEvVpnNInzEnGOhwjg6JXz5kIKYOBw1m",
      "2026-09-18T12:00:00.000Z"
    );
    const markup = formatSignatureMarkup(marker);
    expect(markup).toContain('class="sign-received"');
    expect(markup).toContain("נחתם דיגיטלית");
    expect(markup).toContain("SimpleSign");
    expect(markup).toContain("18.09.2026");
    expect(markup).not.toContain("simplesign:signed:");
    expect(markup).not.toContain("tjBVJroiB2D7XQaGqRAmZD5R4JJoWHSIaEvVpnNInzEnGOhwjg6JXz5kIKYOBw1m");
  });

  it("treats svg markup as visible ink, not a blocked image", () => {
    const svg = strokesToSvg(
      [
        [
          { x: 2, y: 8 },
          { x: 20, y: 10 },
        ],
      ],
      100,
      44
    );
    expect(isSignatureInk(svg)).toBe(true);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(formatSignatureMarkup(svg)).toContain("box-shadow");
    expect(formatSignatureMarkup(svg)).not.toContain("<svg");
    expect(formatSignatureMarkup(svg)).not.toContain("data:image");
  });

  it("turns raster ink into svg rects instead of an image", () => {
    const rgba = new Uint8ClampedArray([15, 118, 110, 255, 255, 255, 255, 255]);
    const svg = rgbaToInkSvg(2, 1, rgba);
    expect(svg).toContain("<rect");
    expect(svg).not.toContain("data:image");
  });

  it("strips scripts from svg signatures", () => {
    expect(
      sanitizeSignatureSvg(
        `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>`
      )
    ).not.toContain("<script");
  });

  it("replaces blocked images already stored in snapshot html", () => {
    expect(
      snapshotHtmlWithoutBlockedImages(
        '<p>x</p><img src="data:image/png;base64,ABC" alt="חתימה">'
      )
    ).toBe('<p>x</p><span class="sign-received">נחתם</span>');
  });

  it("keeps brand logo data urls when stripping signature images", () => {
    const logo =
      '<img class="logo-protocol" src="data:image/png;base64,LOGO" alt="לוגו פרוטוקל">';
    expect(snapshotHtmlWithoutBlockedImages(`<footer>${logo}</footer>`)).toBe(
      `<footer>${logo}</footer>`
    );
  });

  it("replaces inline svg in snapshot html so the filter cannot swap it", () => {
    expect(
      snapshotHtmlWithoutBlockedImages('<div><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg></div>')
    ).toBe('<div><span class="sign-received">נחתם</span></div>');
  });

  it("stripScriptsForView removes script tags", () => {
    expect(
      stripScriptsForView('<div>hello</div><script>alert(1)</script>')
    ).toContain("<div>hello</div>");
    expect(
      stripScriptsForView('<div>hello</div><script>alert(1)</script>')
    ).not.toContain("<script");
    expect(
      stripScriptsForView('<script type="text/javascript">bad()</script><p>ok</p>')
    ).toContain("<p>ok</p>");
    expect(
      stripScriptsForView('<script type="text/javascript">bad()</script><p>ok</p>')
    ).not.toContain("<script");
  });

  it("stripScriptsForView removes event handlers", () => {
    expect(
      stripScriptsForView('<img src="x" onerror="alert(1)">')
    ).not.toContain("onerror");
    expect(
      stripScriptsForView('<a onclick="bad()" href="/">link</a>')
    ).not.toContain("onclick");
    expect(
      stripScriptsForView('<div onmouseover="x" onmouseout=\'y\'>')
    ).not.toContain("onmouseover");
  });

  it("stripScriptsForView replaces javascript: hrefs", () => {
    const result = stripScriptsForView('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("stripScriptsForView blocks svg with onload (XSS vector)", () => {
    const result = stripScriptsForView('<svg/onload=alert(1)>');
    expect(result).not.toContain("svg");
    expect(result).not.toContain("onload");
  });

  it("stripScriptsForView blocks javascript: in src attribute", () => {
    const result = stripScriptsForView('<img src="javascript:alert(1)">');
    expect(result).not.toContain("javascript:");
  });

  it("stripScriptsForView blocks data:text/html but allows raster data:image in src", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    expect(stripScriptsForView(`<img src="${png}" alt="logo">`)).toContain(
      "data:image/png;base64,"
    );
    const blocked = stripScriptsForView(
      '<img src="data:text/html,<script>alert(1)</script>">'
    );
    expect(blocked).not.toMatch(/src=["']data:text\/html/i);
  });

  it("stripScriptsForView blocks obfuscated data: URIs (leading whitespace)", () => {
    expect(
      stripScriptsForView('<img src=" data:image/svg+xml;base64,abc" alt="x">')
    ).not.toMatch(/src=["'][^"']*data:image\/svg/i);
    expect(
      stripScriptsForView('<img src="  data:text/html,<b>x</b>" alt="x">')
    ).not.toMatch(/src=["'][^"']*data:text\/html/i);
  });

  it("stripScriptsForView blocks obfuscated data: URIs (HTML entities)", () => {
    expect(
      stripScriptsForView('<a href="da&#x09;ta:text/html,x">link</a>')
    ).not.toMatch(/href=["'][^"']*data:/i);
    expect(
      stripScriptsForView('<img src="&#x20;&#x20;data:text/html,x" alt="x">')
    ).not.toMatch(/src=["'][^"']*data:text\/html/i);
  });

  it("stripScriptsForView blocks data:image/svg+xml in href and img src", () => {
    const svgPayload =
      "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+";
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const linkResult = stripScriptsForView(
      `<a href="${svgPayload}">click</a>`
    );
    expect(linkResult).not.toMatch(/href=["']data:image\/svg\+xml/i);
    const imgSvg = stripScriptsForView(`<img src="${svgPayload}" alt="x">`);
    expect(imgSvg).not.toMatch(/src=["']data:image\/svg\+xml/i);
    expect(stripScriptsForView(`<img src="${png}" alt="ok">`)).toContain(
      "data:image/png;base64,"
    );
  });

  it("stripScriptsForView preserves dir=rtl and print-schedule on full snapshot html", () => {
    const schema = getFormSchema("weekly-schedule");
    expect(schema).toBeTruthy();
    const snapshot = buildFormSnapshotHtml(
      schema!,
      { full_name: "נועה דמו", class_name: "ד׳2" },
      "נועה דמו"
    );
    const sanitized = stripScriptsForView(snapshot);
    expect(sanitized).toContain('dir="rtl"');
    expect(sanitized).toContain("print-schedule");
  });

  it("stripScriptsForView blocks iframe tags", () => {
    const result = stripScriptsForView('<iframe src="https://evil.com"></iframe>');
    expect(result).not.toContain("iframe");
  });

  it("stripScriptsForView preserves style tags for CSS", () => {
    const html = '<style>.x { color: red; }</style><div class="x">styled</div>';
    const result = stripScriptsForView(html);
    expect(result).toContain("<style>.x { color: red; }</style>");
    expect(result).toContain('<div class="x">styled</div>');
  });

  it("stripScriptsForView returns empty for empty input", () => {
    expect(stripScriptsForView("")).toBe("");
    expect(stripScriptsForView(null as unknown as string)).toBe("");
  });

  it("decodes a png data url into ink svg without using img", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGPgL8v7DwIAFUAF72fqtCwAAAAASUVORK5CYII=";
    const decoded = await decodePngDataUrl(png);
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(2);
    expect(decoded?.height).toBe(1);
    const svg = await pngDataUrlToInkSvg(png);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<rect");
    expect(svg).not.toContain("data:image");
  });

  it("turns sparse raster ink into css shadow instead of a blocked image", () => {
    const rgba = new Uint8ClampedArray(8 * 4);
    rgba.fill(255);
    rgba[0] = 15;
    rgba[1] = 118;
    rgba[2] = 110;
    rgba[3] = 255;
    expect(looksLikeBlockedSignatureRaster(rgba, 8, 1)).toBe(false);
    expect(rgbaToBoxShadow(rgba, 8, 1, 80, 10)).toContain("#0f766e");
  });

  it("does not paint a solid blocked placeholder as a green slab", () => {
    const width = 10;
    const height = 4;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 15;
      rgba[i + 1] = 118;
      rgba[i + 2] = 110;
      rgba[i + 3] = 255;
    }
    expect(looksLikeBlockedSignatureRaster(rgba, width, height)).toBe(true);
    expect(rgbaToBoxShadow(rgba, width, height, 100, 40)).toBe("");
  });

  it("turns stroke paths into css shadow", () => {
    const shadow = strokesToBoxShadow([
      [
        { x: 2, y: 8 },
        { x: 20, y: 10 },
      ],
    ]);
    expect(shadow).toContain("#0f766e");
    expect(shadow).toContain("px");
    expect(shadow).not.toContain("data:image");
    expect(shadow).not.toContain("<svg");
  });

  it("traces a thin handwritten stroke instead of a solid bar", () => {
    const width = 12;
    const height = 6;
    const rgba = new Uint8ClampedArray(width * height * 4);
    rgba.fill(255);
    for (let x = 1; x <= 8; x += 1) {
      const i = (2 * width + x) * 4;
      rgba[i] = 15;
      rgba[i + 1] = 118;
      rgba[i + 2] = 110;
      rgba[i + 3] = 255;
    }
    const strokes = rgbaToStrokes(rgba, width, height);
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes[0]!.length).toBeGreaterThan(3);
    expect(strokesToSegments(strokes).length).toBeGreaterThan(0);
  });

  it("ignores a solid blocked rectangle", () => {
    const width = 10;
    const height = 4;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 15;
      rgba[i + 1] = 118;
      rgba[i + 2] = 110;
      rgba[i + 3] = 255;
    }
    expect(rgbaToStrokes(rgba, width, height)).toEqual([]);
  });

  it("fits a wide signature without stretching it into a tall column", () => {
    const transform = fitSignatureTransform(800, 44, 400, 56);
    expect(transform.scale).toBeCloseTo(0.5);
    expect(transform.offsetX).toBeCloseTo(0);
    expect(transform.offsetY).toBeCloseTo((56 - 22) / 2);
  });

  it("rebuilds handwriting as horizontal ink runs", () => {
    const width = 24;
    const height = 8;
    const rgba = new Uint8ClampedArray(width * height * 4);
    rgba.fill(255);
    for (let x = 4; x < 18; x += 1) {
      const i = (3 * width + x) * 4;
      rgba[i] = 15;
      rgba[i + 1] = 118;
      rgba[i + 2] = 110;
      rgba[i + 3] = 255;
    }
    const segments = rgbaToHorizontalSegments(rgba, width, height, 240, 56);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((segment) => segment.angle === 0)).toBe(true);
    const span = Math.max(...segments.map((s) => s.x + s.length)) - Math.min(...segments.map((s) => s.x));
    expect(span).toBeGreaterThan(80);
  });

  it("scales stored handwriting to fill the signature line", () => {
    const svg = strokesToSvg(
      [
        [
          { x: 620, y: 18 },
          { x: 680, y: 22 },
          { x: 740, y: 16 },
        ],
      ],
      800,
      56
    );
    const fitted = fitStrokesToDest(
      [
        [
          { x: 620, y: 18 },
          { x: 680, y: 22 },
          { x: 740, y: 16 },
        ],
      ],
      240,
      56
    );
    const xs = fitted.flat().map((point) => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(140);
    expect(formatSignatureMarkup(svg)).toContain("box-shadow");
    expect(formatSignatureMarkup(svg)).not.toContain("<svg");
  });

  it("does not treat a wide parent signature as a placeholder icon", () => {
    const width = 80;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);
    rgba.fill(255);
    for (let x = 8; x < 60; x += 1) {
      const i = (8 * width + x) * 4;
      rgba[i] = 15;
      rgba[i + 1] = 118;
      rgba[i + 2] = 110;
      rgba[i + 3] = 255;
    }
    const bounds = rgbaInkBounds(rgba, width, height);
    expect(looksLikePlaceholderIcon(bounds, width, height)).toBe(false);
  });

  it("rejects a tiny blocked icon sitting in an empty pad", () => {
    const width = 80;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);
    rgba.fill(255);
    for (let y = 6; y < 10; y += 1) {
      for (let x = 38; x < 42; x += 1) {
        const i = (y * width + x) * 4;
        rgba[i] = 15;
        rgba[i + 1] = 118;
        rgba[i + 2] = 110;
        rgba[i + 3] = 255;
      }
    }
    const bounds = rgbaInkBounds(rgba, width, height);
    expect(looksLikePlaceholderIcon(bounds, width, height)).toBe(true);
  });
});
