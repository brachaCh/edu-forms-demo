import { describe, expect, it } from "vitest";
import {
  formFillStatusAfterParentSignatureSend,
  formFillStatusLabel,
  mergeFormFillStatus,
} from "./form-fill-status";

describe("formFillStatusLabel", () => {
  it("labels draft as טיוטה", () => {
    expect(formFillStatusLabel("draft")).toBe("טיוטה");
  });

  it("labels saved as נשמר", () => {
    expect(formFillStatusLabel("saved")).toBe("נשמר");
  });

  it("labels completed as הושלם", () => {
    expect(formFillStatusLabel("completed")).toBe("הושלם");
  });
});

describe("mergeFormFillStatus", () => {
  it("does not downgrade saved to draft", () => {
    expect(mergeFormFillStatus("saved", "draft")).toBe("saved");
  });

  it("does not downgrade completed to saved or draft", () => {
    expect(mergeFormFillStatus("completed", "saved")).toBe("completed");
    expect(mergeFormFillStatus("completed", "draft")).toBe("completed");
  });

  it("upgrades draft to saved and saved to completed", () => {
    expect(mergeFormFillStatus("draft", "saved")).toBe("saved");
    expect(mergeFormFillStatus("saved", "completed")).toBe("completed");
  });
});

describe("formFillStatusAfterParentSignatureSend", () => {
  it("saves parent-signature sends as נשמר, not טיוטה", () => {
    expect(formFillStatusAfterParentSignatureSend("draft")).toBe("saved");
    expect(formFillStatusAfterParentSignatureSend(undefined)).toBe("saved");
  });

  it("keeps completed forms completed after a signature send", () => {
    expect(formFillStatusAfterParentSignatureSend("completed")).toBe(
      "completed"
    );
  });
});
