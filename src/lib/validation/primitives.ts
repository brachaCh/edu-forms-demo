import { z } from "zod";
import { normalizeEmail } from "@/lib/normalize-email";

/** מייל בסיסי — תואם לבדיקות הקיימות בפרויקט */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const trimmedString = (max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(max));

export const nonEmptyTrimmed = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(min).max(max));

export const optionalTrimmed = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null) return null;
      const t = v.trim();
      return t === "" ? null : t;
    })
    .pipe(z.union([z.string().max(max), z.null()]));

export const emailSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(3)
      .max(200)
      .refine((v) => EMAIL_RE.test(v), { message: "INVALID_EMAIL" })
  );

export const optionalEmailSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null;
    const t = normalizeEmail(v);
    return t === "" ? null : t;
  })
  .pipe(
    z.union([
      z
        .string()
        .max(200)
        .refine((v) => EMAIL_RE.test(v), { message: "INVALID_EMAIL" }),
      z.null(),
    ])
  );

export const idSchema = nonEmptyTrimmed(1, 80);

export const passwordSchema = z.string().min(8).max(200);

/** תאריך ISO YYYY-MM-DD או ריק/null */
export const isoDateSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return t === "" ? null : t;
  })
  .pipe(
    z.union([
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "INVALID_DATE")
        .max(10),
      z.null(),
    ])
  );

export const categorySchema = z.enum([
  "schools",
  "high-schools",
  "kindergartens",
  "tutorials",
]);

export const studentStatusSchema = z.enum([
  "integration",
  "personal-basket",
  "special-ed-class",
  "integration-teacher",
]);

export const institutionTypeSchema = z.enum([
  "schools",
  "high-schools",
  "kindergartens",
]);

export const educationFrameworkSchema = z.enum(["regular", "special"]);
