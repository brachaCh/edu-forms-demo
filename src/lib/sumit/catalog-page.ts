export interface SumitCatalogPageItem {
  id: string;
  name: string;
  priceIls: number;
}

const ITEM_PATTERN =
  /og-purchasepages-catalog-item-name">([^<]*)<\/div>[\s\S]*?<span dir="ltr">([^<]*)<\/span>[\s\S]*?ModifyCart\(\s*event\s*,\s*'[^']*'\s*,\s*\d+\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*(\d+)\s*,/g;

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, digits: string) =>
      String.fromCodePoint(Number(digits))
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function priceFromCatalogText(value: string): number | null {
  const digits = value.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const price = Number(digits);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

/** מזהה את פריטי הקטלוג מתוך דף התשלום הציבורי של SUMIT. */
export function parseSumitCatalogPage(html: string): SumitCatalogPageItem[] {
  const items: SumitCatalogPageItem[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(ITEM_PATTERN)) {
    const id = match[3];
    const name = decodeHtml(match[1] ?? "");
    const priceIls = priceFromCatalogText(match[2] ?? "");
    if (!id || !name || priceIls == null || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, name, priceIls });
  }

  return items;
}

export function isSumitPayCatalogUrl(catalogUrl: string): boolean {
  try {
    const url = new URL(catalogUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname === "pay.sumit.co.il" &&
      segments.length >= 2
    );
  } catch {
    return false;
  }
}

export async function fetchSumitCatalogPageItems(
  _catalogUrl: string
): Promise<SumitCatalogPageItem[]> {
  return [];
}
