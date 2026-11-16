import { describe, expect, it } from "vitest";
import {
  sumitCatalogAdminLabel,
  sumitCatalogKeyFromUrl,
} from "@/lib/sumit/catalog-urls";
import {
  isSumitPayCatalogUrl,
  parseSumitCatalogPage,
} from "@/lib/sumit/catalog-page";

const PAGE = `
<div class="og-purchasepages-catalog-item-name">פרוטוקל עד 60 תיקים</div>
<div class="og-purchasepages-catalog-item-price"><span dir="ltr">2,400</span>₪</div>
<a onclick="return OfficeGuy.Apps.PurchasePages.ModifyCart(event, 'democo', 0, '', 'democat', '00000000-0000-4000-8000-000000000001', 1000000001, 1, true);">המשך</a>
<div class="og-purchasepages-catalog-item-name">פרוטוקל עד 60 תיקים &#x2B; כתת חנ&quot;מ</div>
<span dir="ltr">1,000</span>
<a onclick="return OfficeGuy.Apps.PurchasePages.ModifyCart(event, 'democo', 0, '', 'democat', '00000000-0000-4000-8000-000000000001', 1000000002, 1, true);">המשך</a>
`;

describe("parseSumitCatalogPage", () => {
  it("reads the items that appear on a catalog page", () => {
    expect(parseSumitCatalogPage(PAGE)).toEqual([
      { id: "1000000001", name: 'פרוטוקל עד 60 תיקים', priceIls: 2400 },
      {
        id: "1000000002",
        name: 'פרוטוקל עד 60 תיקים + כתת חנ"מ',
        priceIls: 1000,
      },
    ]);
  });

  it("extracts catalog key for admin grouping", () => {
    expect(
      sumitCatalogKeyFromUrl("https://pay.sumit.co.il/democo/democat/")
    ).toBe("democat");
    expect(
      sumitCatalogAdminLabel(
        "חינוך רגיל",
        "https://pay.sumit.co.il/democo/democat/"
      )
    ).toBe("חינוך רגיל · democat");
  });

  it("accepts only the public SUMIT pay host", () => {
    expect(
      isSumitPayCatalogUrl("https://pay.sumit.co.il/democo/democat/")
    ).toBe(true);
    expect(isSumitPayCatalogUrl("https://example.com/democo/democat/")).toBe(
      false
    );
    expect(isSumitPayCatalogUrl("http://pay.sumit.co.il/democo/democat/")).toBe(
      false
    );
  });
});
