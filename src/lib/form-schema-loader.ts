import { FORM_SCHEMA_JSON_FILES } from "@/content/forms";
import { parseFormSchemaFile } from "@/lib/form-schema-json";
import type { FormSchema } from "@/lib/form-schemas";

interface LoadedFormCatalog {
  schemas: FormSchema[];
  lockedKeysByFormId: Map<string, string[]>;
}

let catalog: LoadedFormCatalog | null = null;

function loadFormCatalog(): LoadedFormCatalog {
  if (catalog) return catalog;
  const schemas: FormSchema[] = [];
  const lockedKeysByFormId = new Map<string, string[]>();
  for (const file of FORM_SCHEMA_JSON_FILES) {
    const parsed = parseFormSchemaFile(file.data, file.fileName);
    schemas.push(parsed.schema);
    if (parsed.lockedKeys) {
      lockedKeysByFormId.set(parsed.schema.id, parsed.lockedKeys);
    }
  }
  catalog = { schemas, lockedKeysByFormId };
  return catalog;
}

export function loadFormSchemas(): FormSchema[] {
  return loadFormCatalog().schemas;
}

export function getFormLockedKeys(formId: string): string[] | null {
  return loadFormCatalog().lockedKeysByFormId.get(formId.trim()) ?? null;
}
