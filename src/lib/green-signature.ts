import sanitizeHtml from "sanitize-html";
import {
  formatSimpleSignSignedLabel,
  isSimpleSignSignedValue,
} from "@/lib/simplesign/constants";

export type SignaturePoint = { x: number; y: number };

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InkSegment = {
  x: number;
  y: number;
  length: number;
  angle: number;
};

const NEIGHBORS: Array<[number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function downsampleRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxWidth: number
): { rgba: Uint8ClampedArray; width: number; height: number } {
  if (width <= maxWidth) return { rgba, width, height };
  const nextW = maxWidth;
  const nextH = Math.max(1, Math.round((height * maxWidth) / width));
  const next = new Uint8ClampedArray(nextW * nextH * 4);
  for (let y = 0; y < nextH; y += 1) {
    const srcY = Math.min(height - 1, Math.floor((y * height) / nextH));
    for (let x = 0; x < nextW; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x * width) / nextW));
      const si = (srcY * width + srcX) * 4;
      const di = (y * nextW + x) * 4;
      next[di] = rgba[si];
      next[di + 1] = rgba[si + 1];
      next[di + 2] = rgba[si + 2];
      next[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: next, width: nextW, height: nextH };
}

export function rgbaToStrokes(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): SignaturePoint[][] {
  const ink = new Uint8Array(width * height);
  let inkCount = 0;
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    if (rgba[o + 3] < 20) continue;
    if (rgba[o] < 220 || rgba[o + 1] < 220 || rgba[o + 2] < 220) {
      ink[i] = 1;
      inkCount += 1;
    }
  }
  if (inkCount === 0 || inkCount / (width * height) > 0.32) return [];

  const visited = new Uint8Array(width * height);
  const strokes: SignaturePoint[][] = [];

  function at(x: number, y: number): number {
    return y * width + x;
  }

  function stepFrom(
    startX: number,
    startY: number,
    startDir: number
  ): SignaturePoint[] {
    const points: SignaturePoint[] = [];
    let x = startX;
    let y = startY;
    let dir = startDir;
    while (true) {
      const i = at(x, y);
      if (visited[i]) break;
      visited[i] = 1;
      points.push({ x, y });
      let found: { x: number; y: number; dir: number } | null = null;
      for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
        const nextDir = (dir + turn + 8) % 8;
        const nx = x + NEIGHBORS[nextDir][0];
        const ny = y + NEIGHBORS[nextDir][1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = at(nx, ny);
        if (!ink[ni] || visited[ni]) continue;
        found = { x: nx, y: ny, dir: nextDir };
        break;
      }
      if (!found) break;
      x = found.x;
      y = found.y;
      dir = found.dir;
      if (points.length > 5000) break;
    }
    return points;
  }

  const starts: Array<{ x: number; y: number; neighbors: number }> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!ink[at(x, y)]) continue;
      let neighbors = 0;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (ink[at(nx, ny)]) neighbors += 1;
      }
      starts.push({ x, y, neighbors });
    }
  }
  starts.sort((a, b) => a.neighbors - b.neighbors);

  for (const start of starts) {
    if (visited[at(start.x, start.y)]) continue;
    const stroke = stepFrom(start.x, start.y, 0);
    if (stroke.length < 4) continue;
    const xs = stroke.map((p) => p.x);
    const ys = stroke.map((p) => p.y);
    const spanX = (Math.max(...xs) - Math.min(...xs)) / width;
    const spanY = (Math.max(...ys) - Math.min(...ys)) / height;
    if (spanX > 0.82 && spanY < 0.18) continue;
    strokes.push(stroke);
  }
  return strokes;
}

export function strokesToSegments(strokes: SignaturePoint[][]): InkSegment[] {
  const segments: InkSegment[] = [];
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      const from = stroke[i - 1];
      const to = stroke[i];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.35) continue;
      segments.push({
        x: from.x,
        y: from.y,
        length: Math.max(1.8, length),
        angle: Math.atan2(dy, dx),
      });
      if (segments.length > 2200) return segments;
    }
  }
  return segments;
}

export function fitSignatureTransform(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(
    destW / Math.max(1, srcW),
    destH / Math.max(1, srcH)
  );
  return {
    scale,
    offsetX: destW - srcW * scale,
    offsetY: (destH - srcH * scale) / 2,
  };
}

