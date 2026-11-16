import { describe, expect, it } from "vitest";
import {
  buildAccommodationsTablePatch,
  collectAdaptationsForDomains,
  flattenAccommodationsByDomain,
  parseAccommodationList,
  resolveAccommodationsByDomain,
  serializeAccommodationList,
  serializeAccommodationsByDomain,
  ACCOMMODATIONS_CLASSROOM_KEY,
  ACCOMMODATIONS_DOMAINS_KEY,
  ACCOMMODATIONS_EXAMS_KEY,
  ACCOMMODATIONS_SELECTIONS_KEY,
  ACCOMMODATIONS_TABLE_ID,
} from "./accommodations-catalog";
import { tableCellKey, tableRowCountKey } from "./form-table-grids";

describe("accommodations-catalog", () => {
  it("serializes and parses lists", () => {
    const raw = serializeAccommodationList(["a", "b"]);
    expect(parseAccommodationList(raw)).toEqual(["a", "b"]);
    expect(parseAccommodationList("")).toEqual([]);
    expect(parseAccommodationList("not-json")).toEqual([]);
  });

  it("unions classroom adaptations for selected domains", () => {
    const items = collectAdaptationsForDomains(
      ["attention", "slowness"],
      "classroom"
    );
    expect(items).toContain("סדר יום קבוע");
    expect(items).toContain("תוספת זמן למתן תשובות ולהתנהלות");
    expect(new Set(items).size).toBe(items.length);
  });

  it("returns exam adaptations for attention", () => {
    const exams = collectAdaptationsForDomains(["attention"], "exams");
    expect(exams).toContain("25% תוספת זמן");
    expect(exams).toContain("היבחנות בסביבה שקטה");
  });

  it("keeps selections per domain and fills the table", () => {
    const domains = ["attention", "reading"];
    const selections = {
      attention: {
        classroom: ["סדר יום קבוע"],
        exams: ["25% תוספת זמן"],
      },
      reading: {
        classroom: ["הגדלת גופן"],
        exams: [],
      },
    };

    const data = {
      [ACCOMMODATIONS_DOMAINS_KEY]: serializeAccommodationList(domains),
      [ACCOMMODATIONS_SELECTIONS_KEY]:
        serializeAccommodationsByDomain(selections),
    };

    const resolved = resolveAccommodationsByDomain(data);
    expect(resolved.attention.classroom).toEqual(["סדר יום קבוע"]);
    expect(resolved.reading.classroom).toEqual(["הגדלת גופן"]);

    const flat = flattenAccommodationsByDomain(domains, selections);
    expect(flat.classroom).toContain("סדר יום קבוע");
    expect(flat.classroom).toContain("הגדלת גופן");

    const patch = buildAccommodationsTablePatch(data, domains, selections);
    expect(patch[tableRowCountKey(ACCOMMODATIONS_TABLE_ID)]).toBe("2");
    expect(
      patch[tableCellKey(ACCOMMODATIONS_TABLE_ID, 0, "domain")]
    ).toBe("קשב וריכוז");
    expect(
      patch[tableCellKey(ACCOMMODATIONS_TABLE_ID, 0, "classroom")]
    ).toBe("סדר יום קבוע");
    expect(patch[tableCellKey(ACCOMMODATIONS_TABLE_ID, 1, "domain")]).toBe(
      "קשיי קריאה"
    );
  });

  it("migrates legacy flat lists into per-domain selections", () => {
    const data = {
      [ACCOMMODATIONS_DOMAINS_KEY]: serializeAccommodationList(["attention"]),
      [ACCOMMODATIONS_CLASSROOM_KEY]: serializeAccommodationList([
        "סדר יום קבוע",
        "ישיבה קרובה למורה",
      ]),
      [ACCOMMODATIONS_EXAMS_KEY]: serializeAccommodationList([
        "25% תוספת זמן",
      ]),
    };
    const resolved = resolveAccommodationsByDomain(data);
    expect(resolved.attention.classroom).toContain("סדר יום קבוע");
    expect(resolved.attention.exams).toContain("25% תוספת זמן");
  });
});
