import { describe, expect, it } from "vitest";
import { generateResetToken, hashResetToken } from "./password-reset";

describe("password-reset tokens", () => {
  it("generates opaque hex tokens", () => {
    const token = generateResetToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(generateResetToken()).not.toBe(token);
  });

  it("hashes tokens stably with SHA-256", async () => {
    const token = "a".repeat(64);
    const first = await hashResetToken(token);
    const second = await hashResetToken(token);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(token);
  });
});