export type InkBounds = { minX: number; minY: number; width: number; height: number };

export function strokesInkBounds(strokes: SignaturePoint[][]): InkBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const pad = 3;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };
}

export function rgbaInkBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): InkBounds | null {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (rgba[o + 3] < 20) continue;
      if (rgba[o] >= 220 && rgba[o + 1] >= 220 && rgba[o + 2] >= 220) continue;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!found) return null;
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

/** אייקון חסום קטן באמצע משטח ריק — לא חתימת יד */
export function looksLikePlaceholderIcon(
  bounds: InkBounds | null,
  canvasW: number,
  canvasH: number
): boolean {
  if (!bounds) return true;
  const cover =
    (bounds.width * bounds.height) / Math.max(1, canvasW * canvasH);
  const aspect = bounds.width / Math.max(1, bounds.height);
  return cover < 0.12 && aspect < 1.8;
}

export function fitStrokesToDest(
  strokes: SignaturePoint[][],
  destW: number,
  destH: number
): SignaturePoint[][] {
  const bounds = strokesInkBounds(strokes);
  if (!bounds) return [];
  const transform = fitSignatureTransform(
    bounds.width,
    bounds.height,
    destW,
    destH
  );
  return strokes.map((stroke) =>
    stroke.map((point) => ({
      x: transform.offsetX + (point.x - bounds.minX) * transform.scale,
      y: transform.offsetY + (point.y - bounds.minY) * transform.scale,
    }))
  );
}

export function rgbaToHorizontalSegments(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number
): InkSegment[] {
  if (srcW / Math.max(1, srcH) < 2.2) return [];
  let ink = 0;
  const total = srcW * srcH;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    if (rgba[o + 3] < 20) continue;
    if (rgba[o] < 220 || rgba[o + 1] < 220 || rgba[o + 2] < 220) ink += 1;
  }
  if (ink === 0 || ink / total > 0.28) return [];
  const transform = fitSignatureTransform(srcW, srcH, destW, destH);
  const segments: InkSegment[] = [];
  for (let y = 0; y < srcH; y += 1) {
    let x = 0;
    while (x < srcW) {
      const i = (y * srcW + x) * 4;
      const here =
        rgba[i + 3] >= 20 &&
        (rgba[i] < 220 || rgba[i + 1] < 220 || rgba[i + 2] < 220);
      if (!here) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < srcW) {
        const j = (y * srcW + end) * 4;
        const next =
          rgba[j + 3] >= 20 &&
          (rgba[j] < 220 || rgba[j + 1] < 220 || rgba[j + 2] < 220);
        if (!next) break;
        end += 1;
      }
      const length = (end - x) * transform.scale;
      if (length < destW * 0.72) {
        segments.push({
          x: transform.offsetX + x * transform.scale,
          y: transform.offsetY + y * transform.scale,
          length: Math.max(1, length),
          angle: 0,
        });
      }
      x = end;
      if (segments.length > 2500) return segments;
    }
  }
  return segments;
}

export async function signatureToInkSegments(
  value: string,
  destW: number,
  destH: number
): Promise<InkSegment[]> {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (isInkPathSignature(trimmed)) {
    const parsed = parseInkPathSignature(trimmed);
    if (!parsed) return [];
    return strokesToSegments(fitStrokesToDest(parsed.strokes, destW, destH));
  }
  if (isSvgSignature(trimmed)) {
    return strokesToSegments(
      fitStrokesToDest(svgPathToStrokes(trimmed), destW, destH)
    );
  }
  if (!isPngDataUrl(trimmed)) return [];
  const decoded = await decodePngDataUrl(trimmed);
  if (!decoded) return [];
  if (looksLikeBlockedSignatureRaster(decoded.rgba, decoded.width, decoded.height)) {
    return [];
  }
  const bounds = rgbaInkBounds(decoded.rgba, decoded.width, decoded.height);
  if (looksLikePlaceholderIcon(bounds, decoded.width, decoded.height)) {
    return [];
  }
  const traced = rgbaToStrokes(decoded.rgba, decoded.width, decoded.height);
  if (traced.length > 0) {
    return strokesToSegments(fitStrokesToDest(traced, destW, destH));
  }
  return rgbaToHorizontalSegments(
    decoded.rgba,
    decoded.width,
    decoded.height,
    destW,
    destH
  );
}

