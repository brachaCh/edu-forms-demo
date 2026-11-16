import { describe, expect, it } from "vitest";
import {
  SIMPLE_SIGN_EMAIL_SEND_WARNING,
  simpleSignEmailSendWarning,
} from "@/lib/simplesign/email-send-warning";

describe("simpleSignEmailSendWarning", () => {
  it("returns a warning when fewer emails were sent than signers", () => {
    expect(simpleSignEmailSendWarning(0, 2)).toBe(
      SIMPLE_SIGN_EMAIL_SEND_WARNING
    );
    expect(simpleSignEmailSendWarning(1, 2)).toBe(
      SIMPLE_SIGN_EMAIL_SEND_WARNING
    );
  });

  it("returns undefined when every signer was emailed", () => {
    expect(simpleSignEmailSendWarning(2, 2)).toBeUndefined();
    expect(simpleSignEmailSendWarning(3, 2)).toBeUndefined();
  });
});
