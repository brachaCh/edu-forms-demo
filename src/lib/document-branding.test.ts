import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalBrandingCache,
  persistInstitutionFooterLogoDataUrl,
  persistSchoolLogoDataUrl,
  resolveAssociationLogoDataUrl,
  resolveSchoolLogoDataUrl,
  schoolLogoScopeKey,
  syncAssociationLogoFromProfile,
} from "./document-branding";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("document-branding registration isolation", () => {
  beforeEach(() => {
    const localStorage = createLocalStorageMock();
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);
  });

  it("prefers user id over teacher name for school logo scope", () => {
    expect(
      schoolLogoScopeKey({
        userId: "user-a",
        teacherName: "רחל כהן",
      })
    ).toBe("user:user-a");
  });

  it("does not leak school logos across users with the same teacher name", () => {
    persistSchoolLogoDataUrl(
      { userId: "user-a", teacherName: "רחל כהן" },
      "data:image/png;base64,OLD"
    );

    expect(
      resolveSchoolLogoDataUrl({
        userId: "user-b",
        teacherName: "רחל כהן",
      })
    ).toBeNull();
  });

  it("does not fall back to a global default school logo", () => {
    persistSchoolLogoDataUrl({ userId: "user-a" }, "data:image/png;base64,OLD");

    expect(
      resolveSchoolLogoDataUrl({
        userId: "user-b",
        teacherName: "מורה חדשה",
      })
    ).toBeNull();
  });

  it("TZ-208: ignores logos stored only under the legacy default scope key", () => {
    window.localStorage.setItem(
      "matoah.school-logo",
      JSON.stringify({ default: "data:image/png;base64,FIXED" })
    );

    expect(resolveSchoolLogoDataUrl({ userId: "user-new" })).toBeNull();
    expect(resolveSchoolLogoDataUrl({ institutionId: "inst-new" })).toBeNull();
    expect(resolveSchoolLogoDataUrl({})).toBeNull();
  });

  it("does not fall back to a global default association logo", () => {
    persistInstitutionFooterLogoDataUrl(
      { institutionCode: "school-a" },
      "data:image/png;base64,OLD"
    );

    expect(
      resolveAssociationLogoDataUrl({ institutionCode: "school-b" })
    ).toBeNull();
  });

  it("clears local branding cache for a fresh registration", () => {
    persistSchoolLogoDataUrl({ userId: "user-a" }, "data:image/png;base64,OLD");
    persistInstitutionFooterLogoDataUrl(
      { institutionCode: "school-a" },
      "data:image/png;base64,OLD"
    );

    clearLocalBrandingCache();

    expect(resolveSchoolLogoDataUrl({ userId: "user-a" })).toBeNull();
    expect(resolveAssociationLogoDataUrl({ institutionCode: "school-a" })).toBeNull();
  });

  it("syncs association logo from profile when local cache is empty", () => {
    syncAssociationLogoFromProfile({
      institutionCode: "school-a",
      institutionLogoUrl: "data:image/png;base64,FROM_SERVER",
    });
    expect(resolveAssociationLogoDataUrl({ institutionCode: "school-a" })).toBe(
      "data:image/png;base64,FROM_SERVER"
    );
  });

  it("does not overwrite an existing local association logo during sync", () => {
    persistInstitutionFooterLogoDataUrl(
      { institutionCode: "school-a" },
      "data:image/png;base64,LOCAL"
    );
    syncAssociationLogoFromProfile({
      institutionCode: "school-a",
      institutionLogoUrl: "data:image/png;base64,FROM_SERVER",
    });
    expect(resolveAssociationLogoDataUrl({ institutionCode: "school-a" })).toBe(
      "data:image/png;base64,LOCAL"
    );
  });
});
