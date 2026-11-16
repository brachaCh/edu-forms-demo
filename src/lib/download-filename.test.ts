import { describe, expect, it } from "vitest";
import { sanitizeDownloadFileName } from "./download-filename";

describe("sanitizeDownloadFileName", () => {
  it("preserves Hebrew", () => {
    expect(sanitizeDownloadFileName("כרטיס תלמיד.html")).toBe(
      "כרטיס תלמיד.html"
    );
  });

  it("strips illegal path characters", () => {
    expect(sanitizeDownloadFileName('bad\\name:file?.doc')).toBe(
      "bad-name-file-.doc"
    );
    expect(sanitizeDownloadFileName('bad"name.doc')).toBe('bad-name.doc');
  });
});