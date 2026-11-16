import { describe, expect, it } from "vitest";
import { normalizeSessionEmail, resolveReporterEmail } from "./session-email";

describe("normalizeSessionEmail", () => {
  it("normalizes a valid account email", () => {
    expect(normalizeSessionEmail("  Teacher@School.IL ")).toBe(
      "teacher@school.il"
    );
  });

  it("rejects missing or invalid values", () => {
    expect(normalizeSessionEmail(null)).toBeNull();
    expect(normalizeSessionEmail("")).toBeNull();
    expect(normalizeSessionEmail("not-an-email")).toBeNull();
  });
});

describe("resolveReporterEmail", () => {
  it("uses the session email when the client omits one", () => {
    expect(
      resolveReporterEmail({ sessionEmail: "teacher@school.il" })
    ).toEqual({ ok: true, email: "teacher@school.il" });
  });

  it("accepts a matching client email", () => {
    expect(
      resolveReporterEmail({
        sessionEmail: "teacher@school.il",
        clientEmail: "  Teacher@School.IL ",
      })
    ).toEqual({ ok: true, email: "teacher@school.il" });
  });

  it("rejects a different client email", () => {
    const result = resolveReporterEmail({
      sessionEmail: "teacher@school.il",
      clientEmail: "other@school.il",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/החשבון המחובר/);
  });

  it("rejects when the session has no usable email", () => {
    const result = resolveReporterEmail({
      sessionEmail: "",
      clientEmail: "teacher@school.il",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/אין מייל/);
  });
});