export function isPngDataUrl(value: string): boolean {
  return value.trim().startsWith("data:image/");
}

export function isSvgSignature(value: string): boolean {
  return value.trim().startsWith("<svg");
}

export function isSignatureInk(value: string): boolean {
  return (
    isInkPathSignature(value) || isPngDataUrl(value) || isSvgSignature(value)
  );
}

export function isInkPathSignature(value: string): boolean {
  return value.trim().startsWith("ink1|");
}

export function strokesToInkPath(
  strokes: SignaturePoint[][],
  width: number,
  height: number
): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const body = strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) =>
      stroke
        .map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
        .join(",")
    )
    .join(";");
  return `ink1|${w}|${h}|${body}`;
}

export function parseInkPathSignature(value: string): {
  width: number;
  height: number;
  strokes: SignaturePoint[][];
} | null {
  const trimmed = value.trim();
  const parts = trimmed.split("|");
  if (parts[0] !== "ink1" || parts.length !== 4) return null;
  const width = Number(parts[1]);
  const height = Number(parts[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return null;
  }
  const strokes = parts[3]
    .split(";")
    .map((stroke) =>
      stroke
        .split(",")
        .map((pair) => {
          const [x, y] = pair.trim().split(/\s+/);
          return { x: Number(x), y: Number(y) };
        })
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    )
    .filter((stroke) => stroke.length > 0);
  if (strokes.length === 0) return null;
  return { width, height, strokes };
}

const INK_PATH_RE = /^ink1\|\d+\|\d+\|[0-9.,; \-]+$/;

export function isValidSubmittedSignature(value: string): boolean {
  if (!value || value.length > 1_000_000) return false;
  if (value.trim().startsWith("data:image/png") && value.length <= 1_000_000) {
    return /^data:image\/png(?:;charset=[-\w]+)?;base64,[A-Za-z0-9+/=\r\n]+$/.test(
      value
    );
  }
  const trimmed = value.trim();
  if (INK_PATH_RE.test(trimmed) && trimmed.length <= 200_000) {
    return parseInkPathSignature(trimmed) !== null;
  }
  if (!trimmed.startsWith("<svg") || trimmed.length > 200_000) return false;
  if (/<script|javascript:/i.test(trimmed)) return false;
  return true;
}

export function sanitizeSignatureSvg(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("<svg")) return "";
  if (/<script|javascript:|data:image/i.test(trimmed)) return "";
  return trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

export function strokesToSvg(
  strokes: SignaturePoint[][],
  width: number,
  height: number
): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const paths = strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => {
      const d = stroke
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
        )
        .join(" ");
      return `<path d="${d}" fill="none" stroke="#0f766e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMaxYMid meet">${paths}</svg>`;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(
    /^data:([^;,]+)?(?:;charset=[-\w]+)?;base64,([\s\S]+)$/i
  );
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const tryMethod = async (name: CompressionFormat, slice?: Uint8Array) => {
    const input = slice ?? data;
    const stream = new Blob([Uint8Array.from(input)])
      .stream()
      .pipeThrough(new DecompressionStream(name));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  try {
    return await tryMethod("deflate");
  } catch {
    return tryMethod(
      "deflate-raw",
      data.subarray(2, Math.max(2, data.length - 4))
    );
  }
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterPngRows(
  inflated: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number
): Uint8Array[] | null {
  const stride = width * bytesPerPixel;
  const rows: Uint8Array[] = [];
  let src = 0;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    if (src + 1 + stride > inflated.length) return null;
    const filter = inflated[src];
    src += 1;
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i += 1) {
      const raw = inflated[src + i];
      const a = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const b = prev[i];
      const c = i >= bytesPerPixel ? prev[i - bytesPerPixel] : 0;
      if (filter === 0) row[i] = raw;
      else if (filter === 1) row[i] = (raw + a) & 255;
      else if (filter === 2) row[i] = (raw + b) & 255;
      else if (filter === 3) row[i] = (raw + Math.floor((a + b) / 2)) & 255;
      else if (filter === 4) row[i] = (raw + paethPredictor(a, b, c)) & 255;
      else return null;
    }
    src += stride;
    rows.push(row);
    prev = row;
  }
  return rows;
}

