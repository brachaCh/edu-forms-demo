import { afterEach, describe, expect, it } from "vitest";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_CODE_RE,
  otpHashesEqual,
} from "./login-otp";

const SECRET = "test-session-secret-32-chars-min";

describe("login-otp", () => {
  const previousSecret = process.env.MATOAH_SESSION_SECRET;

  afterEach(() => {
    process.env.MATOAH_SESSION_SECRET = previousSecret;
  });

  it("generates 6-digit codes", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(OTP_CODE_RE);
    }
  });

  it("hashes codes with HMAC-SHA-256 keyed by the session secret", async () => {
    process.env.MATOAH_SESSION_SECRET = SECRET;
    const code = "123456";
    const first = await hashOtpCode(code);
    const second = await hashOtpCode(code);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(code);
    // unsalted SHA-256("123456") must not match — the point of HMAC
    expect(first).not.toBe(
      "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"
    );
  });

  it("changes the digest when the secret changes", async () => {
    process.env.MATOAH_SESSION_SECRET = SECRET;
    const withDefault = await hashOtpCode("123456");
    process.env.MATOAH_SESSION_SECRET = "other-session-secret-32-chars-min!!";
    const withOther = await hashOtpCode("123456");
    expect(withDefault).not.toBe(withOther);
  });

  it("compares hashes in constant time", async () => {
    process.env.MATOAH_SESSION_SECRET = SECRET;
    const hash = await hashOtpCode("654321");
    expect(otpHashesEqual(hash, hash)).toBe(true);
    const flipped = `${hash.slice(0, -1)}${hash.endsWith("0") ? "1" : "0"}`;
    expect(otpHashesEqual(hash, flipped)).toBe(false);
    expect(otpHashesEqual(hash, "abc")).toBe(false);
  });

  it("hashes with the public demo secret when none is configured", async () => {
    delete process.env.MATOAH_SESSION_SECRET;
    await expect(hashOtpCode("123456")).resolves.toEqual(expect.any(String));
  });
});
