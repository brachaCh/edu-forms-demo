import fs from "fs";
import path from "path";
import mammoth from "mammoth";

const OUT_DIR = path.join(process.cwd(), "src/content/legal");
const PUBLIC_DIR = path.join(process.cwd(), "public/legal");

const DOCS = [
  {
    id: "accessibility",
    source:
      "C:/Users/This User/Downloads/פרוטוקל הצהרת נגישות.docx",
    title: "הצהרת נגישות",
    subtitle: 'אתר ומערכת "פרוטוקול"',
  },
  {
    id: "privacy",
    source:
      "C:/Users/This User/Downloads/פרוטוקל מדיניות פרטיות.docx",
    title: "מדיניות פרטיות",
    subtitle: 'אתר ומערכת "פרוטוקול"',
  },
  {
    id: "terms-of-use",
    source:
      "C:/Users/This User/Downloads/פרוטוקל תקנון שימוש למערכת.docx",
    title: "תקנון שימוש",
    subtitle: 'מערכת "פרוטוקול"',
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  for (const doc of DOCS) {
    if (!fs.existsSync(doc.source)) {
      throw new Error(`Missing source: ${doc.source}`);
    }

    const html = await mammoth.convertToHtml({ path: doc.source });
    const payload = {
      title: doc.title,
      subtitle: doc.subtitle,
      html: html.value,
    };

    fs.writeFileSync(
      path.join(OUT_DIR, `${doc.id}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    );

    fs.copyFileSync(
      doc.source,
      path.join(PUBLIC_DIR, `${doc.id}.docx`)
    );

    console.log("wrote", doc.id, `${html.value.length} chars`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
