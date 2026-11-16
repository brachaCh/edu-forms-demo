import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const brand = path.resolve("public/brand");
const framesDir = path.join(brand, "_anim_frames");
const outSprite = path.join(brand, "protocol-logo-sprite.png");
const outMeta = path.join(brand, "protocol-logo-sprite.json");

const files = fs
  .readdirSync(framesDir)
  .filter((f) => /^f\d+\.png$/i.test(f))
  .sort();

const { width, height } = await sharp(path.join(framesDir, files[0])).metadata();
const buffers = [];
for (const f of files) {
  buffers.push(await sharp(path.join(framesDir, f)).ensureAlpha().toBuffer());
}

await sharp({
  create: {
    width,
    height: height * buffers.length,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(buffers.map((input, i) => ({ input, top: i * height, left: 0 })))
  .png()
  .toFile(outSprite);

const meta = {
  width,
  height,
  frames: buffers.length,
  durationMs: Math.round((buffers.length / 15) * 1000),
  fps: 15,
};
fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2));
console.log("sprite", outSprite, fs.statSync(outSprite).size);
console.log(meta);
