import { z } from "zod";
import { isDataUrl } from "@/lib/data-url";
import { isStudentDocumentStorageRef } from "@/lib/student-document-storage-ref";
import {
  MAX_SAFE_UPLOAD_BODY_CHARS,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-guard";
import {
  categorySchema,
  idSchema,
  isoDateSchema,
  nonEmptyTrimmed,
  optionalEmailSchema,
  optionalTrimmed,
  studentStatusSchema,
  trimmedString,
} from "./primitives";

const studentGenderSchema = z
  .union([z.enum(["ז", "נ"]), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v == null ? null : v));

const familyStatusSchema = z
  .union([
    z.enum(["נשואים", "פרודים", "גרושים"]),
    z.literal(""),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => (v === "" || v == null ? null : v));

const integrationFrequencySchema = z
  .union([z.enum(["high", "low"]), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v == null ? null : v));

const formFillStatusSchema = z.enum(["draft", "saved", "completed"]);

const MAX_FORM_FILL_KEYS = 400;
const MAX_FORM_FILL_VALUE = 20_000;
const MAX_NOTES = 20_000;
const MAX_DATA_URL = MAX_SAFE_UPLOAD_BODY_CHARS;

const nullStr = (max: number) => optionalTrimmed(max).default(null);

export const studentWriteSchema = z.object({
  category: categorySchema,
  full_name: nonEmptyTrimmed(1, 200),
  phone: nullStr(40),
  father_name: nullStr(120),
  mother_name: nullStr(120),
  status: studentStatusSchema.nullable().default(null),
  class_name: nullStr(80),
  teacher_name: nullStr(120),
  notes: nullStr(MAX_NOTES),
  id_number: nullStr(20),
  birth_date: isoDateSchema.default(null),
  gender: studentGenderSchema.default(null),
  home_address: nullStr(200),
  city: nullStr(100),
  father_mobile: nullStr(40),
  mother_mobile: nullStr(40),
  email: optionalEmailSchema.default(null),
  father_email: optionalEmailSchema.optional(),
  mother_email: optionalEmailSchema.optional(),
  role: nullStr(120),
  characterization: nullStr(MAX_NOTES),
  family_status: familyStatusSchema.default(null),
  integration_start_date: isoDateSchema.default(null),
  eligibility_committee_date: isoDateSchema.default(null),
  homeroom_teacher: nullStr(120),
  education_support: nullStr(120),
  additional_treatments: nullStr(MAX_NOTES),
  integration_frequency: integrationFrequencySchema.default(null),
  calendar_year: z
    .number()
    .int()
    .min(5700)
    .max(6000)
    .nullable()
    .optional()
    .default(null),
  institution_id: z.string().max(80).nullable().optional(),
  user_profile_id: z.string().max(80).nullable().optional(),
  single_responsible_party: z.boolean().nullable().optional(),
});

/** תיקון חלקי — רק שדות שנשלחו */
export const studentPatchSchema = z.object({
  category: categorySchema.optional(),
  full_name: nonEmptyTrimmed(1, 200).optional(),
  phone: optionalTrimmed(40).optional(),
  father_name: optionalTrimmed(120).optional(),
  mother_name: optionalTrimmed(120).optional(),
  status: studentStatusSchema.nullable().optional(),
  class_name: optionalTrimmed(80).optional(),
  teacher_name: optionalTrimmed(120).optional(),
  notes: optionalTrimmed(MAX_NOTES).optional(),
  id_number: optionalTrimmed(20).optional(),
  birth_date: isoDateSchema.optional(),
  gender: studentGenderSchema.optional(),
  home_address: optionalTrimmed(200).optional(),
  city: optionalTrimmed(100).optional(),
  father_mobile: optionalTrimmed(40).optional(),
  mother_mobile: optionalTrimmed(40).optional(),
  email: optionalEmailSchema.optional(),
  father_email: optionalEmailSchema.optional(),
  mother_email: optionalEmailSchema.optional(),
  role: optionalTrimmed(120).optional(),
  characterization: optionalTrimmed(MAX_NOTES).optional(),
  family_status: familyStatusSchema.optional(),
  integration_start_date: isoDateSchema.optional(),
  eligibility_committee_date: isoDateSchema.optional(),
  homeroom_teacher: optionalTrimmed(120).optional(),
  education_support: optionalTrimmed(120).optional(),
  additional_treatments: optionalTrimmed(MAX_NOTES).optional(),
  integration_frequency: integrationFrequencySchema.optional(),
  calendar_year: z.number().int().min(5700).max(6000).nullable().optional(),
  archived_at: z.string().max(40).nullable().optional(),
  user_profile_id: z.string().max(80).nullable().optional(),
  single_responsible_party: z.boolean().nullable().optional(),
});

export const studentDocumentSchema = z.object({
  student_id: idSchema,
  name: nonEmptyTrimmed(1, 260),
  mime_type: trimmedString(120),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  data_url: z
    .string()
    .min(1)
    .max(MAX_DATA_URL)
    .refine((value) => isDataUrl(value) || isStudentDocumentStorageRef(value), {
      message: "INVALID_FILE_PAYLOAD",
    }),
  folder: trimmedString(120),
  archived_at: z.string().max(40).nullable().optional(),
  calendar_year: z.number().int().min(5700).max(6000).nullable().optional(),
  is_paper_waiver: z.boolean().optional(),
});

export const studentDocumentPatchSchema = z.object({
  folder: trimmedString(120).optional(),
  archived_at: z.string().max(40).nullable().optional(),
  name: nonEmptyTrimmed(1, 260).optional(),
  calendar_year: z.number().int().min(5700).max(6000).nullable().optional(),
});

export const customFieldSchema = z.object({
  student_id: idSchema,
  label: nonEmptyTrimmed(1, 200),
  value: z.string().max(MAX_NOTES).default(""),
});

export const customFieldPatchSchema = z.object({
  label: nonEmptyTrimmed(1, 200).optional(),
  value: z.string().max(MAX_NOTES).optional(),
});

const formFillValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .transform((v) => (v == null ? "" : String(v)))
  .pipe(z.string().max(MAX_FORM_FILL_VALUE));

const formFillDataSchema = z
  .record(z.string().max(200), formFillValueSchema)
  .refine((obj) => Object.keys(obj).length <= MAX_FORM_FILL_KEYS, {
    message: "TOO_MANY_FORM_KEYS",
  });

export const formFillUpsertSchema = z.object({
  id: idSchema.optional(),
  createNew: z.boolean().optional(),
  student_id: idSchema,
  form_id: nonEmptyTrimmed(1, 80),
  data: formFillDataSchema,
  status: formFillStatusSchema.optional(),
  document_id: z.string().max(80).nullable().optional(),
});

const optionalPatch = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v == null ? {} : v), schema);

