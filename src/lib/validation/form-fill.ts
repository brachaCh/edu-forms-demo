import { z } from "zod";
import { FILL_FIELD_KEY_RE } from "@/lib/form-fill-public-data";
import { FORM_FILL_TOKEN_RE } from "@/lib/form-fill-otp";
import { OTP_CODE_RE } from "@/lib/login-otp";
import { emailSchema } from "./primitives";

export const formFillTokenBodySchema = z
  .object({
    token: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(FORM_FILL_TOKEN_RE)),
  })
  .strict();

export const formFillOtpVerifyBodySchema = z
  .object({
    token: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(FORM_FILL_TOKEN_RE)),
    code: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(OTP_CODE_RE, "INVALID_OTP")),
  })
  .strict();

export const formFillPublicBodySchema = z
  .object({
    action: z.enum(["get", "submit"]),
    token: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(FORM_FILL_TOKEN_RE)),
    data: z.record(z.string().regex(FILL_FIELD_KEY_RE), z.string()).optional(),
    complete: z.boolean().optional(),
  })
  .strict();

export const signaturePublicBodySchema = z
  .object({
    action: z.enum(["get", "submit"]),
    token: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(FORM_FILL_TOKEN_RE)),
    signature: z.string().max(1_000_000).optional(),
    companionIdValue: z.string().max(40).optional(),
  })
  .strict();

/** גוף הבקשה ליצירת קישורי חתימה במתוה (/api/signature/create) — רק לצוות מחובר */
export const signatureCreateBodySchema = z
  .object({
    formFillId: z.string().uuid(),
    formTitle: z.string().trim().min(1).max(200),
    studentName: z.string().trim().max(120).default(""),
    snapshotHtml: z.string().min(1).max(700_000),
    assignments: z
      .array(
        z
          .object({
            email: z
              .string()
              .trim()
              .toLowerCase()
              .email()
              .max(200),
            fieldKey: z.string().trim().min(1).max(200),
            fieldLabel: z.string().trim().min(1).max(300),
          })
          .strict()
      )
      .min(1)
      .max(10),
  })
  .strict();

export const archiveSignedBodySchema = z
  .object({
    formFillId: z.string().uuid(),
  })
  .strict();

/**
 * גוף הבקשה למילוי AI בדף הקישור הציבורי (/api/fill/ai).
 * formId / הקשר תלמיד / דוגמאות מוסד — לא מתקבלים מהלקוח.
 */
export const formFillAiBodySchema = z
  .object({
    token: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(FORM_FILL_TOKEN_RE)),
    teacherNotes: z.string().max(2000).optional(),
    fields: z
      .array(
        z
          .object({
            key: z.string().max(200).optional(),
            currentValue: z.string().max(4000).optional(),
          })
          .strict()
      )
      .max(250)
      .optional(),
    refine: z.boolean().optional(),
  })
  .strict();

/** גוף הבקשה ליצירת קישור מילוי (/api/fill/create) — רק לצוות מחובר */
export const formFillCreateBodySchema = z
  .object({
    formFillId: z.string().uuid(),
    formId: z.string().trim().min(1).max(80),
    formTitle: z.string().trim().min(1).max(200),
    studentName: z.string().trim().max(120).default(""),
    recipientEmail: emailSchema,
    note: z.string().trim().max(1500).optional(),
  })
  .strict();

export const formParentSendStatusBodySchema = z
  .object({
    formId: z.string().trim().min(1).max(80),
    studentIds: z.array(z.string().uuid()).min(1).max(500),
  })
  .strict();

export const parentFormBulkSendBodySchema = z
  .object({
    formId: z.string().trim().min(1).max(80),
    studentIds: z.array(z.string().uuid()).min(1).max(200),
    skipAlreadySent: z.boolean().default(true),
    skipAlreadyFilled: z.boolean().default(true),
    note: z.string().trim().max(1500).optional(),
  })
  .strict();
