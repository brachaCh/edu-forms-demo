import { describe, expect, it } from "vitest";
import {
  DEFAULT_COL_OTHER,
  INTEGRATIVE_COL_OTHER_KEY,
  resolveIntegrativeColumnLabel,
} from "@/lib/integrative-tachi-defs";

describe("resolveIntegrativeColumnLabel (TZ-204)", () => {
  it("uses custom label when set", () => {
    expect(
      resolveIntegrativeColumnLabel(
        INTEGRATIVE_COL_OTHER_KEY,
        "מטפלת רגשית"
      )
    ).toBe("מטפלת רגשית");
  });

  it("falls back to אחר when empty or whitespace", () => {
    expect(resolveIntegrativeColumnLabel(INTEGRATIVE_COL_OTHER_KEY, "")).toBe(
      DEFAULT_COL_OTHER
    );
    expect(resolveIntegrativeColumnLabel(INTEGRATIVE_COL_OTHER_KEY, "  ")).toBe(
      DEFAULT_COL_OTHER
    );
  });
});