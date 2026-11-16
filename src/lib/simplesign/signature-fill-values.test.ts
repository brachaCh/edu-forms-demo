import { describe, expect, it } from "vitest";
import { buildSimpleSignSignedMarker } from "@/lib/simplesign/constants";
import {
  isInkPathSignature,
  formatSignatureMarkup,
  signatureToInkSegments,
} from "@/lib/green-signature";
import {
  buildSignatureInkPatchFromSimpleSignValues,
  formFillNeedsSimpleSignSignatureBackfill,
  parseSimpleSignSubmissionValues,
  shouldReplaceWithSimpleSignInk,
} from "@/lib/simplesign/signature-fill-values";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGPgL8v7DwIAFUAF72fqtCwAAAAASUVORK5CYII=";

const HANDWRITING_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAECAYAAACUY/8YAAAAS0lEQVR4nGNgGAUDBgz/GRj+M/xnYGCYMHHihAkT/jNMmDDhAin2MWIyAcTG6gKEq8Dm0MgFjGANpLgAm2HIJlDFBYyERqIIYHMBAONJHcPaqWPTAAAAAElFTkSuQmCC";

const INK1_WITH_STROKES = "ink1|200|50|10.0 10.0,20.0 15.0,30.0 12.0,40.0 18.0,50.0 14.0;80.0 20.0,90.0 25.0,100.0 22.0";

describe("parseSimpleSignSubmissionValues", () => {
  it("keeps string fields from webhook/API values", () => {
    expect(
      parseSimpleSignSubmissionValues({
        father_signature: TINY_PNG,
        father_id: "123",
      })
    ).toEqual({
      father_signature: TINY_PNG,
      father_id: "123",
    });
  });

  it("returns null for empty or invalid payloads", () => {
    expect(parseSimpleSignSubmissionValues(null)).toBeNull();
    expect(parseSimpleSignSubmissionValues({ father_signature: "  " })).toBeNull();
  });
});

describe("shouldReplaceWithSimpleSignInk", () => {
  it("replaces SimpleSign markers but keeps stored ink", () => {
    expect(
      shouldReplaceWithSimpleSignInk(
        buildSimpleSignSignedMarker("tok", "2026-11-04T00:00:00Z")
      )
    ).toBe(true);
    expect(shouldReplaceWithSimpleSignInk("ink1|120|40|1 2,3 4")).toBe(false);
  });
});

describe("buildSignatureInkPatchFromSimpleSignValues", () => {
  it("converts PNG to ink1 format or keeps PNG for waiver parent signature keys", async () => {
    const patch = await buildSignatureInkPatchFromSimpleSignValues(
      "waiver-confidentiality",
      {
        father_signature: HANDWRITING_PNG,
        mother_signature: HANDWRITING_PNG,
      },
      {
        father_signature: buildSimpleSignSignedMarker("tok", "2026-11-04T00:00:00Z"),
        mother_signature: buildSimpleSignSignedMarker("tok", "2026-11-04T00:00:00Z"),
      }
    );

    expect(patch.father_signature).toBeDefined();
    expect(patch.mother_signature).toBeDefined();
    const isInkOrPng = (v: string) =>
      isInkPathSignature(v) || v.startsWith("data:image/");
    expect(isInkOrPng(patch.father_signature!)).toBe(true);
    expect(isInkOrPng(patch.mother_signature!)).toBe(true);
  });

  it("keeps PNG data URL when strokes cannot be traced", async () => {
    const patch = await buildSignatureInkPatchFromSimpleSignValues(
      "waiver-confidentiality",
      { father_signature: TINY_PNG },
      { father_signature: buildSimpleSignSignedMarker("tok", "2026-11-04T00:00:00Z") }
    );

    expect(patch.father_signature).toBeDefined();
    expect(patch.father_signature?.startsWith("data:image/")).toBe(true);
  });

  it("does not overwrite signatures that are already ink", async () => {
    const existing = "ink1|120|40|10 10,20 20";
    const patch = await buildSignatureInkPatchFromSimpleSignValues(
      "waiver-confidentiality",
      { father_signature: HANDWRITING_PNG },
      { father_signature: existing }
    );
    expect(patch.father_signature).toBeUndefined();
  });

  it("ink1 format with strokes produces visible signature", async () => {
    const segments = await signatureToInkSegments(INK1_WITH_STROKES, 240, 40);
    expect(segments.length).toBeGreaterThan(0);

    const markup = formatSignatureMarkup(INK1_WITH_STROKES);
    expect(markup).toContain("box-shadow");
    expect(markup).not.toContain("data:image");
    expect(markup).not.toContain("<svg");
  });
});

describe("formFillNeedsSimpleSignSignatureBackfill", () => {
  it("detects leftover SimpleSign markers on waiver signatures", () => {
    expect(
      formFillNeedsSimpleSignSignatureBackfill("waiver-confidentiality", {
        father_signature: buildSimpleSignSignedMarker("tok", "2026-11-04T00:00:00Z"),
        mother_signature: "ink1|10|10|1 1",
      })
    ).toBe(true);
    expect(
      formFillNeedsSimpleSignSignatureBackfill("waiver-confidentiality", {
        father_signature: "ink1|10|10|1 1",
        mother_signature: "ink1|10|10|2 2",
      })
    ).toBe(false);
  });
});
