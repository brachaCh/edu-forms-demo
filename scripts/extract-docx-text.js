const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const paths = [
  String.raw`c:\Users\This User\Downloads\תיק שילוב (1).docx`,
  String.raw`c:\Users\This User\Downloads\תיק סל אישי (1).docx`,
  String.raw`c:\Users\This User\Downloads\תחי .docx`,
];

const outDir = path.join(
  process.env.TEMP || os.tmpdir(),
  "matoah-docx-extract"
);
fs.mkdirSync(outDir, { recursive: true });

for (const p of paths) {
  const base = path.basename(p);
  console.log("=".repeat(60));
  console.log(base);
  console.log("=".repeat(60));
  if (!fs.existsSync(p)) {
    console.log("MISSING FILE");
    continue;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "docx-"));
  const zip = path.join(tmp, "d.zip");
  fs.copyFileSync(p, zip);
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: "pipe" }
  );
  const xml = fs.readFileSync(path.join(tmp, "word", "document.xml"), "utf8");
  const paras = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[0];
    const texts = [...block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) =>
      x[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
    );
    const line = texts.join("").trim();
    if (line) paras.push(line);
  }
  const outFile = path.join(outDir, base.replace(/[^\w\u0590-\u05FF.-]+/g, "_") + ".txt");
  fs.writeFileSync(outFile, paras.join("\n"), "utf8");
  console.log(paras.slice(0, 120).join("\n"));
  console.log("\n... total paras:", paras.length, "saved:", outFile);
}
