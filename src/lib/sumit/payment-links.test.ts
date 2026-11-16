import { describe, expect, it } from "vitest";
import { isValidSumitPaymentPageUrl } from "./payment-links";

describe("payment-links URL validation", () => {
  it("accepts valid SUMIT hosted payment page URLs", () => {
    expect(
      isValidSumitPaymentPageUrl(
        "https://pay.sumit.co.il/democo/democat/abc12x/payment/"
      )
    ).toBe(true);
    expect(
      isValidSumitPaymentPageUrl("https://pay.sumit.co.il/democo/democat/")
    ).toBe(true);
  });

  it("rejects non-SUMIT or non-https URLs", () => {
    expect(isValidSumitPaymentPageUrl("http://pay.sumit.co.il/a/b/")).toBe(false);
    expect(isValidSumitPaymentPageUrl("https://evil.example.com/a/b/")).toBe(
      false
    );
    expect(isValidSumitPaymentPageUrl("https://pay.sumit.co.il/only")).toBe(
      false
    );
    expect(isValidSumitPaymentPageUrl("not a url")).toBe(false);
  });
});
