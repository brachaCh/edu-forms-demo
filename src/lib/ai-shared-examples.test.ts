import { describe, expect, it } from "vitest";
import {
  matchingAiExampleKinds,
  pickBestSharedExamples,
  resolveAiExampleKind,
  type SharedAiExample,
} from "@/lib/ai-shared-examples";
import type { FormSchema } from "@/lib/form-schemas";

function schema(partial: Partial<FormSchema> & Pick<FormSchema, "id">): FormSchema {
  return {
    title: partial.title ?? partial.id,
    categoryFolder: partial.categoryFolder ?? 'תח"י',
    folder: partial.folder ?? "",
    sections: partial.sections ?? [],
    ...partial,
  } as FormSchema;
}

describe("resolveAiExampleKind", () => {
  it("maps tachi integrative ids", () => {
    expect(resolveAiExampleKind(schema({ id: "tachi-integrative" }))).toBe(
      "tachi-integrative"
    );
    expect(resolveAiExampleKind(schema({ id: "tla-integrative" }))).toBe(
      "tla-integrative"
    );
  });

  it("maps learning process folder", () => {
    expect(
      resolveAiExampleKind(
        schema({ id: "daily-plan", categoryFolder: "תיעוד תהליך למידה" })
      )
    ).toBe("learning-process");
  });
});

describe("pickBestSharedExamples", () => {
  const examples: SharedAiExample[] = [
    {
      id: "1",
      kind: "tachi",
      name: "tachi",
      text: "a",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "2",
      kind: "tachi-integrative",
      name: "integrative",
      text: "b",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  it("prefers exact kind", () => {
    const picked = pickBestSharedExamples(examples, "tachi-integrative");
    expect(picked[0]?.id).toBe("2");
    expect(matchingAiExampleKinds("tachi-integrative")[0]).toBe(
      "tachi-integrative"
    );
  });
});
