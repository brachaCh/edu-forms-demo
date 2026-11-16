/**
 * TZ-17: Tests for billing profile loading with active institution support
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => mockSupabaseClient,
  isServiceRoleConfigured: () => true,
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => null,
  }),
}));

vi.mock("@/lib/session", () => ({
  SESSION_COOKIE: "session",
  verifySessionToken: () => null,
}));

import {
  loadBillingProfile,
  loadBillingProfileForActiveInstitution,
} from "./load-profile";

describe("loadBillingProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns profile merged with original institution data", async () => {
    const userId = "user-123";
    const originalInstitutionId = "inst-original";

    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: userId,
          email: "test@example.com",
          institution_id: originalInstitutionId,
          full_name: "Test User",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: originalInstitutionId,
          name: "Original Institution",
          plan_id: "plan-original",
          subscription_status: "active",
        },
        error: null,
      });

    const profile = await loadBillingProfile(userId);

    expect(profile).not.toBeNull();
    expect(profile?.institution_id).toBe(originalInstitutionId);
    expect(profile?.institution_name).toBe("Original Institution");
    expect(profile?.plan_id).toBe("plan-original");
    expect(profile?.subscription_status).toBe("active");
  });
});

describe("loadBillingProfileForActiveInstitution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns profile merged with ACTIVE institution data (not original)", async () => {
    const userId = "user-123";
    const originalInstitutionId = "inst-original";
    const activeInstitutionId = "inst-active-b";

    // First call: get user profile (has original institution)
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: userId,
          email: "test@example.com",
          institution_id: originalInstitutionId,
          full_name: "Test User",
        },
        error: null,
      })
      // Second call: get ACTIVE institution (not original)
      .mockResolvedValueOnce({
        data: {
          id: activeInstitutionId,
          name: "Active Institution B",
          plan_id: "plan-b",
          subscription_status: "pending_payment",
        },
        error: null,
      });

    const profile = await loadBillingProfileForActiveInstitution(
      userId,
      activeInstitutionId
    );

    expect(profile).not.toBeNull();
    // Should have the ACTIVE institution's ID, not original
    expect(profile?.institution_id).toBe(activeInstitutionId);
    // Should have the ACTIVE institution's data
    expect(profile?.institution_name).toBe("Active Institution B");
    expect(profile?.plan_id).toBe("plan-b");
    expect(profile?.subscription_status).toBe("pending_payment");
  });

  it("billing for institution B while B is active updates B only", async () => {
    const userId = "multi-inst-user";
    const institutionA = "inst-a-123";
    const institutionB = "inst-b-456";

    // User's original institution is A
    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: userId,
          email: "test@example.com",
          institution_id: institutionA, // Original is A
          full_name: "Multi-Institution User",
        },
        error: null,
      })
      // But we request profile for B (active)
      .mockResolvedValueOnce({
        data: {
          id: institutionB,
          name: "Institution B",
          plan_id: null,
          subscription_status: "none",
        },
        error: null,
      });

    const profile = await loadBillingProfileForActiveInstitution(
      userId,
      institutionB
    );

    // Profile should be for B, not A
    expect(profile?.institution_id).toBe(institutionB);
    expect(profile?.institution_name).toBe("Institution B");
    // Any billing operations using this profile will affect B
  });

  it("single-institution user works unchanged", async () => {
    const userId = "single-inst-user";
    const onlyInstitutionId = "inst-only";

    mockSupabaseClient.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: userId,
          email: "single@example.com",
          institution_id: onlyInstitutionId,
          full_name: "Single Institution User",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: onlyInstitutionId,
          name: "Only Institution",
          plan_id: "plan-single",
          subscription_status: "active",
        },
        error: null,
      });

    // For single-institution users, active = original
    const profile = await loadBillingProfileForActiveInstitution(
      userId,
      onlyInstitutionId
    );

    expect(profile?.institution_id).toBe(onlyInstitutionId);
    expect(profile?.institution_name).toBe("Only Institution");
    expect(profile?.plan_id).toBe("plan-single");
  });

  it("returns null when user profile not found", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const profile = await loadBillingProfileForActiveInstitution(
      "nonexistent-user",
      "some-institution"
    );

    expect(profile).toBeNull();
  });

  it("returns null on database error", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "connection timeout" },
    });

    const profile = await loadBillingProfileForActiveInstitution(
      "user-123",
      "institution-456"
    );

    expect(profile).toBeNull();
  });
});
