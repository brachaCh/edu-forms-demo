import fs from "fs";
import path from "path";
import sharp from "sharp";

const SOURCE = path.join(
  process.cwd(),
  "public/brand/feature-icons/_source-strip.png"
);
const OUT_DIR = path.join(process.cwd(), "public/brand/feature-icons");
const COUNT = 8;
const LABELS = [
  "auto-phrasing",
  "voice-recording",
  "data-security",
  "student-file",
  "docs-reports",
  "quick-docs",
  "work-plans",
  "parent-sharing",
];

/** רקע לבן/כמעט-לבן של הסטריפ — לא צבעי איקון */
function isBgWhite(r, g, b, a) {
  if (a < 8) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 238 && max - min <= 14;
}

function floodClearBg(data, width, height) {
  const seen = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (seen[idx]) return;
    const i = idx * 4;
    if (!isBgWhite(data[i], data[i + 1], data[i + 2], data[i + 3])) return;
    seen[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const idx = stack.pop();
    data[idx * 4 + 3] = 0;
    const x = idx % width;
    const y = (idx / width) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

function clearWhiteFringe(data, width, height) {
  for (let pass = 0; pass < 2; pass++) {
    const clear = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 8) continue;
        if (!isBgWhite(data[i], data[i + 1], data[i + 2], data[i + 3])) {
          continue;
        }
        let nearClear = false;
        for (let dy = -1; dy <= 1 && !nearClear; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              nearClear = true;
              break;
            }
            if (data[(ny * width + nx) * 4 + 3] < 8) {
              nearClear = true;
              break;
            }
          }
        }
        if (nearClear) clear.push(i);
      }
    }
    for (const i of clear) data[i + 3] = 0;
  }
}

/** חותך מתחת לאיקון — לפני כפתורי התווית והפסים */
function findIconCutY(data, width, height) {
  const rowSat = new Array(height).fill(0);
  const rowContent = new Array(height).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 8 || isBgWhite(r, g, b, a)) continue;
      rowContent[y]++;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min > 35 && max > 70) rowSat[y]++;
    }
  }

  let contentStart = 0;
  for (let y = 0; y < height; y++) {
    if (rowContent[y] > width * 0.04) {
      contentStart = y;
      break;
    }
  }

  // פער בין האיקון לתווית (שורה כמעט ריקה)
  const searchFrom = contentStart + Math.floor(height * 0.25);
  for (let y = searchFrom; y < height - 4; y++) {
    const density = rowContent[y] / width;
    const sat = rowSat[y] / width;
    if (density < 0.04 && sat < 0.02) {
      // בדוק שיש תוכן שוב למטה (תווית)
      let labelBelow = false;
      for (let yy = y + 2; yy < Math.min(height, y + 40); yy++) {
        if (rowSat[yy] / width > 0.15) {
          labelBelow = true;
          break;
        }
      }
      if (labelBelow) return Math.max(contentStart + 8, y - 2);
    }
  }

  return Math.floor(height * 0.55);
}

async function trimTransparent(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return input;

  const pad = 4;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  return sharp(input)
    .extract({
      left,
      top,
      width: Math.min(info.width - left, maxX - minX + 1 + pad * 2),
      height: Math.min(info.height - top, maxY - minY + 1 + pad * 2),
    })
    .png()
    .toBuffer();
}

/** גבולות אופקיים לפי רווחים לבנים בין איקונים (מקור לפני הגדלה) */
async function findSliceBounds(sourcePath, count) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const colSat = new Array(w).fill(0);
  const y0 = Math.floor(h * 0.25);
  const y1 = Math.floor(h * 0.55);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max >= 238 && max - min <= 14) continue;
      if (max - min > 35 && max > 70) colSat[x]++;
    }
  }

  const gaps = [];
  let inGap = false;
  for (let x = 0; x < w; x++) {
    const low = colSat[x] < 3;
    if (low && !inGap) {
      inGap = true;
      gaps.push({ start: x, end: x });
    } else if (low && inGap) {
      gaps[gaps.length - 1].end = x;
    } else if (!low && inGap) {
      inGap = false;
    }
  }

  const wide = gaps
    .filter((g) => g.end - g.start + 1 >= 16)
    .map((g) => Math.floor((g.start + g.end) / 2));

  if (wide.length < count + 1) {
    const slice = Math.floor(w / count);
    return Array.from({ length: count }, (_, i) => ({
      left: i * slice,
      width: i === count - 1 ? w - i * slice : slice,
    }));
  }

  return Array.from({ length: count }, (_, i) => {
    const left = wide[i];
    const right = wide[i + 1];
    return { left, width: right - left };
  });
}

async function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`Missing ${SOURCE}`);

  const nativeBounds = await findSliceBounds(SOURCE, COUNT);
  console.log(
    "native bounds",
    nativeBounds.map((b) => `${b.left}+${b.width}`).join(", ")
  );

  // הגדלה לפני חיתוך — מקור צר; נדרש לרטינה חדה
  const UPSCALE = 3;
  const srcMeta = await sharp(SOURCE).metadata();
  const srcW = srcMeta.width ?? 1024;
  const upscaled = await sharp(SOURCE)
    .resize({
      width: srcW * UPSCALE,
      kernel: "lanczos3",
    })
    .ensureAlpha()
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(OUT_DIR, "master-strip.png"), upscaled);

  const meta = await sharp(upscaled).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  console.log("source(upscaled)", width, height);

  for (let i = 0; i < COUNT; i++) {
    const left = nativeBounds[i].left * UPSCALE;
    const extractWidth = nativeBounds[i].width * UPSCALE;

    const { data, info } = await sharp(upscaled)
      .extract({ left, top: 0, width: extractWidth, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // שומרים איקון + כפתור כיתוב + פס צבעים (בלי לחתוך תוויות)
    floodClearBg(data, info.width, info.height);
    clearWhiteFringe(data, info.width, info.height);

    let png = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();

    png = await trimTransparent(png);

    const m = await sharp(png).metadata();
    const targetH = 320;
    const outPath = path.join(
      OUT_DIR,
      `feature-${String(i + 1).padStart(2, "0")}.png`
    );

    await sharp(png)
      .resize({
        height: targetH,
        width: Math.round(((m.width ?? 1) / (m.height ?? 1)) * targetH),
        kernel: "lanczos3",
        fit: "inside",
      })
      .png({ compressionLevel: 6, effort: 8, palette: false })
      .toFile(outPath);

    const out = await sharp(outPath).metadata();
    console.log(
      "wrote",
      path.basename(outPath),
      LABELS[i],
      `${out.width}x${out.height}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
