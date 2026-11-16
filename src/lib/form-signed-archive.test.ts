import { describe, expect, it } from "vitest";
import {
  allSignatureFieldsFilled,
  signedArchiveFileName,
} from "./form-signed-archive";

describe("allSignatureFieldsFilled", () => {
  it("requires every signature key to have a value", () => {
    expect(
      allSignatureFieldsFilled(
        ["parents_signature", "homeroom_signature"],
        { parents_signature: "ink", homeroom_signature: "ink" }
      )
    ).toBe(true);
    expect(
      allSignatureFieldsFilled(
        ["parents_signature", "homeroom_signature"],
        { parents_signature: "ink", homeroom_signature: "  " }
      )
    ).toBe(false);
  });

  it("is false when there are no signature keys", () => {
    expect(allSignatureFieldsFilled([], { parents_signature: "ink" })).toBe(
      false
    );
  });
});

describe("signedArchiveFileName", () => {
  it("builds a Hebrew signed-document name", () => {
    expect(signedArchiveFileName("תח״י", "נועה כהן")).toBe(
      "תח״י — נועה כהן — חתום.pdf"
    );
  });

  it("strips path characters from the title and student name", () => {
    expect(signedArchiveFileName("a/b", "c:d")).toBe("a-b — c-d — חתום.pdf");
  });
});
