import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const brand = path.resolve("public/brand");
const framesDir = path.join(brand, "_anim_frames");
const outWebp = path.join(brand, "protocol-logo-animated.webp");
const outGif = path.join(brand, "protocol-logo-animated.gif");
const checkFrame = path.join(brand, "_frame37-check.png");

const files = fs
  .readdirSync(framesDir)
  .filter((f) => /^f\d+\.png$/i.test(f))
  .sort();

console.log("frames", files.length);

const { width, height } = await sharp(path.join(framesDir, files[0])).metadata();
const buffers = [];
for (const f of files) {
  buffers.push(await sharp(path.join(framesDir, f)).ensureAlpha().toBuffer());
}

const strip = await sharp({
  create: {
    width,
    height: height * buffers.length,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(buffers.map((input, i) => ({ input, top: i * height, left: 0 })))
  .png()
  .toBuffer();

const delay = Math.round(1000 / 15);

await sharp(strip, { pages: buffers.length, pageHeight: height })
  .webp({
    animated: true,
    loop: 0,
    delay: Array(buffers.length).fill(delay),
    lossless: true,
    effort: 4,
  })
  .toFile(outWebp);

await sharp(strip, { pages: buffers.length, pageHeight: height })
  .gif({
    animated: true,
    loop: 0,
    delay: Array(buffers.length).fill(delay),
    effort: 7,
  })
  .toFile(outGif);

console.log("webp", fs.statSync(outWebp).size);
console.log("gif", fs.statSync(outGif).size);

await sharp(outWebp, { animated: true, page: 37, pages: 1 })
  .png()
  .toFile(checkFrame);

const meta = await sharp(checkFrame).metadata();
console.log("check frame", meta.width, "x", meta.height);
