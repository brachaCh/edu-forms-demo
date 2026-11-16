import { z } from "zod";
import { nonEmptyTrimmed, optionalTrimmed } from "./primitives";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uuidSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(UUID_RE, "INVALID_ID"));

const optionalUuidSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return t === "" ? null : t;
  })
  .pipe(z.union([z.string().regex(UUID_RE, "INVALID_ID"), z.null()]));

export const createStaffMeetingBodySchema = z
  .object({
    title: nonEmptyTrimmed(2, 200),
    date: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "INVALID_DATE")),
    time: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((v) => {
        if (v == null) return null;
        const t = v.trim();
        return t === "" ? null : t;
      })
      .pipe(
        z.union([
          z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "INVALID_TIME"),
          z.null(),
        ])
      ),
    location: optionalTrimmed(200),
    notes: optionalTrimmed(4000),
    student_id: optionalUuidSchema,
    invitation_subject: nonEmptyTrimmed(2, 200),
    invitation_text: nonEmptyTrimmed(10, 20_000),
    staff_student_ids: z
      .array(uuidSchema)
      .min(1, "NO_INVITEES")
      .max(40, "TOO_MANY_INVITEES"),
  })
  .strict();
