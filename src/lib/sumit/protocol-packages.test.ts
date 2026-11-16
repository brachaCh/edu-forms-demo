import { describe, expect, it } from "vitest";
import type { SumitIncomeItem } from "@/lib/sumit/income-items";
import {
  isProtocolPackageName,
  limitsFromProtocolName,
  parseSumitPlanId,
  draftFromCatalogItem,
  protocolPackagesFromIncomeItems,
} from "./protocol-packages";

function item(partial: Partial<SumitIncomeItem> & Pick<SumitIncomeItem, "id" | "name" | "priceIls">): SumitIncomeItem {
  return {
    description: "",
    sku: "",
    raw: {},
    ...partial,
  };
}

describe("protocol packages", () => {
  it("keeps פרוטוקל without vav and drops the bare test item", () => {
    expect(isProtocolPackageName("פרוטוקל עד 60 תיקים")).toBe(true);
    expect(isProtocolPackageName("פרוטוקול עד 60 תיקים")).toBe(false);
    expect(isProtocolPackageName("פרוטוקל")).toBe(false);
    expect(isProtocolPackageName("חוברת כימיה")).toBe(false);
  });

  it("keeps the catalog category from the env catalog, not the item name", () => {
    const draft = draftFromCatalogItem({
      id: "1000000002",
      name: 'פרוטוקל, תיק כיתה או גן חנ"מ',
      priceIls: 1000,
      category: "regular",
    });

    expect(draft?.category).toBe("regular");
    expect(draft?.sumitItemId).toBe("1000000002");
    expect(draft?.id).toBe("sumit:1000000002:s17");
  });

  it("reads quotas from the SUMIT name", () => {
    expect(limitsFromProtocolName("פרוטוקל עד 60 תיקים")).toEqual({
      integrationPortfolios: 60,
      personalBaskets: true,
    });
    expect(limitsFromProtocolName('פרוטוקל עד 60 תיקים + כתת חנ"מ')).toEqual({
      integrationPortfolios: 60,
      personalBaskets: true,
      classes: 1,
    });
    expect(
      limitsFromProtocolName("פרוטוקל עד 120 תיקים + 2 כתות חנ\"מ")
    ).toMatchObject({ integrationPortfolios: 120, classes: 2 });
    expect(limitsFromProtocolName('פרוטוקל חנ"מ עד 5 כיתות \\ גנים')).toEqual({
      classes: 5,
    });
    expect(limitsFromProtocolName('פרוטוקל, תיק כיתה או גן חנ"מ')).toEqual({
      students: 17,
    });
    expect(limitsFromProtocolName('פרוטוקל חנ"מ תיק כתה או גן')).toEqual({
      students: 17,
    });
  });

  it("dedupes the same name and ignores unrelated income items", () => {
    const drafts = protocolPackagesFromIncomeItems([
      item({ id: "2406736039", name: "פרוטוקל עד 30 תיקים", priceIls: 1260 }),
      item({ id: "2345444587", name: "פרוטוקל עד 30 תיקים", priceIls: 1260 }),
      item({ id: "2299703901", name: "פרוטוקל", priceIls: 1 }),
      item({ id: "2172184910", name: "חוברת כימיה", priceIls: 25 }),
      item({
        id: "2286564209",
        name: 'פרוטוקל חנ"מ עד 8 כיתות \\ גנים',
        priceIls: 5900,
      }),
    ]);

    expect(drafts.map((draft) => draft.sumitItemId)).toEqual([
      "2406736039",
      "2286564209",
    ]);
    expect(drafts[0]?.category).toBe("regular");
    expect(drafts[1]?.category).toBe("special");
    expect(parseSumitPlanId(drafts[0]?.id ?? "")?.limits).toEqual({
      integrationPortfolios: 30,
      personalBaskets: true,
    });
  });
});
