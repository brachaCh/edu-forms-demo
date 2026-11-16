import { describe, expect, it } from "vitest";
import {
  decodeFolderParam,
  encodeFolderParam,
  normalizeHebrewQuotes,
  sameHebrewFolderName,
  stripHebrewQuotes,
} from "./hebrew-quotes";
import { getFormSchemaByFolder } from "./form-schemas";
import { getDefaultFolderActionLabels } from "./portfolio-folder-templates";

describe("hebrew quotes", () => {
  it("treats ascii quotes and gershayim as the same folder name", () => {
    expect(sameHebrewFolderName('דף הכנה לתח"י', "דף הכנה לתח״י")).toBe(true);
    expect(stripHebrewQuotes('דף הכנה לתח"י')).toBe("דף הכנה לתחי");
    expect(normalizeHebrewQuotes("דף הכנה לתח״י")).toBe('דף הכנה לתח"י');
  });

  it("encodes folder params without ascii quotes", () => {
    const encoded = encodeFolderParam('דף הכנה לתח"י');
    expect(encoded.includes("%22")).toBe(false);
    expect(decodeFolderParam(encoded)).toBe('דף הכנה לתח"י');
  });

  it("encodes folder params safely when they contain slashes", () => {
    const name = 'תיק / משנה \\ מיוחד';
    const encoded = encodeFolderParam(name);
    // ודא שלא מופיע %2F מתוך ה-encoding
    expect(encoded.toLowerCase().includes("%2f")).toBe(false);
    expect(decodeFolderParam(encoded)).toBe(name);
  });
});

describe("tachi prep form lookup", () => {
  it("resolves the holistic prep form from all common labels", () => {
    const labels = [
      'דף הכנה לתח"י',
      "דף הכנה לתח״י",
      'דף הכנה לתח"י (היעזרי במחוון)',
      "tachi-prep",
    ];
    for (const label of labels) {
      expect(getFormSchemaByFolder(label)?.id).toBe("tachi-prep");
    }
  });

  it("keeps the prep page in the tachi folder template", () => {
    const labels = getDefaultFolderActionLabels('תח"י', "integration");
    expect(labels).toContain('דף הכנה לתח"י');
    const gershayim = getDefaultFolderActionLabels("תח״י", "integration");
    expect(gershayim).toContain('דף הכנה לתח"י');
  });
});

describe("tla presentation form lookup", () => {
  it("resolves presentation and prep to different form ids", () => {
    expect(getFormSchemaByFolder('דף הכנה לתל"א')?.id).toBe("tla-prep");
    expect(
      getFormSchemaByFolder('דף הצגת תל"א (מוקדי כוח וחוזק)')?.id
    ).toBe("tla-presentation");
    expect(getFormSchemaByFolder("tla-presentation")?.id).toBe(
      "tla-presentation"
    );
  });

  it("keeps presentation in the tla folder template", () => {
    const labels = getDefaultFolderActionLabels('תל"א', "special-ed-class");
    expect(labels).toContain('דף הכנה לתל"א');
    expect(labels).toContain('דף הצגת תל"א (מוקדי כוח וחוזק)');
  });
});
