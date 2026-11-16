import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requirePlatformAdmin = vi.fn();
const schedulePurchaseOwnerNotification = vi.fn();
const updatePayloads: Record<string, unknown>[] = [];
let updateError: { message: string } | null = null;

type InstitutionRow = {
  id: string;
  plan_id: string | null;
  institution_type: string;
  education_framework: string;
  plan_expires_at: string | null;
  subscription_status: string | null;
};

let liveInstitution: InstitutionRow | null = null;

vi.mock("@/lib/platform-admin", () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: () => true,
}));

vi.mock("@/lib/sumit/plan-catalog", () => ({
  isBillingPlanAllowedForInstitution: vi.fn(async () => true),
}));

vi.mock("@/lib/billing/purchase-notification", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/billing/purchase-notification")>();
  return {
    ...actual,
    schedulePurchaseOwnerNotification: (...args: unknown[]) =>
      schedulePurchaseOwnerNotification(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: () => {
      let pendingUpdate: Record<string, unknown> | null = null;
      const eqFilters: Record<string, unknown> = {};
      const isFilters: Record<string, unknown> = {};

      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          eqFilters[column] = value;
          return builder;
        },
        is: (column: string, value: unknown) => {
          isFilters[column] = value;
          return builder;
        },
        update: (payload: Record<string, unknown>) => {
          pendingUpdate = payload;
          updatePayloads.push(payload);
          return builder;
        },
        maybeSingle: async () => ({
          data: liveInstitution ? { ...liveInstitution } : null,
          error: null,
        }),
        then: (
          resolve: (value: {
            data: { id: string }[] | null;
            error: { message: string } | null;
          }) => unknown,
          reject: (reason: unknown) => unknown
        ) => {
          if (updateError) {
            return Promise.resolve({
              data: null,
              error: updateError,
            }).then(resolve, reject);
          }
          if (!pendingUpdate || !liveInstitution) {
            return Promise.resolve({ data: null, error: null }).then(
              resolve,
              reject
            );
          }

          const idOk =
            eqFilters.id == null || eqFilters.id === liveInstitution.id;
          let expiryOk = true;
          if ("plan_expires_at" in isFilters) {
            expiryOk = liveInstitution.plan_expires_at == null;
          } else if ("plan_expires_at" in eqFilters) {
            expiryOk =
              liveInstitution.plan_expires_at === eqFilters.plan_expires_at;
          }

          if (!idOk || !expiryOk) {
            return Promise.resolve({ data: [], error: null }).then(
              resolve,
              reject
            );
          }

          liveInstitution = {
            ...liveInstitution,
            ...(pendingUpdate.plan_id !== undefined
              ? { plan_id: pendingUpdate.plan_id as string | null }
              : {}),
            ...(pendingUpdate.plan_expires_at !== undefined
              ? {
                  plan_expires_at: pendingUpdate.plan_expires_at as
                    | string
                    | null,
                }
              : {}),
            ...(pendingUpdate.subscription_status !== undefined
              ? {
                  subscription_status:
                    pendingUpdate.subscription_status as string | null,
                }
              : {}),
          };
          return Promise.resolve({
            data: [{ id: liveInstitution.id }],
            error: null,
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  }),
}));

import { PATCH } from "@/app/api/platform/subscriptions/[institutionId]/route";

const pendingInstitution: InstitutionRow = {
  id: "inst-1",
  plan_id: "plan-1",
  institution_type: "schools",
  education_framework: "regular",
  plan_expires_at: null,
  subscription_status: "pending_payment",
};

function seedInstitution(row: InstitutionRow) {
  liveInstitution = { ...row };
}

async function patchSubscription(
  body: Record<string, unknown>
): Promise<Response> {
  return PATCH(
    new Request("http://localhost/api/platform/subscriptions/inst-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ institutionId: "inst-1" }) }
  );
}

function activateBankRequest(extra: Record<string, unknown> = {}) {
  return patchSubscription({ action: "activate_bank", ...extra });
}

async function expectedBankKey(response: Response): Promise<string> {
  const body = (await response.json()) as { planExpiresAt: string };
  return `bank:inst-1:${body.planExpiresAt}`;
}

describe("extend_expiry", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    schedulePurchaseOwnerNotification.mockReset();
    updatePayloads.length = 0;
    updateError = null;
    liveInstitution = null;
  });

  it("returns 403 for a non-admin", async () => {
    requirePlatformAdmin.mockResolvedValue({
      ok: false,
      status: 403,
      error: "FORBIDDEN",
    });

    const response = await patchSubscription({
      action: "extend_expiry",
      days: 14,
    });

    expect(response.status).toBe(403);
    expect(updatePayloads).toHaveLength(0);
  });

  it("clears the renewal reminder when extending expiry", async () => {
    requirePlatformAdmin.mockResolvedValue({
      ok: true,
      session: { userId: "admin", profile: { email: "demo@example.com" } },
    });
    seedInstitution({
      id: "inst-1",
      plan_id: "plan-1",
      institution_type: "schools",
      education_framework: "regular",
      plan_expires_at: "2026-12-01T12:00:00.000Z",
      subscription_status: "active",
    });

    const response = await patchSubscription({
      action: "extend_expiry",
      days: 10,
    });

    expect(response.status).toBe(200);
    expect(updatePayloads[0]).toMatchObject({
      renewal_reminder_for_expires_at: null,
    });
    expect(typeof updatePayloads[0]?.plan_expires_at).toBe("string");
    expect(schedulePurchaseOwnerNotification).not.toHaveBeenCalled();
  });
});

