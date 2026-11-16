import { describe, expect, it } from "vitest";
import {
  applyClearedSubscriptionFields,
  FALLBACK_SUBSCRIPTION_NAME,
  readSubscriptionActionError,
  removeSubscriptionConfirmMessage,
  subscriptionActionErrorMessage,
  subscriptionActionSuccessMessage,
  subscriptionRowDisplayName,
} from "./platform-subscription-admin";

describe("subscriptionRowDisplayName", () => {
  it("uses the institution name when present", () => {
    expect(
      subscriptionRowDisplayName({
        institutionName: "חחח",
        schoolName: "בית ספר",
      })
    ).toBe("חחח");
  });

  it("skips blank / whitespace names so the confirm is never empty", () => {
    expect(
      subscriptionRowDisplayName({
        institutionName: "  ",
        schoolName: null,
        userFullName: "מורה דמו",
        institutionCode: "ABC",
      })
    ).toBe("מורה דמו");
  });

  it("falls back to המוסד when every field is empty", () => {
    expect(
      subscriptionRowDisplayName({
        institutionName: "",
        schoolName: "   ",
        userFullName: null,
        institutionCode: "",
      })
    ).toBe(FALLBACK_SUBSCRIPTION_NAME);
  });
});

describe("removeSubscriptionConfirmMessage", () => {
  it("embeds the resolved name between « »", () => {
    const text = removeSubscriptionConfirmMessage("פרוטוקול עד 60");
    expect(text).toContain("«פרוטוקול עד 60»");
    expect(text).not.toMatch(/של\s{2,}/);
    expect(text).toContain("החבילה והתשלום יימחקו מהרשומה");
  });

  it("never leaves a double space after של when the name is blank", () => {
    const text = removeSubscriptionConfirmMessage("   ");
    expect(text).toContain(`«${FALLBACK_SUBSCRIPTION_NAME}»`);
    expect(text).not.toMatch(/של\s{2,}/);
    expect(text).not.toMatch(/של «»/);
  });
});

describe("subscription action messages", () => {
  it("maps HTTP failures to Hebrew errors", () => {
    expect(subscriptionActionErrorMessage(403)).toBe(
      "אין הרשאה לבצע פעולה זו."
    );
    expect(subscriptionActionErrorMessage(404)).toBe("המוסד לא נמצא.");
    expect(subscriptionActionErrorMessage(500)).toBe(
      "לא ניתן להשלים את הפעולה. נסו שוב."
    );
    expect(subscriptionActionErrorMessage(400, "PLAN_REQUIRED")).toBe(
      "יש לבחור חבילה לפני הפעולה."
    );
  });

  it("returns a Hebrew success notice for remove", () => {
    expect(subscriptionActionSuccessMessage("remove")).toMatch(/המנוי הוסר/);
  });

  it("reads a Hebrew error from a failed Response", async () => {
    const response = new Response(JSON.stringify({ error: "FORBIDDEN" }), {
      status: 403,
    });
    await expect(readSubscriptionActionError(response)).resolves.toBe(
      "אין הרשאה לבצע פעולה זו."
    );
  });
});

describe("applyClearedSubscriptionFields", () => {
  it("resets billing fields and keeps the institution identity", () => {
    const next = applyClearedSubscriptionFields({
      institutionId: "inst-1",
      institutionName: "חחח",
      planId: "plan-1",
      planTitle: "פרוטוקול עד 60 תיקים",
      subscriptionStatus: "none",
      paymentMethod: "bank_transfer",
    });

    expect(next.institutionId).toBe("inst-1");
    expect(next.institutionName).toBe("חחח");
    expect(next.planId).toBeNull();
    expect(next.planTitle).toBeNull();
    expect(next.subscriptionStatus).toBe("none");
    expect(next.paymentMethod).toBeNull();
  });
});
