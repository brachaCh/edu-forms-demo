import { describe, expect, it } from "vitest";
import {
  createFormAiFillSession,
  recordFormAiFillApply,
} from "./form-ai-fill-session";

describe("form-ai-fill-session", () => {
  it("increments fill count even when no fields changed", () => {
    const session = createFormAiFillSession();
    recordFormAiFillApply(session, {});
    expect(session.aiFillCount).toBe(1);
    expect(session.aiFilledKeys.size).toBe(0);
  });

  it("tracks keys and values from a successful apply", () => {
    const session = createFormAiFillSession();
    recordFormAiFillApply(session, { a: "one", b: "two" });
    expect(session.aiFillCount).toBe(1);
    expect(session.lastAiValues).toEqual({ a: "one", b: "two" });
    expect(session.aiFilledKeys).toEqual(new Set(["a", "b"]));
    recordFormAiFillApply(session, { b: "updated" });
    expect(session.aiFillCount).toBe(2);
    expect(session.aiFilledKeys).toEqual(new Set(["a", "b"]));
    expect(session.lastAiValues.b).toBe("updated");
  });
});
