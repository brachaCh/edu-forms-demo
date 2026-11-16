import { afterEach, describe, expect, it, vi } from "vitest";
import { cronAuthorized } from "./cron-auth";

describe("cronAuthorized", () => {
  const prevSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (prevSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = prevSecret;
    }
    vi.restoreAllMocks();
  });

  it("rejects when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/api/cron/purge-expired-archive", {
      headers: { Authorization: "Bearer any-token" },
    });

    expect(cronAuthorized(request)).toBe(false);
  });

  it("rejects a wrong Bearer secret", () => {
    process.env.CRON_SECRET = "expected-cron-secret";
    vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/api/cron/purge-expired-archive", {
      headers: { Authorization: "Bearer wrong-cron-secret" },
    });

    expect(cronAuthorized(request)).toBe(false);
  });

  it("accepts a matching Bearer secret", () => {
    process.env.CRON_SECRET = "expected-cron-secret";

    const request = new Request("http://localhost/api/cron/purge-expired-archive", {
      headers: { Authorization: "Bearer expected-cron-secret" },
    });

    expect(cronAuthorized(request)).toBe(true);
  });
});
