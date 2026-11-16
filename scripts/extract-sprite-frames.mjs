import sharp from "sharp";

const pages = [0, 10, 20, 30, 37, 50, 74];
for (const page of pages) {
  await sharp("public/brand/protocol-logo-sprite.png")
    .extract({ left: 0, top: page * 267, width: 720, height: 267 })
    .png()
    .toFile(`public/brand/.frame${page}.png`);
  await sharp("public/brand/protocol-logo-animated.webp", {
    animated: true,
    page,
    pages: 1,
  })
    .png()
    .toFile(`public/brand/.webp${page}.png`);
  console.log("frame", page);
}
