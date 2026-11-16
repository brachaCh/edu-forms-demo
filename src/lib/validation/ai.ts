import { z } from "zod";
import { trimmedString } from "./primitives";

const MAX_FIELDS = 250;
const MAX_VALUE_CHARS = 4000;
const MAX_NOTES_CHARS = 2000;
const MAX_CONTEXT_CHARS = 4000;
const MAX_EXAMPLE_CHARS = 12_000;
const MAX_INPUT_CHARS = 4000;

export const fillFormBodySchema = z.object({
  formId: trimmedString(80).optional(),
  formTitle: trimmedString(200).optional(),
  categoryFolder: trimmedString(120).optional(),
  fields: z
    .array(
      z.object({
        key: z.string().max(200).optional(),
        label: z.string().max(300).optional(),
        type: z.string().max(80).optional(),
        options: z
          .array(
            z.object({
              value: z.string().max(200).optional(),
              label: z.string().max(200).optional(),
            })
          )
          .max(100)
          .optional(),
        hint: z.string().max(500).optional(),
        currentValue: z.string().max(MAX_VALUE_CHARS).optional(),
      })
    )
    .min(1)
    .max(MAX_FIELDS),
  studentContext: z
    .record(z.string().max(200), z.string().max(MAX_CONTEXT_CHARS))
    .optional(),
  teacherNotes: z.string().max(MAX_NOTES_CHARS).optional(),
  exampleTemplate: z.string().max(MAX_EXAMPLE_CHARS).optional(),
  studentName: z.string().max(200).optional(),
  freeAccess: z.boolean().optional(),
  refine: z.boolean().optional(),
});

export const refineTranscriptBodySchema = z.object({
  text: z.string().min(1).max(MAX_INPUT_CHARS),
  fieldLabel: z.string().max(120).optional(),
  studentName: z.string().max(200).optional(),
  studentGender: z.string().max(20).optional(),
  formId: z.string().max(80).optional(),
  formTitle: z.string().max(200).optional(),
});

export const extractExampleBodySchema = z.object({
  fileName: trimmedString(200),
  mimeType: trimmedString(120).optional(),
  contentBase64: z.string().min(1).max(12 * 1024 * 1024),
});

const MAX_SHARED_EXAMPLES = 20;

export const aiFillExamplesScopeKeySchema = trimmedString(200).refine(
  (v) =>
    v === "default" ||
    v.startsWith("institution:") ||
    v.startsWith("code:"),
  { message: "INVALID_SCOPE_KEY" }
);

export const aiFillExamplesWriteSchema = z.object({
  scopeKey: aiFillExamplesScopeKeySchema,
  examples: z.array(z.unknown()).max(MAX_SHARED_EXAMPLES),
});
