import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appOrigin,
  parentFacingOrigin,
  sumitReturnUrl,
  sumitWebhookUrl,
} from "./app-origin";
import { PRODUCTION_ORIGIN } from "./trusted-origins";

function assignNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

describe("appOrigin", () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  const prevSite = process.env.NEXT_PUBLIC_SITE_URL;
  const prevVercel = process.env.VERCEL_URL;
  const prevProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    if (prevSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevSite;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
    if (prevProd === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProd;
    assignNodeEnv(prevNodeEnv);
    vi.restoreAllMocks();
  });

  it("uses NEXT_PUBLIC_APP_URL even when the request Host is attacker-controlled", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example/";
    const request = new Request("https://evil.example/api/auth/forgot-password", {
      headers: {
        origin: "https://evil.example",
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(appOrigin(request)).toBe("https://app.example");
    expect(sumitReturnUrl(request)).toBe(
      "https://app.example/api/billing/sumit/return"
    );
    expect(sumitWebhookUrl(request)).toBe(
      "https://app.example/api/billing/sumit/webhook"
    );
  });

  it("does not fail closed in production without a configured origin", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    assignNodeEnv("production");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const request = new Request("https://evil.example/reset", {
      headers: {
        origin: "https://evil.example",
        host: "evil.example",
      },
    });
    expect(appOrigin(request)).toBe(PRODUCTION_ORIGIN);
    expect(appOrigin(request)).toBe("https://demo.example.com");
    expect(warn).toHaveBeenCalled();
  });

  it("derives from a trusted production Host when env is missing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    assignNodeEnv("production");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const request = new Request("https://demo.example.com/api/x", {
      headers: {
        host: "demo.example.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(appOrigin(request)).toBe(PRODUCTION_ORIGIN);
  });

  it("prefers VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL when the request host is untrusted", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    assignNodeEnv("production");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "demo.example.com";
    process.env.VERCEL_URL = "demo-app-abc123.vercel.app";
    const request = new Request("https://evil.example/reset", {
      headers: { host: "evil.example" },
    });
    expect(appOrigin(request)).toBe("https://demo.example.com");
  });

  it("derives from a preview Host so preview deployments keep working", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    assignNodeEnv("production");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const request = new Request(
      "https://demo-app-git-feat-demo-projects.vercel.app/api/x",
      {
        headers: {
          host: "demo-app-git-feat-demo-projects.vercel.app",
          "x-forwarded-proto": "https",
        },
      }
    );
    expect(appOrigin(request)).toBe(
      "https://demo-app-git-feat-demo-projects.vercel.app"
    );
  });

  it("rewrites a Vercel SSO host so parent signing emails stay on the public domain", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://demo-app.vercel.app";
    const request = new Request("https://demo-app.vercel.app/api/signature/create", {
      headers: { host: "demo-app.vercel.app" },
    });
    expect(appOrigin(request)).toBe("https://demo-app.vercel.app");
    expect(parentFacingOrigin(request)).toBe(PRODUCTION_ORIGIN);
  });

  it("keeps a custom public origin for parent-facing links", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://demo.example.com";
    expect(parentFacingOrigin()).toBe("https://demo.example.com");
  });

  it("falls back to the request only for localhost outside production", () => {
    assignNodeEnv("test");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const request = new Request("http://localhost:3000/api/x", {
      headers: { host: "localhost:3000", "x-forwarded-proto": "http" },
    });
    expect(appOrigin(request)).toBe("http://localhost:3000");
  });
});
