import { z } from "zod";

export const hoursPoolSchema = z.enum(["management", "programming", "extra"]);

const hoursPasswordSchema = z.string().min(1).max(200);

/** שעות — עד 4 ספרות ורבע שעה, מונע ערכים אבסורדיים */
const hoursAmountSchema = z.number().finite().positive().max(10_000);

const hoursTotalSchema = z.number().finite().min(0).max(10_000);

export const hoursRequestSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("verify"),
    password: hoursPasswordSchema,
  }),
  z.object({
    op: z.literal("deduct"),
    password: hoursPasswordSchema,
    pool: hoursPoolSchema,
    amount: hoursAmountSchema,
  }),
  z.object({
    op: z.literal("add"),
    password: hoursPasswordSchema,
    pool: hoursPoolSchema,
    amount: hoursAmountSchema,
  }),
  z.object({
    op: z.literal("updateTotals"),
    password: hoursPasswordSchema,
    management_total: hoursTotalSchema,
    programming_total: hoursTotalSchema,
    extra_total: hoursTotalSchema,
  }),
  z.object({
    op: z.literal("reset"),
    password: hoursPasswordSchema,
  }),
]);

export type HoursRequest = z.infer<typeof hoursRequestSchema>;
