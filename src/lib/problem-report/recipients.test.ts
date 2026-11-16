import { describe, expect, it } from "vitest";
import { parseProblemReportNotifyEmails } from "./recipients";

describe("parseProblemReportNotifyEmails", () => {
  it("prefers PROBLEM_REPORT_NOTIFY_EMAILS", () => {
    expect(
      parseProblemReportNotifyEmails({
        PROBLEM_REPORT_NOTIFY_EMAILS: "demo@example.com, extra@example.com",
        PLATFORM_ADMIN_EMAILS: "admin@example.com",
      })
    ).toEqual(["demo@example.com", "extra@example.com"]);
  });

  it("keeps an explicit PROBLEM_REPORT_NOTIFY_EMAILS override", () => {
    expect(
      parseProblemReportNotifyEmails({
        PROBLEM_REPORT_NOTIFY_EMAILS: "demo@example.com",
      })
    ).toEqual(["demo@example.com"]);
  });

  it("falls back to Protokal and Nechama, not PLATFORM_ADMIN_EMAILS", () => {
    expect(
      parseProblemReportNotifyEmails({
        PLATFORM_ADMIN_EMAILS: "demo@example.com,demo@example.com",
      })
    ).toEqual(["demo@example.com", "demo@example.com"]);
  });
});
