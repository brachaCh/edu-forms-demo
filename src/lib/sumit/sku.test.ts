import { describe, expect, it } from "vitest";
import { parsePlanSku } from "./sku";

describe("sumit sku", () => {
  it("parses catalog category prefixes", () => {
    expect(parsePlanSku("regular:plan-1")).toEqual({
      planId: "plan-1",
      category: "regular",
    });
    expect(parsePlanSku("special:plan-7")).toEqual({
      planId: "plan-7",
      category: "special",
    });
    expect(parsePlanSku("other:plan-1")).toBeNull();
  });
});
