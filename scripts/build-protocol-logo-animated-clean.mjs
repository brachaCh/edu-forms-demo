/**
 * בונה לוגו פרוטוקל מונפש:
 * - בלי טלפון/מייל
 * - רקע צבע האתר (#f8fafd)
 * - רזולוציה כפולה לחדות
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const brand = path.resolve("public/brand");
const framesDir = path.join(brand, "_anim_frames");
const SITE_BG = { r: 248, g: 250, b: 253, alpha: 255 };

/** גובה אחרי הסרת שורת קשר (נמדד מפריים מלא) */
const CROP_HEIGHT = 212;
const UPSCALE = 2;

function isEmptyBg(r, g, b, a) {
  if (a < 18) return true;
  if (r < 18 && g < 18 && b < 18) return true;
  return false;
}

async function processFrame(filePath) {
  const meta = await sharp(filePath).metadata();
  const width = meta.width ?? 720;
  const height = Math.min(CROP_HEIGHT, meta.height ?? CROP_HEIGHT);

  const { data, info } = await sharp(filePath)
    .extract({ left: 0, top: 0, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (isEmptyBg(out[i], out[i + 1], out[i + 2], out[i + 3])) {
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
    .resize(info.width * UPSCALE, info.height * UPSCALE, {
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6, effort: 7 })
    .toBuffer();
}

async function main() {
  const files = fs
    .readdirSync(framesDir)
    .filter((f) => /^f\d+\.png$/i.test(f))
    .sort();

  if (files.length === 0) {
    throw new Error("No animation frames found");
  }

  console.log("processing", files.length, "frames…");

  const buffers = [];
  for (const f of files) {
    buffers.push(await processFrame(path.join(framesDir, f)));
  }

  const firstMeta = await sharp(buffers[0]).metadata();
  const frameW = firstMeta.width ?? 1440;
  const frameH = firstMeta.height ?? 424;

  const sprite = await sharp({
    create: {
      width: frameW,
      height: frameH * buffers.length,
      channels: 4,
      background: SITE_BG,
    },
  })
    .composite(buffers.map((input, i) => ({ input, top: i * frameH, left: 0 })))
    .png({ compressionLevel: 6, effort: 7 })
    .toBuffer();

  fs.writeFileSync(path.join(brand, "protocol-logo-sprite.png"), sprite);

  // פריים מלא סטטי (בערך אמצע האנימציה) + עותקים
  const staticFrame = buffers[Math.min(37, buffers.length - 1)];
  const staticTargets = [
    "protocol-logo.png",
    "protocol-logo-banner.png",
    "protocol-logo-entrance.png",
    "protocol-logo-hero.png",
    "landing-logo.png",
    "giti-protocol-logo.png",
    "protokol-form-footer.png",
    "protocol-logo-source.png",
  ];
  for (const name of staticTargets) {
    fs.writeFileSync(path.join(brand, name), staticFrame);
  }

  const meta = {
    width: frameW,
    height: frameH,
    frames: buffers.length,
    durationMs: Math.round((buffers.length / 15) * 1000),
    fps: 15,
    cropHeightOriginal: CROP_HEIGHT,
    upscale: UPSCALE,
  };
  fs.writeFileSync(
    path.join(brand, "protocol-logo-sprite.json"),
    JSON.stringify(meta, null, 2)
  );

  console.log("sprite", frameW + "x" + frameH * buffers.length, sprite.length);
  console.log("frame", frameW + "x" + frameH, "frames", buffers.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