function rowsToRgba(
  rows: Uint8Array[],
  width: number,
  colorType: number,
  palette: Uint8Array | null,
  trns: Uint8Array | null
): Uint8ClampedArray | null {
  const rgba = new Uint8ClampedArray(width * rows.length * 4);
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const di = (y * width + x) * 4;
      if (colorType === 6) {
        const si = x * 4;
        rgba[di] = row[si];
        rgba[di + 1] = row[si + 1];
        rgba[di + 2] = row[si + 2];
        rgba[di + 3] = row[si + 3];
      } else if (colorType === 2) {
        const si = x * 3;
        rgba[di] = row[si];
        rgba[di + 1] = row[si + 1];
        rgba[di + 2] = row[si + 2];
        rgba[di + 3] = 255;
      } else if (colorType === 0) {
        rgba[di] = row[x];
        rgba[di + 1] = row[x];
        rgba[di + 2] = row[x];
        rgba[di + 3] = 255;
      } else if (colorType === 4) {
        const si = x * 2;
        rgba[di] = row[si];
        rgba[di + 1] = row[si];
        rgba[di + 2] = row[si];
        rgba[di + 3] = row[si + 1];
      } else if (colorType === 3) {
        if (!palette) return null;
        const index = row[x];
        const pi = index * 3;
        if (pi + 2 >= palette.length) return null;
        rgba[di] = palette[pi];
        rgba[di + 1] = palette[pi + 1];
        rgba[di + 2] = palette[pi + 2];
        rgba[di + 3] = trns && index < trns.length ? trns[index] : 255;
      } else {
        return null;
      }
    }
  }
  return rgba;
}

