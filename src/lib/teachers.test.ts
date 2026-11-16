import { describe, expect, it } from "vitest";
import { STATUS_LABELS } from "@/lib/labels";

describe("teachers status labels", () => {
  it("includes integration-teacher label", () => {
    expect(STATUS_LABELS["integration-teacher"]).toBeTruthy();
  });
});
