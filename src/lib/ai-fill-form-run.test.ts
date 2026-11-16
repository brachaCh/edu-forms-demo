import { describe, expect, it } from "vitest";
import { extractJsonRecord } from "./ai-fill-form-run";

describe("extractJsonRecord", () => {
  it("reads a raw JSON object", () => {
    expect(extractJsonRecord('{"a":"1"}')).toEqual({ a: "1" });
  });

  it("reads a fenced JSON object", () => {
    expect(extractJsonRecord('```json\n{"goal":"יעד"}\n```')).toEqual({
      goal: "יעד",
    });
  });

  it("returns null when there is no object", () => {
    expect(extractJsonRecord("אין כאן אובייקט")).toBeNull();
  });
});
