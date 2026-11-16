import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_SESSION_MAX_AGE_SECONDS,
  DEMO_USER,
  isDemoUserId,
} from "@/lib/demo-data";
import {
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from "@/lib/session";
import type { UserProfile } from "@/lib/supabase/types";

const profile: UserProfile = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "בדיקה",
  phone: "0500000000",
  email: "test@example.com",
  institution_id: null,
  institution_code: "ABC",
  terms_accepted_at: null,
  is_admin: false,
  is_institution_owner: false,
  created_at: new Date().toISOString(),
};

describe("session", () => {
  beforeEach(() => {
    process.env.MATOAH_SESSION_SECRET = "test-session-secret-32-chars-min";
  });

  it("creates a verifiable session token", async () => {
    const token = await createSessionToken(profile);
    const payload = await verifySessionToken(token);
    expect(payload).toMatchObject({
      userId: profile.id,
      email: profile.email,
      fullName: profile.full_name,
    });
    expect(payload?.sid).toBeTruthy();
  });

  it("rejects tampered tokens", async () => {
    const token = await createSessionToken(profile);
    const tampered = `${token.slice(0, -4)}aaaa`;
    await expect(verifySessionToken(tampered)).resolves.toBeNull();
  });

  it("issues a short-lived demo session", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await createSessionToken(DEMO_USER, {
      maxAgeSeconds: DEMO_SESSION_MAX_AGE_SECONDS,
    });
    const payload = await verifySessionToken(token);
    expect(isDemoUserId(payload?.userId)).toBe(true);
    expect(payload?.exp).toBeGreaterThanOrEqual(
      before + DEMO_SESSION_MAX_AGE_SECONDS
    );
    expect(payload?.exp).toBeLessThan(before + SESSION_MAX_AGE_SECONDS / 2);
  });
});
