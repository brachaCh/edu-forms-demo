import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const brand = path.resolve("public/brand");
const framesDir = path.join(brand, "_anim_frames");
const outDir = path.join(brand, "_anim_frames_transparent");
const threshold = 248;

fs.mkdirSync(outDir, { recursive: true });

const files = fs
  .readdirSync(framesDir)
  .filter((f) => f.endsWith(".png"))
  .sort();

for (const file of files) {
  const input = path.join(framesDir, file);
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(path.join(outDir, file));
}

console.log(`Processed ${files.length} frames -> ${outDir}`);
console.log(`${info.width}x${info.height}`);
