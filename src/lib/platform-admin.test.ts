import { afterEach, describe, expect, it } from "vitest";
import { isPlatformAdminEmail } from "./platform-admin";

describe("isPlatformAdminEmail", () => {
  const original = process.env.PLATFORM_ADMIN_EMAILS;

  afterEach(() => {
    if (original === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = original;
  });

  it("denies is_admin user without allowlisted email", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "demo@example.com";
    expect(isPlatformAdminEmail("admin-flag@example.com")).toBe(false);
  });

  it("rejects regular users", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "demo@example.com";
    expect(isPlatformAdminEmail("user@example.com")).toBe(false);
  });

  it("allows email on PLATFORM_ADMIN_EMAILS", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "demo@example.com";
    expect(isPlatformAdminEmail("demo@example.com")).toBe(true);
  });
});
