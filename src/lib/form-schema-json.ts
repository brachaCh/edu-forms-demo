import { z } from "zod";
import type { FormFieldDef, FormFieldType, SharedFieldKey } from "@/lib/form-fields";
import type { FormSchema, FormSection } from "@/lib/form-schemas";
import type { ScheduleGridVariant } from "@/lib/form-table-grids";

const SHARED_FIELD_KEYS = [
  "full_name",
  "id_number",
  "birth_date",
  "gender",
  "home_address",
  "city",
  "phone",
  "email",
  "father_name",
  "mother_name",
  "father_mobile",
  "mother_mobile",
  "class_name",
  "teacher_name",
  "family_status",
  "notes",
] as const satisfies readonly SharedFieldKey[];

const FIELD_TYPES = [
  "text",
  "textarea",
  "date",
  "checkbox",
  "select",
  "static",
  "signature",
  "rating-grid",
  "schedule-grid",
  "row-table",
  "accommodations-picker",
  "func-scale",
] as const;

const SCHEDULE_VARIANTS = [
  "simple",
  "detailed",
  "tlk-weekly",
  "tlk-paramedical",
  "tlk-inclusion",
  "tlk-personal",
  "staff-weekly",
] as const satisfies readonly ScheduleGridVariant[];

const SECTION_LAYOUTS = [
  "default",
  "holistic-profile",
  "integrative-tachi",
  "class-profile",
  "learning-clusters",
] as const;

const FUNC_SCALE_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
  { value: "9", label: "9" },
] as const;

const fieldJsonSchema = z
  .object({
    key: z.string().trim().min(1),
    label: z.string(),
    type: z.enum(FIELD_TYPES).optional(),
    required: z.boolean().optional(),
    shared: z.boolean().optional(),
    studentKey: z.enum(SHARED_FIELD_KEYS).optional(),
    rows: z.number().int().positive().optional(),
    options: z
      .array(
        z
          .object({
            value: z.string(),
            label: z.string(),
          })
          .strict()
      )
      .optional(),
    hint: z.string().optional(),
    scheduleVariant: z.enum(SCHEDULE_VARIANTS).optional(),
  })
  .strict();

const formSchemaFileSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().min(1),
    folder: z.string().min(1),
    categoryFolder: z.string().min(1),
    simplesign: z
      .object({
        lockedKeys: z.array(z.string().trim().min(1)).min(1),
      })
      .strict()
      .optional(),
    sections: z
      .array(
        z
          .object({
            title: z.string().optional(),
            layout: z.enum(SECTION_LAYOUTS).optional(),
            fields: z.array(fieldJsonSchema),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

export type FormSchemaJsonField = z.infer<typeof fieldJsonSchema>;
export type FormSchemaJson = z.infer<typeof formSchemaFileSchema>;

export interface ParsedFormSchemaFile {
  schema: FormSchema;
  lockedKeys: string[] | null;
}

function jsonFileId(fileName: string): string {
  return fileName.replace(/\.json$/i, "").trim();
}

function isSupportSettingSelect(field: FormFieldDef): boolean {
  if (field.type !== "select") return false;
  const values = field.options?.map((option) => option.value) ?? [];
  return (
    values.length === 2 && values.includes("individual") && values.includes("group")
  );
}

/** מפתחות `{key}_{option}` שנשלחים ל-SimpleSign כתיבות סימון. */
function exclusiveSelectOptionLockKeys(field: FormFieldDef): string[] {
  if (field.type !== "select" || !field.options?.length) return [];
  if (isFuncScaleSelect(field) || isSupportSettingSelect(field)) return [];
  return field.options.map((option) => `${field.key}_${option.value}`);
}

export function listLockableFormKeys(schema: FormSchema): Set<string> {
  const keys = new Set<string>();
  for (const field of schema.sections.flatMap((section) => section.fields)) {
    keys.add(field.key);
    for (const optionKey of exclusiveSelectOptionLockKeys(field)) {
      keys.add(optionKey);
    }
  }
  return keys;
}

function fieldKeys(schema: FormSchema): Set<string> {
  return listLockableFormKeys(schema);
}

function isFuncScaleSelect(field: FormFieldDef): boolean {
  if (field.type !== "select" || !field.key.startsWith("func_")) return false;
  const values = field.options?.map((option) => option.value) ?? [];
  return (
    values.length === 9 && values.every((value, index) => value === String(index + 1))
  );
}

function expandField(raw: FormSchemaJsonField): FormFieldDef {
  if (raw.type === "func-scale") {
    return {
      key: raw.key,
      label: raw.label,
      type: "select",
      required: raw.required,
      shared: raw.shared,
      studentKey: raw.studentKey,
      rows: raw.rows,
      hint: raw.hint,
      options: FUNC_SCALE_OPTIONS.map((option) => ({ ...option })),
    };
  }
  const type = (raw.type ?? "text") as FormFieldType;
  const field: FormFieldDef = {
    key: raw.key,
    label: raw.label,
    type,
  };
  if (raw.required) field.required = true;
  if (raw.shared) field.shared = true;
  if (raw.studentKey) field.studentKey = raw.studentKey;
  if (raw.rows != null) field.rows = raw.rows;
  if (raw.options) field.options = raw.options.map((option) => ({ ...option }));
  if (raw.hint) field.hint = raw.hint;
  if (raw.scheduleVariant) field.scheduleVariant = raw.scheduleVariant;
  return field;
}

function compactField(field: FormFieldDef): FormSchemaJsonField {
  if (isFuncScaleSelect(field)) {
    return { key: field.key, label: field.label, type: "func-scale" };
  }
  const raw: FormSchemaJsonField = {
    key: field.key,
    label: field.label,
  };
  if (field.type && field.type !== "text") raw.type = field.type;
  if (field.required) raw.required = true;
  if (field.shared) raw.shared = true;
  if (field.studentKey) raw.studentKey = field.studentKey;
  if (field.rows != null) raw.rows = field.rows;
  if (field.options?.length) {
    raw.options = field.options.map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }
  if (field.hint) raw.hint = field.hint;
  if (field.scheduleVariant) raw.scheduleVariant = field.scheduleVariant;
  return raw;
}

export function parseFormSchemaFile(
  raw: unknown,
  fileName: string
): ParsedFormSchemaFile {
  const parsed = formSchemaFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`סכמת JSON לא תקינה ב-${fileName}`);
  }
  const data = parsed.data;
  const expectedId = jsonFileId(fileName);
  if (data.id !== expectedId) {
    throw new Error(
      `מזהה הטופס (${data.id}) לא תואם לשם הקובץ (${expectedId})`
    );
  }

  const schema: FormSchema = {
    id: data.id,
    title: data.title,
    folder: data.folder,
    categoryFolder: data.categoryFolder,
    sections: data.sections.map((section) => {
      const next: FormSection = {
        fields: section.fields.map(expandField),
      };
      if (section.title) next.title = section.title;
      if (section.layout) next.layout = section.layout;
      return next;
    }),
  };

  const locked = data.simplesign?.lockedKeys ?? null;
  if (locked) {
    const unique = new Set(locked);
    if (unique.size !== locked.length) {
      throw new Error(`יש מפתחות נעולים כפולים ב-${data.id}`);
    }
    const keys = fieldKeys(schema);
    const missing = locked.filter((key) => !keys.has(key));
    if (missing.length > 0) {
      throw new Error(
        `מפתח נעול חסר בטופס ${data.id}: ${missing.join(", ")}`
      );
    }
  }

  return { schema, lockedKeys: locked };
}

export function serializeFormSchema(
  schema: FormSchema,
  lockedKeys: string[] | null
): FormSchemaJson {
  const json: FormSchemaJson = {
    id: schema.id,
    title: schema.title,
    folder: schema.folder,
    categoryFolder: schema.categoryFolder,
    sections: schema.sections.map((section) => {
      const next: FormSchemaJson["sections"][number] = {
        fields: section.fields.map(compactField),
      };
      if (section.title) next.title = section.title;
      if (section.layout) next.layout = section.layout;
      return next;
    }),
  };
  if (lockedKeys && lockedKeys.length > 0) {
    json.simplesign = { lockedKeys: [...lockedKeys] };
  }
  return json;
}
