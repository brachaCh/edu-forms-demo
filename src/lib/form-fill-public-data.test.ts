import { describe, expect, it } from "vitest";
import { FORM_SCHEMAS } from "@/lib/form-schemas";
import {
  FORM_TABLE_DEFS,
  getTableIdFromFieldKey,
  rowTableInitialData,
  scheduleFlatKeys,
} from "@/lib/form-table-grids";
import {
  mergeFillDataPreservingThirdPartySignatures,
  omitThirdPartySignatureFields,
  sanitizeFillData,
} from "./form-fill-public-data";

describe("sanitizeFillData", () => {
  it("keeps ordinary text fields", () => {
    const result = sanitizeFillData({ full_name: "הורה" });
    expect(result).toEqual({ ok: true, data: { full_name: "הורה" } });
  });

  it("accepts hyphenated table keys from staff forms", () => {
    const result = sanitizeFillData({
      "tbl_tachi-goals_r0_goal": "יעד",
      "tbl_tachi-goals_rows": "2",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        "tbl_tachi-goals_r0_goal": "יעד",
        "tbl_tachi-goals_rows": "2",
      },
    });
  });

  it("rejects an invalid field key", () => {
    const result = sanitizeFillData({ "bad key": "x" });
    expect(result.ok).toBe(false);
  });

  it("rejects keys with spaces or other symbols", () => {
    expect(sanitizeFillData({ "tbl tachi-goals_r0_goal": "x" }).ok).toBe(false);
    expect(sanitizeFillData({ "tbl_tachi-goals_r0_goal!": "x" }).ok).toBe(false);
    expect(sanitizeFillData({ "tbl_tachi.goals_r0_goal": "x" }).ok).toBe(false);
    expect(sanitizeFillData({ "tbl_tachi/goals_r0_goal": "x" }).ok).toBe(false);
  });

  it("accepts every form-table-grids key generated from form definitions", () => {
    let sawHyphenatedTableKey = false;
    for (const schema of FORM_SCHEMAS) {
      const data: Record<string, string> = {};
      for (const field of schema.sections.flatMap((section) => section.fields)) {
        if (field.type === "row-table") {
          const tableId = getTableIdFromFieldKey(field.key);
          expect(tableId, `${schema.id} ${field.key}`).toBeTruthy();
          if (!tableId) continue;
          Object.assign(data, rowTableInitialData(tableId));
          const otherKey = FORM_TABLE_DEFS[tableId]?.otherLabelFieldKey;
          if (otherKey) data[otherKey] = "";
        } else if (field.type === "schedule-grid") {
          for (const key of scheduleFlatKeys(field.scheduleVariant)) {
            data[key] = "";
          }
        }
      }
      if (Object.keys(data).length === 0) continue;
      if (Object.keys(data).some((key) => key.includes("-"))) {
        sawHyphenatedTableKey = true;
      }
      const result = sanitizeFillData(data);
      expect(
        result.ok,
        `${schema.id}: ${result.ok ? "ok" : result.error}`
      ).toBe(true);
    }
    expect(sawHyphenatedTableKey).toBe(true);
  });

  it("drops parent signature fields from public fill saves", () => {
    const result = sanitizeFillData({
      notes: "הערה",
      father_signature: "data:image/png;base64,AAA",
      mother_signature: "ink1|10|10|1,2",
    });
    expect(result).toEqual({ ok: true, data: { notes: "הערה" } });
  });
});

describe("mergeFillDataPreservingThirdPartySignatures", () => {
  it("keeps existing parent signatures when teacher saves other fields", () => {
    const merged = mergeFillDataPreservingThirdPartySignatures(
      {
        father_signature: "data:image/png;base64,DAD",
        notes: "ישן",
      },
      {
        father_signature: "data:image/png;base64,FAKE",
        notes: "חדש",
      }
    );
    expect(merged).toEqual({
      father_signature: "data:image/png;base64,DAD",
      notes: "חדש",
    });
  });

  it("keeps existing staff signatures and ignores a pad drawn on the fill page", () => {
    const merged = mergeFillDataPreservingThirdPartySignatures(
      { homeroom_signature: "from-email", notes: "ישן" },
      { homeroom_signature: "from-fill-page", notes: "חדש" }
    );
    expect(merged).toEqual({
      homeroom_signature: "from-email",
      notes: "חדש",
    });
  });

  it("omits third-party keys from a patch", () => {
    expect(
      omitThirdPartySignatureFields({
        father_signature: "x",
        principal_signature: "y",
        baseline: "z",
      })
    ).toEqual({ baseline: "z" });
  });

  it("omits staff signature pads from a teacher save", () => {
    expect(
      omitThirdPartySignatureFields({
        homeroom_signature: "ink",
        integration_teacher_signature: "ink2",
        notes: "ok",
      })
    ).toEqual({ notes: "ok" });
  });
});
