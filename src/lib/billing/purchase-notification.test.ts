import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterMock = vi.fn((fn: () => void | Promise<void>) => {
  return fn();
});

vi.mock("next/server", () => ({
  after: (fn: () => void | Promise<void>) => afterMock(fn),
}));

vi.mock("@/lib/app-origin", () => ({
  appOrigin: () => "https://demo.example.com",
}));

import {
  bankPurchaseIdempotencyKey,
  buildPurchaseNotificationEmail,
  formatPaidAmount,
  notifyOwnerOfPurchase,
  parsePurchaseNotificationEmails,
  paymentMethodLabel,
  planTitleForNotification,
  resetPurchaseNotificationIdempotencyForTests,
  resolvePaidAmountAgorot,
  schedulePurchaseOwnerNotification,
  sendPurchaseNotificationEmail,
  type PurchaseContext,
  type PurchaseNotificationInput,
} from "./purchase-notification";

function baseInput(
  overrides: Partial<PurchaseNotificationInput> = {}
): PurchaseNotificationInput {
  return {
    institutionId: "inst-1",
    planId: "plan-1",
    paymentMethod: "credit_card",
    amountAgorot: 210_000,
    listPriceAgorot: 210_000,
    couponApplied: false,
    idempotencyKey: "plan-payment:pay-1",
    paidAt: new Date("2026-10-19T10:00:00.000Z"),
    ...overrides,
  };
}

const context: PurchaseContext = {
  institutionName: "בית ספר הדוגמה",
  buyer: { fullName: "רבקה כהן", email: "rivka@school.example" },
  specialPriceAgorot: null,
};

describe("parsePurchaseNotificationEmails", () => {
  const originalPurchase = process.env.PURCHASE_NOTIFICATION_EMAILS;
  const originalAdmin = process.env.PLATFORM_ADMIN_EMAILS;

  afterEach(() => {
    if (originalPurchase === undefined) {
      delete process.env.PURCHASE_NOTIFICATION_EMAILS;
    } else {
      process.env.PURCHASE_NOTIFICATION_EMAILS = originalPurchase;
    }
    if (originalAdmin === undefined) {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    } else {
      process.env.PLATFORM_ADMIN_EMAILS = originalAdmin;
    }
  });

  it("uses PURCHASE_NOTIFICATION_EMAILS when set", () => {
    process.env.PURCHASE_NOTIFICATION_EMAILS =
      "demo@example.com, office@example.com";
    process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
    expect(parsePurchaseNotificationEmails()).toEqual([
      "demo@example.com",
      "office@example.com",
    ]);
  });

  it("falls back to PLATFORM_ADMIN_EMAILS", () => {
    delete process.env.PURCHASE_NOTIFICATION_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = "demo@example.com;demo@example.com";
    expect(parsePurchaseNotificationEmails()).toEqual(["demo@example.com"]);
  });

  it("returns an empty list when neither env is set", () => {
    delete process.env.PURCHASE_NOTIFICATION_EMAILS;
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(parsePurchaseNotificationEmails()).toEqual([]);
  });
});

describe("bankPurchaseIdempotencyKey", () => {
  it("is unique per paid period from the new expiry", () => {
    expect(
      bankPurchaseIdempotencyKey("inst-1", "2027-10-20T05:00:00.000Z")
    ).toBe("bank:inst-1:2027-10-20T05:00:00.000Z");
    expect(
      bankPurchaseIdempotencyKey("inst-1", "2028-10-20T06:00:00.000Z")
    ).not.toBe(
      bankPurchaseIdempotencyKey("inst-1", "2027-10-20T05:00:00.000Z")
    );
  });
});

describe("resolvePaidAmountAgorot", () => {
  it("returns the recorded amount and does not invent catalog or special prices", () => {
    expect(resolvePaidAmountAgorot({ amountAgorot: 100_000 })).toBe(100_000);
    expect(resolvePaidAmountAgorot({ amountAgorot: 0 })).toBe(0);
    expect(resolvePaidAmountAgorot({ amountAgorot: null })).toBeNull();
  });
});

describe("formatPaidAmount", () => {
  it("shows לא צוין when no amount was recorded", () => {
    expect(formatPaidAmount(null)).toBe("לא צוין");
  });

  it("formats whole-shekel amounts without decimals", () => {
    expect(formatPaidAmount(210_000)).toMatch(/2,100|2 100|2100/);
    expect(formatPaidAmount(0)).toMatch(/0/);
  });

  it("never rounds a non-zero agora amount to ₪0", () => {
    const oneAgora = formatPaidAmount(1);
    expect(oneAgora).toMatch(/0[.,]01/);
    expect(oneAgora).not.toBe(formatPaidAmount(0));
    expect(formatPaidAmount(50)).toMatch(/0[.,]50/);
  });
});

