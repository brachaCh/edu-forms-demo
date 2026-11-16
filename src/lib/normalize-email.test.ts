import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/normalize-email";

describe("normalizeEmail", () => {
  it("trims, strips whitespace, and lowercases", () => {
    expect(normalizeEmail("  Dad@Example.com  ")).toBe("dad@example.com");
    expect(normalizeEmail("mom @ example.com")).toBe("mom@example.com");
  });

  it("strips zero-width and BOM characters", () => {
    expect(normalizeEmail("mom\u200B@example.com")).toBe("mom@example.com");
    expect(normalizeEmail("\uFEFFdad@example.com")).toBe("dad@example.com");
  });

  it("strips bidi / isolate marks that Resend rejects", () => {
    expect(normalizeEmail("\u202Emom@example.com\u202C")).toBe(
      "mom@example.com"
    );
    expect(normalizeEmail("\u2066dad@example.com\u2069")).toBe(
      "dad@example.com"
    );
    expect(normalizeEmail("mom@example.com\u200F")).toBe("mom@example.com");
  });
});
