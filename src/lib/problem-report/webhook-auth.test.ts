import { afterEach, describe, expect, it, vi } from "vitest";
import { problemReportStatusAuthorized } from "./webhook-auth";

describe("problemReportStatusAuthorized", () => {
  const prev = process.env.TZAVTA_STATUS_WEBHOOK_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.TZAVTA_STATUS_WEBHOOK_SECRET;
    else process.env.TZAVTA_STATUS_WEBHOOK_SECRET = prev;
    vi.restoreAllMocks();
  });

  it("rejects when the secret is missing", () => {
    delete process.env.TZAVTA_STATUS_WEBHOOK_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new Request("http://localhost/api/problem-report/status", {
      headers: { Authorization: "Bearer any" },
    });
    expect(problemReportStatusAuthorized(request)).toBe(false);
  });

  it("rejects a wrong bearer token", () => {
    process.env.TZAVTA_STATUS_WEBHOOK_SECRET = "expected-secret";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new Request("http://localhost/api/problem-report/status", {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    expect(problemReportStatusAuthorized(request)).toBe(false);
  });

  it("accepts a matching bearer token", () => {
    process.env.TZAVTA_STATUS_WEBHOOK_SECRET = "expected-secret";
    const request = new Request("http://localhost/api/problem-report/status", {
      headers: { Authorization: "Bearer expected-secret" },
    });
    expect(problemReportStatusAuthorized(request)).toBe(true);
  });
});