export const tenantRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("fetchStudents") }),
  z.object({
    op: z.literal("fetchInstitutionStaffForPicker"),
    category: categorySchema.optional(),
  }),
  z.object({
    op: z.literal("fetchInstitutionStaffForFill"),
    category: categorySchema.optional(),
  }),
  z.object({
    op: z.literal("insertStudent"),
    student: studentWriteSchema,
  }),
  z.object({
    op: z.literal("patchStudent"),
    id: idSchema,
    patch: optionalPatch(studentPatchSchema),
  }),
  z.object({
    op: z.literal("removeStudent"),
    id: idSchema,
  }),
  z.object({
    op: z.literal("fetchStudentDocuments"),
    studentId: idSchema,
    includeData: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("fetchStudentDocumentData"),
    id: idSchema,
  }),
  z.object({
    op: z.literal("insertStudentDocument"),
    doc: studentDocumentSchema,
  }),
  z.object({
    op: z.literal("upsertPaperWaiverScan"),
    doc: studentDocumentSchema,
  }),
  z.object({
    op: z.literal("removePaperWaiverScan"),
    studentId: idSchema,
  }),
  z.object({
    op: z.literal("archivePaperWaiverScan"),
    studentId: idSchema,
  }),
  z.object({
    op: z.literal("insertStudentFormArchiveSnapshot"),
    doc: studentDocumentSchema,
  }),
  z.object({
    op: z.literal("removeStudentDocument"),
    id: idSchema,
  }),
  z.object({
    op: z.literal("updateStudentDocument"),
    id: idSchema,
    patch: optionalPatch(studentDocumentPatchSchema),
  }),
  z.object({
    op: z.literal("fetchStudentCustomFields"),
    studentId: idSchema,
  }),
  z.object({
    op: z.literal("insertStudentCustomField"),
    field: customFieldSchema,
  }),
  z.object({
    op: z.literal("patchStudentCustomField"),
    id: idSchema,
    patch: optionalPatch(customFieldPatchSchema),
  }),
  z.object({
    op: z.literal("removeStudentCustomField"),
    id: idSchema,
  }),
  z.object({
    op: z.literal("fetchStudentFormFill"),
    studentId: idSchema,
    formId: nonEmptyTrimmed(1, 80),
    /** ריענון רקע (polling) — לא נרשם שוב ללוג הגישה */
    quiet: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("fetchStudentFormFills"),
    studentId: idSchema,
    quiet: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("fetchStudentFormFillById"),
    studentId: idSchema,
    fillId: idSchema,
    quiet: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("upsertStudentFormFill"),
    input: formFillUpsertSchema,
  }),
  z.object({
    op: z.literal("removeStudentFormFill"),
    id: idSchema,
  }),
  z.object({
    op: z.literal("fetchInstitutionById"),
    id: idSchema,
  }),
]);

export type TenantRequest = z.infer<typeof tenantRequestSchema>;
