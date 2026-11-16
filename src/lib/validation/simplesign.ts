import { z } from "zod";
import { normalizeEmail } from "@/lib/normalize-email";
import { nonEmptyTrimmed } from "./primitives";

/** Resend rejects non-ASCII addresses — validate the full string after normalize. */
export const ASCII_EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function signerLabelForEmailError(fieldKey: string): string {
  const key = fieldKey.trim().toLowerCase();
  if (key === "father_signature") return "האב";
  if (key === "mother_signature") return "האם";
  if (
    key === "parent1_signature" ||
    key === "parent1_sign" ||
    key.startsWith("parent1_")
  ) {
    return "הורה 1";
  }
  if (
    key === "parent2_signature" ||
    key === "parent2_sign" ||
    key.startsWith("parent2_")
  ) {
    return "הורה 2";
  }
  return "החותם";
}

export function invalidSignerEmailMessage(fieldKey: string): string {
  return `כתובת המייל של ${signerLabelForEmailError(fieldKey)} מכילה תווים לא תקינים`;
}

export const simpleSignAssignmentSchema = z
  .object({
    email: z.string().transform(normalizeEmail),
    fieldKey: nonEmptyTrimmed(1, 120),
    signerName: z.string().trim().max(200).optional(),
  })
  .superRefine((val, ctx) => {
    if (!ASCII_EMAIL_RE.test(val.email) || val.email.length > 200) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: invalidSignerEmailMessage(val.fieldKey),
      });
    }
  });

export const simpleSignCreateBodySchema = z.object({
  formFillId: z.string().uuid(),
  assignments: z.array(simpleSignAssignmentSchema).min(1).max(10),
});

export const simpleSignResendEmailBodySchema = z.object({
  formFillId: z.string().uuid(),
  signatureFieldKey: nonEmptyTrimmed(1, 120),
});
