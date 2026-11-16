import { afterEach, describe, expect, it } from "vitest";
import {
  PRODUCTION_ORIGIN,
  configuredPublicOrigin,
  isThisProjectVercelHost,
  isTrustedAppHost,
  isTrustedAppOrigin,
  vercelDeploymentOrigin,
} from "./trusted-origins";

function assignNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

describe("trusted origins", () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  const prevSite = process.env.NEXT_PUBLIC_SITE_URL;
  const prevAllowed = process.env.ALLOWED_ORIGINS;
  const prevVercel = process.env.VERCEL_URL;
  const prevProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
    if (prevSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevSite;
    if (prevAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = prevAllowed;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
    if (prevProd === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProd;
    assignNodeEnv(prevNodeEnv);
  });

  it("always trusts the live production domain when ALLOWED_ORIGINS is unset", () => {
    assignNodeEnv("production");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.ALLOWED_ORIGINS;
    expect(isTrustedAppHost("demo.example.com")).toBe(true);
    expect(isTrustedAppOrigin("https://demo.example.com")).toBe(true);
    expect(isTrustedAppOrigin(PRODUCTION_ORIGIN)).toBe(true);
    expect(PRODUCTION_ORIGIN).toBe("https://demo.example.com");
    expect(configuredPublicOrigin()).toBeNull();
  });

  it("does not trust the misspelled protokol host", () => {
    delete process.env.ALLOWED_ORIGINS;
    expect(isTrustedAppHost("protokol.sh-k.co.il")).toBe(false);
    expect(isTrustedAppOrigin("https://protokol.sh-k.co.il")).toBe(false);
  });

  it("trusts this project's Vercel preview aliases, not other team vercel.app hosts", () => {
    expect(
      isThisProjectVercelHost(
        "demo-app-git-feat-demo-projects.vercel.app"
      )
    ).toBe(true);
    expect(isThisProjectVercelHost("demo-app.vercel.app")).toBe(true);
    expect(
      isThisProjectVercelHost(
        "other-demo-5-git-feat-demo-projects.vercel.app"
      )
    ).toBe(false);
    expect(isTrustedAppOrigin("https://attacker.vercel.app")).toBe(false);
    expect(isTrustedAppHost("attacker.vercel.app")).toBe(false);
  });

  it("trusts the current VERCEL_URL host", () => {
    process.env.VERCEL_URL = "demo-app-abc123.vercel.app";
    expect(isTrustedAppHost("demo-app-abc123.vercel.app")).toBe(true);
    expect(
      isTrustedAppOrigin("https://demo-app-abc123.vercel.app")
    ).toBe(true);
  });

  it("prefers VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL when minting a fallback origin", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "demo.example.com";
    process.env.VERCEL_URL = "demo-app-abc123.vercel.app";
    expect(vercelDeploymentOrigin()).toBe("https://demo.example.com");
  });

  it("does not trust attacker hosts even in production without env", () => {
    assignNodeEnv("production");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.ALLOWED_ORIGINS;
    expect(isTrustedAppHost("evil.example")).toBe(false);
    expect(isTrustedAppOrigin("https://evil.example")).toBe(false);
  });
});
