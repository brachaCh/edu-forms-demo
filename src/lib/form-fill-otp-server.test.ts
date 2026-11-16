import { describe, expect, it } from "vitest";
import { assertFormFillOtpRateLimit } from "./form-fill-otp-server";

function rateLimitClient(opts: {
  read?: { data?: unknown; error?: { message: string } | null };
  writeError?: { message: string } | null;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            opts.read ?? { data: null, error: null },
        }),
      }),
      upsert: async () => ({ error: opts.writeError ?? null }),
    }),
  } as never;
}

describe("assertFormFillOtpRateLimit", () => {
  it("fails open when the table is missing unless failClosed is set", async () => {
    const supabase = rateLimitClient({
      read: {
        data: null,
        error: { message: "relation email_rate_limits does not exist" },
      },
    });
    expect(await assertFormFillOtpRateLimit(supabase, "otp-bucket")).toEqual({
      ok: true,
    });
    expect(
      await assertFormFillOtpRateLimit(supabase, "ai-bucket", {
        failClosed: true,
      })
    ).toEqual({ ok: false, retryAfterSec: 60, unavailable: true });
  });

  it("fails closed on schema-cache errors when failClosed is set", async () => {
    const supabase = rateLimitClient({
      read: {
        data: null,
        error: {
          message: "Could not find the table 'public.email_rate_limits' in the schema cache",
        },
      },
    });
    expect(await assertFormFillOtpRateLimit(supabase, "otp-bucket")).toEqual({
      ok: true,
    });
    expect(
      await assertFormFillOtpRateLimit(supabase, "ai-bucket", {
        limit: 3,
        failClosed: true,
      })
    ).toEqual({ ok: false, retryAfterSec: 60, unavailable: true });
  });

  it("fails closed on other read errors even without failClosed", async () => {
    const supabase = rateLimitClient({
      read: { data: null, error: { message: "connection refused" } },
    });
    expect(await assertFormFillOtpRateLimit(supabase, "otp-bucket")).toEqual({
      ok: false,
      retryAfterSec: 60,
      unavailable: true,
    });
  });
});