describe("activate_bank purchase notification", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    schedulePurchaseOwnerNotification.mockReset();
    updatePayloads.length = 0;
    updateError = null;
    requirePlatformAdmin.mockResolvedValue({
      ok: true,
      session: { userId: "admin", profile: { email: "demo@example.com" } },
    });
    seedInstitution(pendingInstitution);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("notifies after a first bank-transfer activation", async () => {
    const response = await activateBankRequest();

    expect(response.status).toBe(200);
    expect(updatePayloads[0]).toMatchObject({
      subscription_status: "active",
      payment_method: "bank_transfer",
    });
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledTimes(1);
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: "inst-1",
        planId: "plan-1",
        paymentMethod: "bank_transfer",
        amountAgorot: null,
        listPriceAgorot: null,
        couponApplied: false,
        idempotencyKey: await expectedBankKey(response),
      })
    );
  });

  it("emails once for an expired plan stored as active, then not on a second click", async () => {
    seedInstitution({
      ...pendingInstitution,
      subscription_status: "active",
      plan_expires_at: "2025-01-15T12:00:00.000Z",
    });

    const first = await activateBankRequest();
    expect(first.status).toBe(200);
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledTimes(1);
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: await expectedBankKey(first.clone()),
      })
    );

    const second = await activateBankRequest();
    expect(second.status).toBe(200);
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledTimes(1);
  });

  it("does not email when the plan is already active and unexpired", async () => {
    seedInstitution({
      ...pendingInstitution,
      subscription_status: "active",
      plan_expires_at: "2027-06-01T12:00:00.000Z",
    });

    const response = await activateBankRequest();
    expect(response.status).toBe(200);
    expect(schedulePurchaseOwnerNotification).not.toHaveBeenCalled();
  });

  it("sends one email for a double submit of the same activation", async () => {
    const [first, second] = await Promise.all([
      activateBankRequest(),
      activateBankRequest(),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledTimes(1);
    const scheduled = schedulePurchaseOwnerNotification.mock.calls[0]?.[0] as {
      idempotencyKey: string;
    };
    expect(scheduled.idempotencyKey).toMatch(
      /^bank:inst-1:\d{4}-\d{2}-\d{2}T/
    );
  });

  it("sends a new email after remove then reactivate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T10:00:00.000Z"));

    const first = await activateBankRequest();
    expect(first.status).toBe(200);
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledTimes(1);
    const firstKey = (
      schedulePurchaseOwnerNotification.mock.calls[0]?.[0] as {
        idempotencyKey: string;
      }
    ).idempotencyKey;
    expect(firstKey).toBe(await expectedBankKey(first));

    const removed = await patchSubscription({ action: "remove" });
    expect(removed.status).toBe(200);
    expect(liveInstitution?.subscription_status).toBe("none");
    expect(liveInstitution?.plan_id).toBeNull();
    expect(liveInstitution?.plan_expires_at).toBeNull();

    // Move to a different school year so the expiry date differs (TZ-68 school-year expiry)
    vi.setSystemTime(new Date("2027-10-20T11:00:00.000Z"));
    const second = await activateBankRequest({ plan_id: "plan-1" });
    expect(second.status).toBe(200);
    expect(schedulePurchaseOwnerNotification).toHaveBeenCalledTimes(2);
    const secondKey = (
      schedulePurchaseOwnerNotification.mock.calls[1]?.[0] as {
        idempotencyKey: string;
      }
    ).idempotencyKey;
    expect(secondKey).toBe(await expectedBankKey(second));
    expect(secondKey).not.toBe(firstKey);
  });

  it("still activates if notification scheduling throws", async () => {
    schedulePurchaseOwnerNotification.mockImplementation(() => {
      throw new Error("notify exploded");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await activateBankRequest();

    expect(response.status).toBe(200);
    errorSpy.mockRestore();
  });

  it("sets school-year expiry when activating a bank-transfer subscription", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00+03:00"));
    try {
      seedInstitution({
        id: "inst-1",
        plan_id: "plan-1",
        institution_type: "schools",
        education_framework: "regular",
        plan_expires_at: null,
        subscription_status: "pending_payment",
      });

      const response = await activateBankRequest();

      expect(response.status).toBe(200);
      const body = (await response.json()) as { planExpiresAt?: string };
      expect(body.planExpiresAt).toBe("2026-10-01T21:00:00.000Z");
      expect(updatePayloads[0]).toMatchObject({
        subscription_status: "active",
        payment_method: "bank_transfer",
        plan_expires_at: "2026-10-01T21:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("remove subscription", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    schedulePurchaseOwnerNotification.mockReset();
    updatePayloads.length = 0;
    updateError = null;
    requirePlatformAdmin.mockResolvedValue({
      ok: true,
      session: { userId: "admin", profile: { email: "demo@example.com" } },
    });
  });

  it("clears leftover plan fields on a none-status row", async () => {
    seedInstitution({
      id: "inst-1",
      plan_id: "plan-1",
      institution_type: "schools",
      education_framework: "regular",
      plan_expires_at: null,
      subscription_status: "none",
    });

    const response = await patchSubscription({ action: "remove" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      subscriptionStatus: "none",
    });
    expect(updatePayloads[0]).toMatchObject({
      plan_id: null,
      subscription_status: "none",
      payment_method: null,
      paid_at: null,
      plan_expires_at: null,
    });
    expect(liveInstitution?.plan_id).toBeNull();
    expect(liveInstitution?.subscription_status).toBe("none");
  });

  it("succeeds when the row is already cleared", async () => {
    seedInstitution({
      id: "inst-1",
      plan_id: null,
      institution_type: "schools",
      education_framework: "regular",
      plan_expires_at: null,
      subscription_status: "none",
    });

    const response = await patchSubscription({ action: "remove" });

    expect(response.status).toBe(200);
    expect(liveInstitution?.subscription_status).toBe("none");
  });

  it("returns JSON 500 instead of throwing when the update fails", async () => {
    seedInstitution(pendingInstitution);
    updateError = { message: "db exploded" };

    const response = await patchSubscription({ action: "remove" });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "UPDATE_FAILED" });
  });

  it("keeps the platform-admin permission check", async () => {
    requirePlatformAdmin.mockResolvedValue({
      ok: false,
      status: 403,
      error: "FORBIDDEN",
    });
    seedInstitution(pendingInstitution);

    const response = await patchSubscription({ action: "remove" });

    expect(response.status).toBe(403);
    expect(updatePayloads).toHaveLength(0);
  });
});
