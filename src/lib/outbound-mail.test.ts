import { afterEach, describe, expect, it } from "vitest";
import { assertAllowedAppOrigin } from "./app-request-origin";
import {
  prepareBugReportScreenshots,
  sanitizeScreenshotFilename,
} from "./bug-report-screenshots";
import {
  consumeEmailRateLimit,
  evaluateEmailRateLimit,
  type RateLimitQuery,
} from "./email-rate-limit";
import { resolveResendFrom } from "./resend-from";

describe("resolveResendFrom", () => {
  const prevForce = process.env.RESEND_FORCE_TEST_FROM;
  const prevFrom = process.env.RESEND_FROM_EMAIL;

  afterEach(() => {
    if (prevForce === undefined) delete process.env.RESEND_FORCE_TEST_FROM;
    else process.env.RESEND_FORCE_TEST_FROM = prevForce;
    if (prevFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = prevFrom;
  });

  it("uses an ASCII display name", () => {
    delete process.env.RESEND_FORCE_TEST_FROM;
    delete process.env.RESEND_FROM_EMAIL;
    expect(resolveResendFrom()).toBe("Protokal <noreply@example.com>");
    expect(resolveResendFrom()).not.toMatch(/[^\x00-\x7F]/);
  });

  it("strips a non-ASCII display name from RESEND_FROM_EMAIL", () => {
    delete process.env.RESEND_FORCE_TEST_FROM;
    process.env.RESEND_FROM_EMAIL = "פרוטוקל <noreply@example.com>";
    expect(resolveResendFrom()).toBe("Protokal <noreply@example.com>");
  });

  it("uses the Resend test sender when forced", () => {
    process.env.RESEND_FORCE_TEST_FROM = "true";
    expect(resolveResendFrom()).toBe("Protokal <onboarding@resend.dev>");
  });
});

function assignNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

describe("assertAllowedAppOrigin", () => {
  const prevAllowed = process.env.ALLOWED_ORIGINS;
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.ALLOWED_ORIGINS = prevAllowed;
    process.env.NEXT_PUBLIC_APP_URL = prevApp;
    assignNodeEnv(prevNodeEnv);
  });

  it("allows the configured app origin and a matching referer", () => {
    process.env.ALLOWED_ORIGINS = "https://app.example";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    const fromOrigin = new Request("https://app.example/api/bug-report", {
      headers: { origin: "https://app.example" },
    });
    const fromReferer = new Request("https://app.example/api/bug-report", {
      headers: { referer: "https://app.example/personal-area" },
    });
    expect(assertAllowedAppOrigin(fromOrigin)).toEqual({ ok: true });
    expect(assertAllowedAppOrigin(fromReferer)).toEqual({ ok: true });
  });

  it("rejects a foreign origin", () => {
    process.env.ALLOWED_ORIGINS = "https://app.example";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    const request = new Request("https://app.example/api/bug-report", {
      headers: { origin: "https://evil.example" },
    });
    expect(assertAllowedAppOrigin(request)).toEqual({ ok: false });
  });

  it("rejects a foreign origin in production when no origins are configured", () => {
    assignNodeEnv("production");
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const request = new Request("https://app.example/api/bug-report", {
      headers: { origin: "https://app.example" },
    });
    expect(assertAllowedAppOrigin(request)).toEqual({ ok: false });
  });

  it("still allows the production domain when env origins are missing", () => {
    assignNodeEnv("production");
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const request = new Request("https://demo.example.com/api/bug-report", {
      headers: { origin: "https://demo.example.com" },
    });
    expect(assertAllowedAppOrigin(request)).toEqual({ ok: true });
  });
});

describe("prepareBugReportScreenshots", () => {
  it("accepts base64 and sanitizes the filename", () => {
    const prepared = prepareBugReportScreenshots([
      {
        filename: "../../shot.png",
        contentType: "image/png",
        content: "YQ==",
      },
    ]);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.attachments[0]?.filename).toBe("..-..-shot.png");
    expect(prepared.attachments[0]?.filename).not.toMatch(/[\\/]/);
    expect(prepared.attachments[0]?.content).toBe("YQ==");
  });

  it("rejects content that is not base64", () => {
    expect(
      prepareBugReportScreenshots([
        { filename: "a.png", contentType: "image/png", content: "<html>" },
      ]).ok
    ).toBe(false);
  });

  it("rejects a screenshot over 2MB", () => {
    const content = "A".repeat(2_800_000);
    expect(
      prepareBugReportScreenshots([
        { filename: "a.png", contentType: "image/png", content },
      ]).ok
    ).toBe(false);
  });

  it("adds an extension when the filename has none", () => {
    expect(sanitizeScreenshotFilename("shot", "image/jpeg")).toBe("shot.jpg");
  });
});

describe("email rate limit", () => {
  const now = Date.parse("2026-10-05T12:00:00.000Z");

  it("allows the fifth hit in the window and blocks the sixth", () => {
    const first = evaluateEmailRateLimit({ now, row: null });
    expect(first).toMatchObject({ action: "allow", hitCount: 1 });
    const blocked = evaluateEmailRateLimit({
      now,
      row: { window_start: new Date(now).toISOString(), hit_count: 5 },
    });
    expect(blocked.action).toBe("deny");
  });

  it("fails closed without a query, on read errors, and on write errors", async () => {
    expect(await consumeEmailRateLimit(null, "bug-report:ip", now)).toEqual({
      ok: false,
      reason: "unavailable",
    });

    const readError: RateLimitQuery = {
      read: async () => ({ row: null, errorMessage: "db down" }),
      write: async () => ({ errorMessage: null }),
    };
    expect(await consumeEmailRateLimit(readError, "bug-report:ip", now)).toEqual({
      ok: false,
      reason: "unavailable",
    });

    const writeError: RateLimitQuery = {
      read: async () => ({ row: null, errorMessage: null }),
      write: async () => ({ errorMessage: "write failed" }),
    };
    expect(await consumeEmailRateLimit(writeError, "bug-report:ip", now)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("counts a successful consume", async () => {
    let stored: { hit_count: number } | null = null;
    const query: RateLimitQuery = {
      read: async () => ({ row: null, errorMessage: null }),
      write: async (row) => {
        stored = { hit_count: row.hit_count };
        return { errorMessage: null };
      },
    };
    expect(await consumeEmailRateLimit(query, "guest-demo:ip", now)).toEqual({
      ok: true,
    });
    expect(stored).toEqual({ hit_count: 1 });
  });
});