export async function decodePngDataUrl(
  dataUrl: string
): Promise<{ width: number; height: number; rgba: Uint8ClampedArray } | null> {
  const bytes = dataUrlToBytes(dataUrl);
  if (!bytes || bytes.length < 24) return null;
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) break;
    if (type === "IHDR") {
      width = view.getUint32(start);
      height = view.getUint32(start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (type === "PLTE") {
      palette = bytes.slice(start, end);
    } else if (type === "tRNS") {
      trns = bytes.slice(start, end);
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  const bppByType: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bpp = bppByType[colorType];
  if (
    !width ||
    !height ||
    bitDepth !== 8 ||
    interlace !== 0 ||
    !bpp ||
    width > 8192 ||
    height > 2048
  ) {
    return null;
  }
  const total = idat.reduce((sum, part) => sum + part.length, 0);
  const compressed = new Uint8Array(total);
  let at = 0;
  for (const part of idat) {
    compressed.set(part, at);
    at += part.length;
  }
  let inflated: Uint8Array;
  try {
    inflated = await inflateZlib(compressed);
  } catch {
    return null;
  }
  const rows = unfilterPngRows(inflated, width, height, bpp);
  if (!rows) return null;
  const rgba = rowsToRgba(rows, width, colorType, palette, trns);
  if (!rgba) return null;
  return { width, height, rgba };
}

/** ממיר PNG ל-SVG של דיו — בלי תג תמונה, כדי שהסינון לא יטשטש */
export function rgbaToInkSvg(
  width: number,
  height: number,
  rgba: Uint8ClampedArray
): string {
  const rects: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      const i = (y * width + x) * 4;
      const ink = rgba[i] < 220 || rgba[i + 1] < 220 || rgba[i + 2] < 220;
      if (!ink) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < width) {
        const j = (y * width + end) * 4;
        if (rgba[j] >= 220 && rgba[j + 1] >= 220 && rgba[j + 2] >= 220) break;
        end += 1;
      }
      rects.push(
        `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="#0f766e"/>`
      );
      x = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="44" preserveAspectRatio="xMaxYMid meet">${rects.join("")}</svg>`;
}

export async function pngDataUrlToInkSvg(dataUrl: string): Promise<string> {
  const decoded = await decodePngDataUrl(dataUrl);
  if (!decoded) return "";
  return rgbaToInkSvg(decoded.width, decoded.height, decoded.rgba);
}

function svgViewBox(svg: string): { w: number; h: number } {
  const box = svg.match(
    /viewBox="\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i
  );
  if (box) {
    return { w: Number(box[3]) || 1, h: Number(box[4]) || 1 };
  }
  const width = Number(svg.match(/\bwidth="([\d.]+)"/i)?.[1] ?? 0);
  const height = Number(svg.match(/\bheight="([\d.]+)"/i)?.[1] ?? 0);
  return { w: width || 1, h: height || 1 };
}

export function svgPathToStrokes(svg: string): SignaturePoint[][] {
  return [...svg.matchAll(/\bd="([^"]+)"/g)].map((match) => {
    const points: SignaturePoint[] = [];
    const token = /[ML]\s*([\d.]+)\s+([\d.]+)/gi;
    let part: RegExpExecArray | null;
    while ((part = token.exec(match[1] ?? ""))) {
      points.push({ x: Number(part[1]), y: Number(part[2]) });
    }
    return points;
  });
}

function paintSvgRects(
  ctx: CanvasRenderingContext2D,
  svg: string,
  scaleX: number,
  scaleY: number
): void {
  ctx.fillStyle = "#0f766e";
  const rects = [
    ...svg.matchAll(
      /<rect\b[^>]*\bx="([\d.]+)"[^>]*\by="([\d.]+)"[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/gi
    ),
  ];
  for (const match of rects) {
    ctx.fillRect(
      Number(match[1]) * scaleX,
      Number(match[2]) * scaleY,
      Math.max(1, Number(match[3]) * scaleX),
      Math.max(1, Number(match[4]) * scaleY)
    );
  }
}

export function strokePaths(
  ctx: CanvasRenderingContext2D,
  strokes: SignaturePoint[][],
  scaleX = 1,
  scaleY = 1
): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 2;
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * scaleX, stroke[0].y * scaleY);
    for (let i = 1; i < stroke.length; i += 1) {
      ctx.lineTo(stroke[i].x * scaleX, stroke[i].y * scaleY);
    }
    ctx.stroke();
  }
}

/** ציור דיו ב-fillRect בלי Image/drawImage — הסינון מחליף אותם במציין «בתמונה» */
export function paintRgbaAsInk(
  ctx: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number
): void {
  ctx.fillStyle = "#0f766e";
  const scaleX = destW / Math.max(1, srcW);
  const scaleY = destH / Math.max(1, srcH);
  for (let y = 0; y < srcH; y += 1) {
    let x = 0;
    while (x < srcW) {
      const i = (y * srcW + x) * 4;
      const ink = rgba[i] < 220 || rgba[i + 1] < 220 || rgba[i + 2] < 220;
      if (!ink) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < srcW) {
        const j = (y * srcW + end) * 4;
        if (rgba[j] >= 220 && rgba[j + 1] >= 220 && rgba[j + 2] >= 220) break;
        end += 1;
      }
      ctx.fillRect(
        x * scaleX,
        y * scaleY,
        (end - x) * scaleX,
        Math.max(scaleY, 1)
      );
      x = end;
    }
  }
}

/** ציור דיו על canvas בלי <img>/<svg>/Image — הסינון מחליף אותם במציין «בתמונה» */
export async function paintSignatureOnContext(
  ctx: CanvasRenderingContext2D,
  value: string,
  destW: number,
  destH: number
): Promise<boolean> {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isSvgSignature(trimmed)) {
    const box = svgViewBox(trimmed);
    const scaleX = destW / box.w;
    const scaleY = destH / box.h;
    strokePaths(ctx, svgPathToStrokes(trimmed), scaleX, scaleY);
    paintSvgRects(ctx, trimmed, scaleX, scaleY);
    return true;
  }
  if (!isPngDataUrl(trimmed)) return false;
  const decoded = await decodePngDataUrl(trimmed);
  if (!decoded) return false;
  paintRgbaAsInk(
    ctx,
    decoded.rgba,
    decoded.width,
    decoded.height,
    destW,
    destH
  );
  return true;
}

export async function convertPngSignaturesToSvg(
  data: Record<string, string>
): Promise<Record<string, string>> {
  const next = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (!isPngDataUrl(value)) continue;
    const svg = await pngDataUrlToInkSvg(value);
    if (svg) next[key] = svg;
  }
  return next;
}

export function strokesToBoxShadow(strokes: SignaturePoint[][]): string {
  const shadows: string[] = [];
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i += 1) {
      const point = stroke[i];
      shadows.push(
        `${point.x.toFixed(1)}px ${point.y.toFixed(1)}px 0 1.2px #0f766e`
      );
      if (i === 0) continue;
      const prev = stroke[i - 1];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.min(16, Math.floor(dist));
      for (let s = 1; s < steps; s += 1) {
        const t = s / steps;
        shadows.push(
          `${(prev.x + dx * t).toFixed(1)}px ${(prev.y + dy * t).toFixed(1)}px 0 1.2px #0f766e`
        );
      }
      if (shadows.length > 3500) break;
    }
    if (shadows.length > 3500) break;
  }
  return shadows.join(",");
}