describe("buildPurchaseNotificationEmail", () => {
  it("builds a Hebrew RTL card-payment email", () => {
    const mail = buildPurchaseNotificationEmail({
      institutionName: "בית ספר הדוגמה",
      buyerName: "רבקה כהן",
      buyerEmail: "rivka@school.example",
      planTitle: "חבילה מס' 1",
      amountPaidLabel: "‏2,100 ₪",
      listPriceLabel: "‏2,100 ₪",
      couponApplied: false,
      paymentMethodLabel: paymentMethodLabel("credit_card"),
      paidAtLabel: "19 באוקטובר 2026, 13:00",
      adminUrl: "https://demo.example.com/platform-admin/subscriptions",
    });

    expect(mail.subject).toContain("רכישה חדשה");
    expect(mail.subject).toContain("בית ספר הדוגמה");
    expect(mail.text).toContain("כרטיס אשראי");
    expect(mail.text).toContain("רבקה כהן");
    expect(mail.text).toContain("rivka@school.example");
    expect(mail.text).toContain("חבילה מס' 1");
    expect(mail.text).not.toContain("הוחל קופון");
    expect(mail.text).toContain(
      "https://demo.example.com/platform-admin/subscriptions"
    );
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain("lang=\"he\"");
    expect(mail.html).toContain("לניהול מנויים");
    expect(mail.html).not.toContain("<script>");
  });

  it("mentions a coupon when the paid amount is discounted", () => {
    const mail = buildPurchaseNotificationEmail({
      institutionName: "גן דוגמה",
      buyerName: "דנה",
      buyerEmail: "dana@gan.example",
      planTitle: "חבילה מס' 2",
      amountPaidLabel: "‏0 ₪",
      listPriceLabel: "‏3,200 ₪",
      couponApplied: true,
      paymentMethodLabel: paymentMethodLabel("credit_card"),
      paidAtLabel: "19 באוקטובר 2026, 13:00",
      adminUrl: "https://demo.example.com/platform-admin/subscriptions",
    });

    expect(mail.text).toContain("הוחל קופון");
    expect(mail.text).toContain("מחיר מחירון");
    expect(mail.html).toContain("קופון");
  });

  it("labels bank transfer in Hebrew", () => {
    const mail = buildPurchaseNotificationEmail({
      institutionName: "מוסד",
      buyerName: "גיתי",
      buyerEmail: "demo@example.com",
      planTitle: planTitleForNotification("plan-custom"),
      amountPaidLabel: "לא צוין",
      listPriceLabel: null,
      couponApplied: false,
      paymentMethodLabel: paymentMethodLabel("bank_transfer"),
      paidAtLabel: "19 באוקטובר 2026, 13:00",
      adminUrl: "https://demo.example.com/platform-admin/subscriptions",
    });

    expect(mail.text).toContain("העברה בנקאית");
    expect(mail.text).toContain("חבילה אישית");
  });

  it("escapes HTML in institution and buyer fields", () => {
    const mail = buildPurchaseNotificationEmail({
      institutionName: 'גן <script>alert("x")</script>',
      buyerName: "א <b>שם</b>",
      buyerEmail: "a@example.com",
      planTitle: "חבילה",
      amountPaidLabel: "1 ₪",
      listPriceLabel: null,
      couponApplied: false,
      paymentMethodLabel: "כרטיס אשראי",
      paidAtLabel: "תאריך",
      adminUrl: "https://demo.example.com/platform-admin/subscriptions",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("notifyOwnerOfPurchase", () => {
  const originalPurchase = process.env.PURCHASE_NOTIFICATION_EMAILS;
  const originalAdmin = process.env.PLATFORM_ADMIN_EMAILS;

  beforeEach(() => {
    resetPurchaseNotificationIdempotencyForTests();
    process.env.PURCHASE_NOTIFICATION_EMAILS = "demo@example.com";
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });

  afterEach(() => {
    resetPurchaseNotificationIdempotencyForTests();
    if (originalPurchase === undefined) {
      delete process.env.PURCHASE_NOTIFICATION_EMAILS;
    } else {
      process.env.PURCHASE_NOTIFICATION_EMAILS = originalPurchase;
    }
    if (originalAdmin === undefined) {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    } else {
      process.env.PLATFORM_ADMIN_EMAILS = originalAdmin;
    }
  });

  it("sends a card-payment notification", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });
    await notifyOwnerOfPurchase(baseInput(), {
      sendEmail,
      loadContext: async () => context,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["demo@example.com"],
        idempotencyKey: "plan-payment:pay-1",
      })
    );
    const payload = sendEmail.mock.calls[0]?.[0] as {
      text: string;
      html: string;
    };
    expect(payload.text).toContain("כרטיס אשראי");
    expect(payload.text).toContain("בית ספר הדוגמה");
    expect(payload.html).toContain("dir=\"rtl\"");
  });

  it("sends a coupon / 100% discount notification", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });
    await notifyOwnerOfPurchase(
      baseInput({
        amountAgorot: 0,
        listPriceAgorot: 210_000,
        couponApplied: true,
        idempotencyKey: "plan-payment:pay-coupon",
      }),
      { sendEmail, loadContext: async () => context }
    );

    const payload = sendEmail.mock.calls[0]?.[0] as { text: string };
    expect(payload.text).toContain("הוחל קופון");
  });

  it("sends a bank-transfer notification", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });
    await notifyOwnerOfPurchase(
      baseInput({
        paymentMethod: "bank_transfer",
        amountAgorot: null,
        listPriceAgorot: null,
        idempotencyKey: "bank:inst-1:2026-10-19T10:00:00.000Z",
      }),
      { sendEmail, loadContext: async () => context }
    );

    const payload = sendEmail.mock.calls[0]?.[0] as { text: string };
    expect(payload.text).toContain("העברה בנקאית");
    expect(payload.text).toContain("סכום ששולם: לא צוין");
  });

  it("does not fill catalog or special price when bank transfer has no recorded amount", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });
    await notifyOwnerOfPurchase(
      baseInput({
        paymentMethod: "bank_transfer",
        amountAgorot: null,
        listPriceAgorot: 210_000,
        idempotencyKey: "bank:inst-1:no-amount",
      }),
      {
        sendEmail,
        loadContext: async () => ({
          ...context,
          specialPriceAgorot: 150_000,
        }),
      }
    );

    const payload = sendEmail.mock.calls[0]?.[0] as {
      text: string;
      html: string;
    };
    const paidLine = payload.text
      .split("\n")
      .find((line) => line.startsWith("סכום ששולם:"));
    expect(paidLine).toBe("סכום ששולם: לא צוין");
    expect(paidLine).not.toContain("1,500");
    expect(paidLine).not.toContain("2,100");
    expect(payload.html).toContain("לא צוין");
  });

  it("formats a 1-agora coupon charge with decimals instead of ₪0", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });
    await notifyOwnerOfPurchase(
      baseInput({
        amountAgorot: 1,
        listPriceAgorot: 210_000,
        couponApplied: true,
        idempotencyKey: "plan-payment:pay-one-agora",
      }),
      { sendEmail, loadContext: async () => context }
    );

    const payload = sendEmail.mock.calls[0]?.[0] as { text: string };
    const paidLine = payload.text
      .split("\n")
      .find((line) => line.startsWith("סכום ששולם:"));
    expect(paidLine).toBeDefined();
    expect(paidLine).toMatch(/0[.,]01/);
    expect(paidLine).not.toBe(`סכום ששולם: ${formatPaidAmount(0)}`);
    expect(payload.text).toContain("הוחל קופון");
  });

  it("sends only once for the same idempotency key", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });
    const input = baseInput();
    await notifyOwnerOfPurchase(input, {
      sendEmail,
      loadContext: async () => context,
    });
    await notifyOwnerOfPurchase(input, {
      sendEmail,
      loadContext: async () => context,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed send for the same purchase", async () => {
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce({ sent: false, detail: "boom" })
      .mockResolvedValueOnce({ sent: true });
    const input = baseInput({ idempotencyKey: "plan-payment:retry" });
    await notifyOwnerOfPurchase(input, {
      sendEmail,
      loadContext: async () => context,
    });
    await notifyOwnerOfPurchase(input, {
      sendEmail,
      loadContext: async () => context,
    });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("swallows sender failures and does not throw", async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error("resend down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notifyOwnerOfPurchase(baseInput({ idempotencyKey: "plan-payment:fail" }), {
        sendEmail,
        loadContext: async () => context,
      })
    ).resolves.toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("swallows context-loader failures", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notifyOwnerOfPurchase(baseInput({ idempotencyKey: "plan-payment:ctx" }), {
        sendEmail,
        loadContext: async () => {
          throw new Error("db down");
        },
      })
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("schedulePurchaseOwnerNotification", () => {
  const originalPurchase = process.env.PURCHASE_NOTIFICATION_EMAILS;

  beforeEach(() => {
    resetPurchaseNotificationIdempotencyForTests();
    afterMock.mockClear();
    process.env.PURCHASE_NOTIFICATION_EMAILS = "demo@example.com";
  });

  afterEach(() => {
    resetPurchaseNotificationIdempotencyForTests();
    if (originalPurchase === undefined) {
      delete process.env.PURCHASE_NOTIFICATION_EMAILS;
    } else {
      process.env.PURCHASE_NOTIFICATION_EMAILS = originalPurchase;
    }
  });

  it("runs after the response via next/server after()", () => {
    schedulePurchaseOwnerNotification(baseInput());
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(typeof afterMock.mock.calls[0]?.[0]).toBe("function");
    expect(afterMock.mock.results[0]?.value).toBeInstanceOf(Promise);
  });

  it("falls back to immediate send when after() throws", async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error("no request scope");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      schedulePurchaseOwnerNotification(
        baseInput({ idempotencyKey: "plan-payment:after-throw" })
      )
    ).not.toThrow();
    errorSpy.mockRestore();
  });
});

describe("sendPurchaseNotificationEmail", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("does not send mail in the public demo", async () => {
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal(
      "fetch",
      fetchMock.mockResolvedValue({ ok: true, text: async () => "" })
    );

    await expect(
      sendPurchaseNotificationEmail({
        to: ["demo@example.com"],
        subject: "נושא",
        text: "טקסט",
        html: "<p>html</p>",
        idempotencyKey: "plan-payment:pay-1",
      })
    ).resolves.toEqual(
      expect.objectContaining({ sent: false })
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
