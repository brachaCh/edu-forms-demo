import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("Secret123!");
    expect(hash.startsWith("bcrypt:")).toBe(true);
    await expect(verifyPassword("Secret123!", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Secret123!");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
  });

  it("still verifies a legacy pbkdf2 hash", async () => {
    const { webcrypto } = await import("node:crypto");
    const salt = new Uint8Array(16).fill(7);
    const key = await webcrypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("legacy-pass"),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await webcrypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key,
      256
    );
    const hashBytes = new Uint8Array(bits);
    const b64 = Buffer.from(salt).toString("base64");
    const h64 = Buffer.from(hashBytes).toString("base64");
    const stored = `pbkdf2:100000:${b64}:${h64}`;
    await expect(verifyPassword("legacy-pass", stored)).resolves.toBe(true);
  });
});