export function rasterInkRatio(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const total = Math.max(1, width * height);
  let ink = 0;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    if (rgba[o + 3] < 20) continue;
    if (rgba[o] < 220 || rgba[o + 1] < 220 || rgba[o + 2] < 220) ink += 1;
  }
  return ink / total;
}

export function looksLikeBlockedSignatureRaster(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  return rasterInkRatio(rgba, width, height) > 0.28;
}

export function rgbaToBoxShadow(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number
): string {
  if (looksLikeBlockedSignatureRaster(rgba, srcW, srcH)) return "";
  const scaleX = destW / Math.max(1, srcW);
  const scaleY = destH / Math.max(1, srcH);
  const step = srcW * srcH > 18000 ? 2 : 1;
  const radius = Math.max(0.8, scaleY).toFixed(1);
  const shadows: string[] = [];
  for (let y = 0; y < srcH; y += step) {
    for (let x = 0; x < srcW; x += step) {
      const i = (y * srcW + x) * 4;
      if (rgba[i + 3] < 20) continue;
      if (rgba[i] >= 220 && rgba[i + 1] >= 220 && rgba[i + 2] >= 220) continue;
      shadows.push(
        `${(x * scaleX).toFixed(1)}px ${(y * scaleY).toFixed(1)}px 0 ${radius}px #0f766e`
      );
      if (shadows.length > 3500) break;
    }
    if (shadows.length > 3500) break;
  }
  return shadows.join(",");
}

/** דיו להצגה ב-CSS בלבד — בלי canvas/img/svg שהסינון מחליף */
export async function signatureToBoxShadow(
  value: string,
  destW: number,
  destH: number
): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (isSvgSignature(trimmed)) {
    const box = svgViewBox(trimmed);
    const scaleX = destW / box.w;
    const scaleY = destH / box.h;
    const scaled = svgPathToStrokes(trimmed).map((stroke) =>
      stroke.map((point) => ({
        x: point.x * scaleX,
        y: point.y * scaleY,
      }))
    );
    return strokesToBoxShadow(scaled);
  }
  if (!isPngDataUrl(trimmed)) return "";
  const decoded = await decodePngDataUrl(trimmed);
  if (!decoded) return "";
  return rgbaToBoxShadow(
    decoded.rgba,
    decoded.width,
    decoded.height,
    destW,
    destH
  );
}

