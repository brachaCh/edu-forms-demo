import { describe, expect, it } from "vitest";
import {
  computeLastSentAtIso,
  formatParentFormSendStatusLine,
  isParentFormFilled,
  shouldSkipBulkRecipient,
} from "./form-parent-send-status";

describe("computeLastSentAtIso", () => {
  it("ignores revoked requests and returns latest send", () => {
    const iso = computeLastSentAtIso([
      { created_at: "2026-01-01T10:00:00.000Z", status: "revoked" },
      { created_at: "2026-02-01T12:00:00.000Z", status: "pending" },
      { created_at: "2026-01-15T12:00:00.000Z", status: "submitted" },
    ]);
    expect(iso).toBe("2026-02-01T12:00:00.000Z");
  });

  it("returns null when nothing was sent", () => {
    expect(computeLastSentAtIso([])).toBeNull();
    expect(
      computeLastSentAtIso([
        { created_at: "2026-01-01T10:00:00.000Z", status: "revoked" },
      ])
    ).toBeNull();
  });
});

describe("isParentFormFilled", () => {
  it("treats completed parent questionnaire as filled", () => {
    expect(
      isParentFormFilled({
        formId: "parent-questionnaire",
        fillStatus: "completed",
        data: {},
      })
    ).toBe(true);
  });

  it("requires both parents on a two-parent waiver", () => {
    expect(
      isParentFormFilled({
        formId: "waiver-confidentiality",
        data: { father_signature: "x" },
        singleResponsibleParty: false,
      })
    ).toBe(false);
    expect(
      isParentFormFilled({
        formId: "waiver-confidentiality",
        data: { father_signature: "x", mother_signature: "y" },
        singleResponsibleParty: false,
      })
    ).toBe(true);
  });
});

describe("shouldSkipBulkRecipient", () => {
  it("skips when already sent or filled per flags", () => {
    expect(
      shouldSkipBulkRecipient(
        { lastSentAt: "2026-01-01T00:00:00.000Z", filled: false },
        { skipAlreadySent: true, skipAlreadyFilled: false }
      )
    ).toBe(true);
    expect(
      shouldSkipBulkRecipient(
        { lastSentAt: null, filled: true },
        { skipAlreadySent: false, skipAlreadyFilled: true }
      )
    ).toBe(true);
    expect(
      shouldSkipBulkRecipient(
        { lastSentAt: null, filled: false },
        { skipAlreadySent: true, skipAlreadyFilled: true }
      )
    ).toBe(false);
  });
});

describe("formatParentFormSendStatusLine", () => {
  it("formats Hebrew sent and fill parts", () => {
    const line = formatParentFormSendStatusLine({
      lastSentAt: null,
      filled: false,
    });
    expect(line).toContain("לא נשלח");
    expect(line).toContain("לא מולא");
  });
});
