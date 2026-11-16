import { describe, expect, it } from "vitest";
import { getFormSchema } from "@/lib/form-schemas";
import { formSnapshotFileName } from "@/lib/form-snapshot-filename";
import { isTachiFormArchiveDocument } from "./tachi-archive-download";

describe("isTachiFormArchiveDocument", () => {
  it("matches tachi portfolio archive names only", () => {
    const tachi = getFormSchema("tachi");
    const integrative = getFormSchema("tachi-integrative");
    expect(tachi).toBeTruthy();
    expect(integrative).toBeTruthy();
    expect(
      isTachiFormArchiveDocument({
        name: formSnapshotFileName(tachi!.title),
      })
    ).toBe(true);
    expect(
      isTachiFormArchiveDocument({
        name: formSnapshotFileName(integrative!.title),
      })
    ).toBe(true);
    expect(
      isTachiFormArchiveDocument({
        name: formSnapshotFileName("כרטיס תלמיד סל אישי"),
      })
    ).toBe(false);
  });
});