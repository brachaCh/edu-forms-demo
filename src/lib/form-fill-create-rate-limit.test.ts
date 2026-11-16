import { describe, expect, it } from "vitest";
import {
  consumeFormFillCreateRateLimit,
  evaluateFormFillCreateRateLimit,
  FORM_FILL_CREATE_USER_LIMIT,
} from "./form-fill-create-rate-limit";
import type { RateLimitQuery } from "./email-rate-limit";

describe("evaluateFormFillCreateRateLimit", () => {
  const now = Date.parse("2026-10-05T12:00:00.000Z");

  it("allows the 6th request in the hour (unlike the shared 5 per 15 minutes)", () => {
    const decision = evaluateFormFillCreateRateLimit({
      now,
      row: {
        window_start: new Date(now).toISOString(),
        hit_count: 5,
      },
      limit: FORM_FILL_CREATE_USER_LIMIT,
    });
    expect(decision).toMatchObject({ action: "allow", hitCount: 6 });
  });

  it("blocks the 61st user request in the same hour", () => {
    const decision = evaluateFormFillCreateRateLimit({
      now,
      row: {
        window_start: new Date(now).toISOString(),
        hit_count: FORM_FILL_CREATE_USER_LIMIT,
      },
      limit: FORM_FILL_CREATE_USER_LIMIT,
    });
    expect(decision.action).toBe("deny");
  });
});

describe("consumeFormFillCreateRateLimit", () => {
  const now = Date.parse("2026-10-05T12:00:00.000Z");

  it("records the 6th successful consume in the window", async () => {
    let stored: { hit_count: number } | null = null;
    const query: RateLimitQuery = {
      read: async () => ({
        row: {
          window_start: new Date(now).toISOString(),
          hit_count: 5,
        },
        errorMessage: null,
      }),
      write: async (row) => {
        stored = { hit_count: row.hit_count };
        return { errorMessage: null };
      },
    };
    expect(
      await consumeFormFillCreateRateLimit(
        query,
        "form-fill-create:user:test",
        FORM_FILL_CREATE_USER_LIMIT,
        now
      )
    ).toEqual({ ok: true });
    expect(stored).toEqual({ hit_count: 6 });
  });
});
