import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORM_SCHEMAS, listFormFields } from "../src/lib/form-schemas";
import { serializeFormSchema } from "../src/lib/form-schema-json";
import { SIMPLESIGN_FORM_CONFIGS } from "../src/lib/simplesign/config";

const STRUCTURAL = new Set([
  "static",
  "rating-grid",
  "schedule-grid",
  "row-table",
  "accommodations-picker",
]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "content", "forms");

function toCamel(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

function lockedKeysFor(formId: string): string[] | null {
  const config = SIMPLESIGN_FORM_CONFIGS.find((item) => item.formId === formId);
  if (!config) return null;
  const schema = FORM_SCHEMAS.find((item) => item.id === formId);
  if (!schema) {
    throw new Error(`SimpleSign form missing schema: ${formId}`);
  }
  const keys = listFormFields(schema)
    .filter((field) => !field.type || !STRUCTURAL.has(field.type))
    .map((field) => field.key);
  for (const signer of config.parentSigners) {
    if (!keys.includes(signer.signatureFieldKey)) {
      keys.push(signer.signatureFieldKey);
    }
  }
  return [...new Set(keys)];
}

mkdirSync(outDir, { recursive: true });

const files: { id: string; fileName: string; camel: string }[] = [];

for (const schema of FORM_SCHEMAS) {
  const fileName = `${schema.id}.json`;
  const json = serializeFormSchema(schema, lockedKeysFor(schema.id));
  writeFileSync(join(outDir, fileName), `${JSON.stringify(json, null, 2)}\n`, "utf8");
  files.push({ id: schema.id, fileName, camel: toCamel(schema.id) });
}

const imports = files
  .map((file) => `import ${file.camel} from "./${file.fileName}";`)
  .join("\n");

const entries = files
  .map(
    (file) =>
      `  { fileName: "${file.fileName}", data: ${file.camel} },`
  )
  .join("\n");

writeFileSync(
  join(outDir, "index.ts"),
  `${imports}\n\nexport const FORM_SCHEMA_JSON_FILES: { fileName: string; data: unknown }[] = [\n${entries}\n];\n`,
  "utf8"
);

console.log(`wrote ${files.length} form JSON files`);
