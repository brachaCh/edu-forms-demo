import { describe, expect, it } from "vitest";
import {
  applyTutorialReorder,
  filterTutorialsForViewer,
  isAllowedTutorialUrl,
  parseSpecialPriceAgorot,
  parseTutorialInput,
  type TutorialRecord,
} from "./tutorials";

function tutorial(
  id: string,
  audience: TutorialRecord["audience"] = "all"
): TutorialRecord {
  return {
    id,
    title: id,
    url: "https://youtu.be/abc123",
    audience,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("tutorials permissions and validation", () => {
  it("accepts YouTube / Vimeo / Drive https links", () => {
    expect(isAllowedTutorialUrl("https://youtu.be/abc")).toBe(true);
    expect(isAllowedTutorialUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isAllowedTutorialUrl("https://vimeo.com/123")).toBe(true);
    expect(
      isAllowedTutorialUrl("https://drive.google.com/file/d/abc/view")
    ).toBe(true);
  });

  it("rejects empty, localhost, and non-http urls", () => {
    expect(isAllowedTutorialUrl("")).toBe(false);
    expect(isAllowedTutorialUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedTutorialUrl("http://localhost/video")).toBe(false);
  });

  it("requires title and a valid url", () => {
    expect(parseTutorialInput({ title: "", url: "https://youtu.be/a" }).ok).toBe(
      false
    );
    expect(parseTutorialInput({ title: "סרטון", url: "not-a-url" }).ok).toBe(false);
    expect(
      parseTutorialInput({ title: "סרטון", url: "https://youtu.be/a", audience: "teachers" })
    ).toEqual({
      ok: true,
      data: { title: "סרטון", url: "https://youtu.be/a", audience: "teachers" },
    });
  });

  it("hides admin-only tutorials from regular users", () => {
    const items = [
      tutorial("1", "all"),
      tutorial("2", "teachers"),
      tutorial("3", "admins"),
    ];
    expect(filterTutorialsForViewer(items, false).map((item) => item.id)).toEqual([
      "1",
      "2",
    ]);
    expect(filterTutorialsForViewer(items, true)).toHaveLength(3);
  });

  it("reorders by id list and appends leftovers", () => {
    const items = [tutorial("a"), tutorial("b"), tutorial("c")];
    const next = applyTutorialReorder(items, ["c", "a"]);
    expect(next.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(next.map((item) => item.sort_order)).toEqual([0, 1, 2]);
  });

  it("parses special price override including clear", () => {
    expect(parseSpecialPriceAgorot(null)).toEqual({ ok: true, value: null });
    expect(parseSpecialPriceAgorot(12345)).toEqual({ ok: true, value: 12345 });
    expect(parseSpecialPriceAgorot(-1).ok).toBe(false);
  });
});
