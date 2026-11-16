import { describe, expect, it } from "vitest";
import { getDefaultFolderActionLabels } from "./portfolio-folder-templates";

describe("personal-basket TACHI buttons", () => {
  it("includes integrative TACHI like integration students", () => {
    const personal = getDefaultFolderActionLabels('תח"י', "personal-basket");
    const integration = getDefaultFolderActionLabels('תח"י', "integration");

    expect(personal).toContain('תח"י אינטגרטיבי');
    expect(integration).toContain('תח"י אינטגרטיבי');
  });
});
