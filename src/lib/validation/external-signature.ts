import { z } from "zod";
import { emailSchema } from "./primitives";

export const externalSignatureCreateBodySchema = z
  .object({
    studentId: z.string().uuid(),
    documentId: z.string().uuid(),
    documentName: z.string().trim().min(1).max(300),
    recipientEmail: emailSchema,
    signerLabel: z.string().trim().min(1).max(100).default("הורה"),
  })
  .strict();

export const externalSignatureResendBodySchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict();

export const externalSignatureTokenBodySchema = z
  .object({
    token: z.string().min(40).max(100),
  })
  .strict();

export const externalSignatureOtpVerifyBodySchema = z
  .object({
    token: z.string().min(40).max(100),
    code: z.string().length(6),
  })
  .strict();

export const externalSignaturePublicBodySchema = z
  .object({
    action: z.enum(["get"]),
    token: z.string().min(40).max(100),
  })
  .strict();

export const externalSignatureSignBodySchema = z
  .object({
    token: z.string().min(40).max(100),
    signatureData: z.string().min(1).max(1_000_000),
  })
  .strict();
