import { z } from "zod";
import { PROBLEM_REPORT_STATUS_VALUES } from "@/lib/problem-report/status-label";
import {
  categorySchema,
  emailSchema,
  educationFrameworkSchema,
  institutionTypeSchema,
  nonEmptyTrimmed,
  passwordSchema,
  trimmedString,
} from "./primitives";
import { normalizeEmail } from "@/lib/normalize-email";
import { ASCII_EMAIL_RE } from "./simplesign";
import { OTP_CODE_RE } from "@/lib/login-otp";

export const registerBodySchema = z
  .object({
    full_name: nonEmptyTrimmed(2, 120),
    phone: nonEmptyTrimmed(9, 40),
    email: emailSchema,
    password: passwordSchema,
    institution_code: nonEmptyTrimmed(3, 40),
    institution_name: nonEmptyTrimmed(2, 200),
    school_name: nonEmptyTrimmed(2, 200),
    terms_accepted: z.literal(true),
  })
  .strict();

export const emailOnlyBodySchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const bugReportBodySchema = z
  .object({
    urgency: z.enum(["low", "medium", "high", "critical"]),
    message: nonEmptyTrimmed(1, 4000),
    pageUrl: trimmedString(2000),
    reporterEmail: emailSchema,
    website: z.string().max(200).optional(),
    screenshots: z
      .array(
        z.object({
          filename: trimmedString(120),
          contentType: z.enum([
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ]),
          content: z.string().min(1).max(3_000_000),
        })
      )
      .max(3)
      .optional(),
  })
  .strict();

const screenshotAttachmentSchema = z.object({
  kind: z.literal("screenshot"),
  data: z.string().min(1).max(1_400_000),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

const techlogAttachmentSchema = z.object({
  kind: z.literal("techlog"),
  data: z.string().min(1).max(300_000),
  mime: z.literal("application/json"),
});

const MAX_TOTAL_ATTACHMENT_BYTES = 3_500_000;

export const problemReportBodySchema = z
  .object({
    reporterEmail: emailSchema.optional(),
    description: nonEmptyTrimmed(1, 4000),
    pagePath: trimmedString(300).optional(),
    browser: trimmedString(300).optional(),
    website: z.string().max(200).optional(),
    recordingMime: z.enum(["video/webm", "video/mp4"]).optional(),
    attachments: z
      .array(z.union([screenshotAttachmentSchema, techlogAttachmentSchema]))
      .max(4)
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      const totalSize = (data.attachments ?? []).reduce(
        (sum, att) => sum + att.data.length,
        0
      );
      return totalSize <= MAX_TOTAL_ATTACHMENT_BYTES;
    },
    { message: "סה״כ גודל הקבצים המצורפים חורג מהמותר (3.5MB)" }
  );

export const problemReportStatusBodySchema = z
  .object({
    ticketId: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(/^TZ-\d+$/i, "INVALID_TICKET")),
    status: z.enum(PROBLEM_REPORT_STATUS_VALUES),
  })
  .strict();

export const guestDemoBodySchema = z
  .object({
    email: emailSchema.optional(),
  })
  .strict();

export const otpVerifyBodySchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(OTP_CODE_RE, "INVALID_OTP")),
  })
  .strict();

export const resetPasswordBodySchema = z
  .object({
    token: nonEmptyTrimmed(32, 200),
    password: passwordSchema,
  })
  .strict();

export const institutionSettingsBodySchema = z
  .object({
    institution_code: nonEmptyTrimmed(3, 40),
    institution_name: nonEmptyTrimmed(2, 200),
    school_name: nonEmptyTrimmed(2, 200),
    institution_type: institutionTypeSchema,
    education_framework: educationFrameworkSchema,
    logo_url: z.union([z.string().max(2_000_000), z.null()]).optional(),
  })
  .strict();

export const auditEventBodySchema = z
  .object({
    action: nonEmptyTrimmed(1, 80),
    summary: z.string().max(500).optional(),
    entityType: z.string().max(80).optional(),
    entityId: z.string().max(80).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const selectPlanBodySchema = z
  .object({
    plan_id: nonEmptyTrimmed(1, 80),
    custom_classes: z.coerce.number().int().min(0).optional(),
    custom_students: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const platformSubscriptionPatchSchema = z
  .object({
    action: z.enum(["activate_bank", "cancel", "update_plan", "remove", "extend_expiry"]),
    plan_id: trimmedString(80).optional(),
    custom_classes: z.coerce.number().int().min(0).optional(),
    custom_students: z.coerce.number().int().min(0).optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
  })
  .strict();

export const transferOwnershipBodySchema = z
  .object({
    user_id: z.string().uuid(),
  })
  .strict();

export const teacherInviteAcceptBodySchema = z
  .object({
    token: nonEmptyTrimmed(8, 200),
    password: passwordSchema.optional(),
    phone: trimmedString(40).optional(),
    terms_accepted: z.boolean().optional(),
    existingUserAccept: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.existingUserAccept === true) return;
    if (!val.password || val.password.length < 8) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "WEAK_PASSWORD",
      });
    }
    if (val.terms_accepted !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["terms_accepted"],
        message: "TERMS_REQUIRED",
      });
    }
  });

export const bootstrapBodySchema = z
  .object({
    profile: z.object({
      id: nonEmptyTrimmed(1, 80),
      email: emailSchema,
      full_name: nonEmptyTrimmed(1, 200),
      phone: z.string().max(40).optional(),
      institution_id: z.string().max(80).nullable().optional(),
      institution_code: z.string().max(40).nullable().optional(),
      terms_accepted_at: z.string().max(40).nullable().optional(),
      setup_completed_at: z.string().max(40).nullable().optional(),
      is_admin: z.boolean().optional(),
      created_at: z.string().max(40).optional(),
    }),
  })
  .strict();

export const contactBodySchema = z
  .object({
    name: nonEmptyTrimmed(2, 120),
    email: emailSchema,
    subject: nonEmptyTrimmed(2, 200),
    message: nonEmptyTrimmed(5, 5000),
    website: z.string().max(200).optional(),
    recipient: z
      .enum(["default", "coming-soon", "free-access-signup", "bank-transfer"])
      .optional(),
  })
  .strict();

export const waiverSignatureBodySchema = z.object({
  email: emailSchema,
  formTitle: nonEmptyTrimmed(1, 200),
  studentName: trimmedString(120).optional(),
  snapshotHtml: z.string().min(1).max(700_000),
  formData: z.record(z.string(), z.unknown()).optional(),
  assignments: z
    .array(
      z.object({
        email: z.string().max(200).optional(),
        fieldKey: nonEmptyTrimmed(1, 200),
        fieldLabel: nonEmptyTrimmed(1, 300),
      })
    )
    .max(20)
    .optional(),
});

/** TZ-17: החלפת מוסד פעיל */
export const switchInstitutionBodySchema = z
  .object({
    institution_id: z.string().uuid(),
  })
  .strict();

/** הזמנת מחנכת — PR #73 normalizeEmail + ASCII_EMAIL_RE */
export const inviteEmailStrictSchema = z
  .string()
  .transform((v) => normalizeEmail(v))
  .pipe(
    z
      .string()
      .min(3)
      .max(200)
      .refine((v) => ASCII_EMAIL_RE.test(v), { message: "INVALID_EMAIL" })
  );

export const specialEdHomeroomInviteBodySchema = z
  .object({
    className: nonEmptyTrimmed(1, 80),
    category: categorySchema.optional(),
    teacherName: nonEmptyTrimmed(1, 120),
    email: inviteEmailStrictSchema,
    confirmReassign: z.boolean().optional(),
  })
  .strict();
