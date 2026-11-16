import { afterEach, describe, expect, it } from "vitest";
import {
  assertAllowedAppOrigin,
  csrfExemptApiPath,
  shouldEnforceCsrfOrigin,
} from "./app-request-origin";

function assignNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

describe("CSRF origin enforcement", () => {
  const prevAllowed = process.env.ALLOWED_ORIGINS;
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = prevAllowed;
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    assignNodeEnv(prevNodeEnv);
  });

  it("enforces CSRF on mutating /api routes used by the browser", () => {
    expect(
      shouldEnforceCsrfOrigin({ method: "POST", pathname: "/api/tenant/data" })
    ).toBe(true);
    expect(
      shouldEnforceCsrfOrigin({ method: "GET", pathname: "/api/tenant/data" })
    ).toBe(false);
    expect(
      shouldEnforceCsrfOrigin({ method: "POST", pathname: "/personal-area" })
    ).toBe(false);
  });

  it("does not exempt public form-fill or signature links", () => {
    for (const pathname of [
      "/api/fill/create",
      "/api/fill/otp/request",
      "/api/fill/otp/verify",
      "/api/fill/public",
      "/api/fill/ai",
      "/api/signature/create",
      "/api/signature/otp/request",
      "/api/signature/otp/verify",
      "/api/signature/public",
    ]) {
      expect(csrfExemptApiPath(pathname), pathname).toBe(false);
      expect(
        shouldEnforceCsrfOrigin({ method: "POST", pathname }),
        pathname
      ).toBe(true);
    }
  });

  it("exempts inbound webhooks, cron, and the problem-report status webhook", () => {
    expect(csrfExemptApiPath("/api/webhooks/simplesign")).toBe(true);
    expect(csrfExemptApiPath("/api/cron/purge-expired-archive")).toBe(true);
    expect(csrfExemptApiPath("/api/cron/subscription-reminders")).toBe(true);
    expect(csrfExemptApiPath("/api/billing/sumit/webhook")).toBe(true);
    expect(csrfExemptApiPath("/api/problem-report/status")).toBe(true);
    expect(
      shouldEnforceCsrfOrigin({
        method: "POST",
        pathname: "/api/webhooks/simplesign",
      })
    ).toBe(false);
    expect(
      shouldEnforceCsrfOrigin({
        method: "POST",
        pathname: "/api/billing/sumit/webhook",
      })
    ).toBe(false);
    expect(
      shouldEnforceCsrfOrigin({
        method: "POST",
        pathname: "/api/problem-report/status",
      })
    ).toBe(false);
    expect(
      shouldEnforceCsrfOrigin({
        method: "GET",
        pathname: "/api/cron/purge-expired-archive",
      })
    ).toBe(false);
  });

  it("allows the production origin and a matching referer without env", () => {
    assignNodeEnv("production");
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const fromOrigin = new Request("https://demo.example.com/api/fill/public", {
      headers: { origin: "https://demo.example.com" },
    });
    const fromReferer = new Request(
      "https://demo.example.com/api/fill/otp/request",
      { headers: { referer: "https://demo.example.com/fill/abc" } }
    );
    expect(assertAllowedAppOrigin(fromOrigin)).toEqual({ ok: true });
    expect(assertAllowedAppOrigin(fromReferer)).toEqual({ ok: true });
  });

  it("treats Origin null like a missing Origin and falls back to Referer", () => {
    assignNodeEnv("production");
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const fromReferer = new Request(
      "https://demo.example.com/api/fill/public",
      {
        headers: {
          origin: "null",
          referer: "https://demo.example.com/fill/abc",
        },
      }
    );
    expect(assertAllowedAppOrigin(fromReferer)).toEqual({ ok: true });

    const evilReferer = new Request("https://demo.example.com/api/fill/public", {
      headers: {
        origin: "null",
        referer: "https://evil.example/fill/abc",
      },
    });
    expect(assertAllowedAppOrigin(evilReferer)).toEqual({ ok: false });

    const noReferer = new Request("https://demo.example.com/api/fill/public", {
      headers: {
        origin: "null",
        host: "demo.example.com",
      },
    });
    expect(assertAllowedAppOrigin(noReferer)).toEqual({ ok: true });
  });

  it("allows a project preview origin so preview form-fill keeps working", () => {
    assignNodeEnv("production");
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const request = new Request(
      "https://demo-app-git-feat-demo-projects.vercel.app/api/fill/public",
      {
        headers: {
          origin:
            "https://demo-app-git-feat-demo-projects.vercel.app",
        },
      }
    );
    expect(assertAllowedAppOrigin(request)).toEqual({ ok: true });
  });

  it("rejects a foreign origin even when no origins are configured", () => {
    assignNodeEnv("production");
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const request = new Request("https://demo.example.com/api/bug-report", {
      headers: { origin: "https://evil.example" },
    });
    expect(assertAllowedAppOrigin(request)).toEqual({ ok: false });
  });

  it("does not fail closed when Origin is missing in production", () => {
    assignNodeEnv("production");
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const request = new Request(
      "https://demo.example.com/api/problem-report/status",
      { headers: { host: "demo.example.com" } }
    );
    expect(assertAllowedAppOrigin(request)).toEqual({ ok: true });
  });

  it("would reject a SimpleSign Origin if the path were not exempt", () => {
    expect(
      shouldEnforceCsrfOrigin({
        method: "POST",
        pathname: "/api/webhooks/simplesign",
      })
    ).toBe(false);
    const request = new Request("https://demo.example.com/api/webhooks/simplesign", {
      method: "POST",
      headers: { origin: "https://simplesign.co.il" },
    });
    expect(assertAllowedAppOrigin(request)).toEqual({ ok: false });
  });
});
