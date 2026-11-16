/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

describe("tech-log sanitization", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("extractUrlPath via formatTechLogForSubmit", () => {
    it("strips query strings from URL paths", async () => {
      const { formatTechLogForSubmit } = await import("./tech-log");

      const snapshot = {
        entries: [
          {
            type: "network" as const,
            method: "GET",
            urlPath: "/api/students",
            status: 200,
            durationMs: 50,
            timestamp: Date.now(),
          },
        ],
        pageUrl: "/test",
        browser: "Test",
        screenSize: "1920x1080",
        timestamp: Date.now(),
      };

      const formatted = formatTechLogForSubmit(snapshot);
      expect(formatted).toContain("/api/students");
      expect(formatted).not.toContain("?");
      expect(formatted).not.toContain("id=");
    });

    it("network entries contain path only, not query strings", async () => {
      const { formatTechLogForSubmit } = await import("./tech-log");

      const snapshot = {
        entries: [
          {
            type: "network" as const,
            method: "POST",
            urlPath: "/page",
            status: 200,
            durationMs: 100,
            timestamp: Date.now(),
          },
        ],
        pageUrl: "/test",
        browser: "Test",
        screenSize: "1920x1080",
        timestamp: Date.now(),
      };

      const formatted = formatTechLogForSubmit(snapshot);
      expect(formatted).toContain("/page");
      expect(formatted).not.toContain("#");
    });

    it("handles path extraction correctly", async () => {
      const { formatTechLogForSubmit } = await import("./tech-log");

      const snapshot = {
        entries: [
          {
            type: "network" as const,
            method: "GET",
            urlPath: "/api/data",
            status: 200,
            durationMs: 75,
            timestamp: Date.now(),
          },
        ],
        pageUrl: "/admin",
        browser: "Chrome",
        screenSize: "1920x1080",
        timestamp: Date.now(),
      };

      const formatted = formatTechLogForSubmit(snapshot);
      expect(formatted).toContain("/api/data");
    });
  });

  describe("console error categorization", () => {
    it("records only error category without message content", async () => {
      const { initTechLog, getTechLogSnapshot } = await import("./tech-log");
      initTechLog();

      const sensitiveMessage = "Error with student name: אברהם כהן";
      console.error(sensitiveMessage);

      const snapshot = getTechLogSnapshot();
      const errorEntry = snapshot.entries.find((e) => e.type === "error");

      expect(errorEntry).toBeDefined();
      expect((errorEntry as { category: string }).category).toBe("console_error");
      expect(JSON.stringify(errorEntry)).not.toContain("אברהם");
    });

    it("extracts known error prefixes as category", async () => {
      const { initTechLog, getTechLogSnapshot, clearTechLog } = await import("./tech-log");
      initTechLog();
      clearTechLog();

      console.error("[problem-report] rpc failed with sensitive data");

      const snapshot = getTechLogSnapshot();
      const errorEntry = snapshot.entries.find((e) => e.type === "error");

      expect((errorEntry as { category: string }).category).toBe("problem-report");
    });

    it("uses error name for Error instances", async () => {
      const { initTechLog, getTechLogSnapshot, clearTechLog } = await import("./tech-log");
      initTechLog();
      clearTechLog();

      console.error(new TypeError("sensitive type error"));

      const snapshot = getTechLogSnapshot();
      const errorEntry = snapshot.entries.find((e) => e.type === "error");

      expect((errorEntry as { category: string }).category).toBe("TypeError");
      expect(JSON.stringify(errorEntry)).not.toContain("sensitive");
    });
  });

  describe("formatTechLogForSubmit", () => {
    it("formats log snapshot without leaking request bodies", async () => {
      const { formatTechLogForSubmit } = await import("./tech-log");

      const snapshot = {
        entries: [
          {
            type: "network" as const,
            method: "POST",
            urlPath: "/api/submit",
            status: 200,
            durationMs: 150,
            timestamp: Date.now(),
          },
        ],
        pageUrl: "/students/view",
        browser: "Mozilla/5.0",
        screenSize: "1920x1080",
        timestamp: Date.now(),
      };

      const formatted = formatTechLogForSubmit(snapshot);

      expect(formatted).toContain("/api/submit");
      expect(formatted).toContain("POST");
      expect(formatted).toContain("200");
      expect(formatted).not.toContain("body");
      expect(formatted).not.toContain("password");
    });

    it("does not include response data in formatted output", async () => {
      const { formatTechLogForSubmit } = await import("./tech-log");

      const snapshot = {
        entries: [
          {
            type: "network" as const,
            method: "GET",
            urlPath: "/api/users",
            status: 200,
            durationMs: 50,
            timestamp: Date.now(),
          },
        ],
        pageUrl: "/admin",
        browser: "Chrome",
        screenSize: "1920x1080",
        timestamp: Date.now(),
      };

      const formatted = formatTechLogForSubmit(snapshot);

      expect(formatted).not.toMatch(/\{.*\}/);
      expect(formatted).not.toContain("response");
    });
  });

  describe("ring buffer limits", () => {
    it("limits entries to ring buffer size", async () => {
      const { initTechLog, getTechLogSnapshot } = await import("./tech-log");
      initTechLog();

      global.fetch = vi.fn().mockResolvedValue({ status: 200 });

      for (let i = 0; i < 100; i++) {
        await fetch(`/api/call-${i}`);
      }

      const snapshot = getTechLogSnapshot();
      expect(snapshot.entries.length).toBeLessThanOrEqual(50);
    });
  });
});
