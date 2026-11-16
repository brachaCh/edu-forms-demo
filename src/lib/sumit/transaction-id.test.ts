import { describe, expect, it } from "vitest";
import {
  extractSumitTransactionId,
  extractSumitTransactionIdFromSearch,
} from "./transaction-id";

describe("sumit transaction-id", () => {
  it("reads common SUMIT query parameters", () => {
    expect(extractSumitTransactionId({ ID: "12345" })).toBe("12345");
    expect(extractSumitTransactionId({ TransactionID: "abc" })).toBe("abc");
    expect(extractSumitTransactionId({ payment_id: "99" })).toBe("99");
  });

  it("reads SUMIT catalog return parameters (OG- prefix)", () => {
    expect(extractSumitTransactionId({ "OG-PaymentID": "2300495960" })).toBe(
      "2300495960"
    );
    const params = new URLSearchParams(
      "OG-CustomerID=2300495951&OG-PaymentID=2300495960&OG-PaymentType=CreditCard"
    );
    expect(extractSumitTransactionIdFromSearch(params)).toBe("2300495960");
  });

  it("parses URLSearchParams", () => {
    const params = new URLSearchParams("ID=777&foo=bar");
    expect(extractSumitTransactionIdFromSearch(params)).toBe("777");
  });
});