export function strokesToPngDataUrl(
  strokes: SignaturePoint[][],
  width: number,
  height: number
): string {
  const canvas = document.createElement("canvas");
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return strokesToSvg(strokes, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  strokePaths(ctx, strokes);
  return canvas.toDataURL("image/png").replace(/\s/g, "");
}

/** HTML בלי img/svg — הסינון מחליף אותם במציין «בתמונה» */
function signInkMarkup(strokes: SignaturePoint[][]): string {
  const shadow = strokesToBoxShadow(fitStrokesToDest(strokes, 240, 40));
  if (!shadow) return `<span class="sign-received">נחתם</span>`;
  return `<span class="sign-ink" style="display:block;width:100%;height:40px;position:relative"><span style="position:absolute;left:0;top:0;width:1px;height:1px;box-shadow:${shadow}"></span></span>`;
}

export function formatSignatureMarkup(value: string): string {
  const trimmed = value.trim();
  if (isInkPathSignature(trimmed)) {
    const parsed = parseInkPathSignature(trimmed);
    if (!parsed) return `<span class="sign-received">נחתם</span>`;
    return signInkMarkup(parsed.strokes);
  }
  if (isSvgSignature(trimmed)) {
    const safe = sanitizeSignatureSvg(trimmed);
    return signInkMarkup(svgPathToStrokes(safe));
  }
  if (isPngDataUrl(trimmed)) {
    return `<span class="sign-received">נחתם</span>`;
  }
  if (isSimpleSignSignedValue(trimmed)) {
    return `<span class="sign-received">${escapeHtmlText(
      formatSimpleSignSignedLabel(trimmed)
    )}</span>`;
  }
  return escapeHtmlText(trimmed);
}

/** מציג «נחתם» במקום תמונות/svg של חתימה — לא נוגע בלוגואים (logo-*) */
export function snapshotHtmlWithoutBlockedImages(html: string): string {
  return html
    .replace(
      /<img\b(?![^>]*\bclass=["'][^"']*\blogo-)[^>]*src=["']data:image[^"']*["'][^>]*>/gi,
      '<span class="sign-received">נחתם</span>'
    )
    .replace(/<svg[\s\S]*?<\/svg>/gi, '<span class="sign-received">נחתם</span>');
}

/**
 * Sanitizes HTML for safe display (server-safe allowlist, no jsdom).
 * Removes scripts, event handlers, and dangerous URIs (javascript:, data:).
 * Preserves <style> tags for CSS layout.
 */
const VIEW_SAFE_DATA_IMAGE_RE =
  /^data:image\/(?:png|jpeg|jpg|gif|webp);/i;

const HTML_NUMERIC_ENTITY_RE = /&#(\d+);/g;
const HTML_HEX_ENTITY_RE = /&#x([0-9a-f]+);/gi;
const HTML_NAMED_ENTITY_RE = /&(amp|lt|gt|quot|apos);/gi;

function decodeHtmlAttributeEntities(value: string): string {
  return value
    .replace(HTML_NUMERIC_ENTITY_RE, (_, digits: string) => {
      const code = Number(digits);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(HTML_HEX_ENTITY_RE, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(HTML_NAMED_ENTITY_RE, (entity) => {
      switch (entity.toLowerCase()) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        case "&apos;":
          return "'";
        default:
          return entity;
      }
    });
}

/** Strip C0 controls/spaces, then detect data: (after optional entity decoding). */
function normalizeUriForDataSchemeCheck(value: string): string {
  const decoded = decodeHtmlAttributeEntities(value);
  return decoded.replace(/[\x00-\x20]/g, "");
}

const STRIP_VIEW_ALLOWED_TAGS = [
  "html",
  "head",
  "body",
  "title",
  "meta",
  "style",
  "link",
  "div",
  "span",
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "small",
  "header",
  "footer",
  "section",
  "article",
  "nav",
  "aside",
  "main",
  "figure",
  "figcaption",
  "label",
  "input",
  "textarea",
  "select",
  "option",
  "pre",
  "code",
  "blockquote",
  "q",
  "cite",
  "abbr",
  "address",
  "time",
] as const;

const STRIP_VIEW_ALLOWED_ATTRS = [
  "class",
  "id",
  "style",
  "title",
  "lang",
  "dir",
  "aria-label",
  "aria-hidden",
  "href",
  "src",
  "alt",
  "width",
  "height",
  "colspan",
  "rowspan",
  "type",
  "name",
  "value",
  "placeholder",
  "disabled",
  "readonly",
  "checked",
  "rows",
  "cols",
  "for",
  "charset",
  "content",
  "rel",
  "decoding",
  "draggable",
  "tabindex",
  "role",
] as const;

function stripUnsafeDataUriAttribs(
  tagName: string,
  attribs: Record<string, string>
): { tagName: string; attribs: Record<string, string> } {
  for (const attr of ["src", "href"]) {
    const value = attribs[attr];
    if (!value) continue;
    const normalized = normalizeUriForDataSchemeCheck(value);
    if (/^data:/i.test(normalized) && !VIEW_SAFE_DATA_IMAGE_RE.test(normalized)) {
      delete attribs[attr];
    }
  }
  return { tagName, attribs };
}

const stripViewSanitizeOptions: sanitizeHtml.IOptions = {
  allowVulnerableTags: true,
  allowedTags: [...STRIP_VIEW_ALLOWED_TAGS],
  allowedAttributes: {
    "*": [...STRIP_VIEW_ALLOWED_ATTRS],
  },
  disallowedTagsMode: "discard",
  allowedSchemes: ["http", "https", "mailto", "tel", "data"],
  allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
  allowProtocolRelative: false,
  parseStyleAttributes: true,
  transformTags: {
    "*": stripUnsafeDataUriAttribs,
  },
};

export function stripScriptsForView(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, stripViewSanitizeOptions);
}
