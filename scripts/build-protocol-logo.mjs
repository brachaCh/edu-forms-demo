/**
 * בונה את לוגו פרוטוקל מקובץ מקור עם רקע בהיר.
 * מחליף רקע לצבע האתר, שומר את כל הלוגו (בלי חיתוך צדדי).
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const SITE_BG = { r: 248, g: 250, b: 253, alpha: 255 };

const sourceArg = process.argv[2];
const SOURCE =
  sourceArg ??
  path.join(process.cwd(), "public/brand/protocol-logo-source.png");

const brand = path.resolve("public/brand");

function isSiteBackground(r, g, b, a) {
  if (a < 12) return true;
  // שחור (גרסה ישנה)
  if (r < 16 && g < 16 && b < 16) return true;
  // לבן / אפור בהיר / טקסטורת רקע
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 228 && max - min < 28) return true;
  if (r > 198 && g > 198 && b > 198 && max - min < 35) return true;
  return false;
}

async function trimToContent(input) {
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
      const i = (y * info.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (!isSiteBackground(r, g, b, a)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    throw new Error("No logo content detected in source image");
  }

  const padX = 72;
  const padY = 48;
  const left = Math.max(0, minX - padX);
  const top = Math.max(0, minY - padY);
  const width = Math.min(info.width - left, maxX - minX + 1 + padX * 2);
  const height = Math.min(info.height - top, maxY - minY + 1 + padY * 2);

  return sharp(input).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
}

async function bakeBackground({ data, info }) {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    if (isSiteBackground(r, g, b, out[i + 3])) {
      out[i] = SITE_BG.r;
      out[i + 1] = SITE_BG.g;
      out[i + 2] = SITE_BG.b;
      out[i + 3] = 255;
    } else {
      out[i + 3] = 255;
    }
  }
  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 6, effort: 8 })
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Missing source: ${SOURCE}`);
  }

  const cropped = await trimToContent(SOURCE);
  const logo = await bakeBackground(cropped);
  const meta = await sharp(logo).metadata();

  const targets = [
    "protocol-logo.png",
    "protocol-logo-banner.png",
    "protocol-logo-entrance.png",
    "protocol-logo-hero.png",
    "landing-logo.png",
    "giti-protocol-logo.png",
    "protokol-form-footer.png",
  ];

  for (const name of targets) {
    fs.writeFileSync(path.join(brand, name), logo);
  }

  console.log("source", SOURCE);
  console.log("output", `${meta.width}x${meta.height}`, logo.length, "bytes");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
